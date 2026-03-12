const config = require('./config');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db/queries');
const { testConnection: testDbConnection } = require('./db/pool');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const otplib = require('otplib');
const QRCode = require('qrcode');

const app = express();

const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8VS.wG.ZyWQ/2t6WvTDWv1Q5I8bHHy';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ============ SMTP CONFIGURATION ============

let smtpTransport = null;
if (config.smtpHost && config.smtpPort && config.smtpUser && config.smtpPass && config.smtpFrom) {
    smtpTransport = nodemailer.createTransport({
        host: config.smtpHost,
        port: parseInt(config.smtpPort, 10),
        secure: parseInt(config.smtpPort, 10) === 465,
        auth: {
            user: config.smtpUser,
            pass: config.smtpPass
        }
    });
}

async function sendEmail(to, subject, text) {
    if (!smtpTransport) return false;
    try {
        await smtpTransport.sendMail({
            from: config.smtpFrom,
            to,
            subject,
            text
        });
        return true;
    } catch (error) {
        console.error('Failed to send email:', error.message);
        return false;
    }
}

// ============ PAYPAL CONFIGURATION ============

let paypalClient = null;
let ordersController = null;
if (config.paypalClientId && config.paypalClientSecret) {
    try {
        const { Client, Environment, OrdersController } = require('@paypal/paypal-server-sdk');
        paypalClient = new Client({
            clientCredentialsAuthCredentials: {
                oAuthClientId: config.paypalClientId,
                oAuthClientSecret: config.paypalClientSecret,
            },
            environment: config.paypalSandbox ? Environment.Sandbox : Environment.Production,
        });
        ordersController = new OrdersController(paypalClient);
    } catch (error) {
        console.error('Warning: Failed to initialize PayPal SDK:', error.message);
        paypalClient = null;
        ordersController = null;
    }
}

// ============ ENCRYPTION ============

const ENCRYPTION_KEY = config.encryptionKey;
const ALGORITHM = 'aes-256-cbc';

function encryptString(value) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), encryptedData: encrypted };
}

function decryptString(encryptedData, iv) {
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ============ BRUTE-FORCE PROTECTION ============

const failedLoginAttempts = new Map();

const LOCKOUT_THRESHOLDS = [
    { attempts: 10, duration: 60 * 60 * 1000 },
    { attempts: 5,  duration: 15 * 60 * 1000 }
];

function getLoginLockStatus(username) {
    const key = username.toLowerCase();
    const record = failedLoginAttempts.get(key);
    if (!record) return { locked: false };

    if (record.lockedUntil && Date.now() < record.lockedUntil) {
        return { locked: true };
    }

    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
        record.lockedUntil = null;
        record.count = 0;
    }
    return { locked: false };
}

function recordFailedLogin(username) {
    const key = username.toLowerCase();
    const now = Date.now();
    let record = failedLoginAttempts.get(key);
    if (!record) {
        record = { count: 0, lockedUntil: null, lastAttempt: now };
        failedLoginAttempts.set(key, record);
    }
    record.count++;
    record.lastAttempt = now;
    let maxDuration = 0;
    for (const threshold of LOCKOUT_THRESHOLDS) {
        if (record.count >= threshold.attempts && threshold.duration > maxDuration) {
            maxDuration = threshold.duration;
        }
    }
    if (maxDuration > 0) {
        record.lockedUntil = now + maxDuration;
    }
}

function resetFailedLogins(username) {
    failedLoginAttempts.delete(username.toLowerCase());
}

setInterval(() => {
    const now = Date.now();
    const STALE_THRESHOLD = 60 * 60 * 1000;
    for (const [key, record] of failedLoginAttempts.entries()) {
        if (record.lockedUntil && now >= record.lockedUntil) {
            failedLoginAttempts.delete(key);
        } else if (!record.lockedUntil && (now - record.lastAttempt) > STALE_THRESHOLD) {
            failedLoginAttempts.delete(key);
        }
    }
}, 30 * 60 * 1000);

// ============ PASSWORD RESET CODE SYSTEM ============

const resetCodes = new Map();
const RESET_CODE_EXPIRY = 15 * 60 * 1000;
const resetAttempts = new Map();
const MAX_RESET_ATTEMPTS = 5;
const RESET_ATTEMPT_WINDOW = 15 * 60 * 1000;

function generateResetCode() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += alphabet[bytes[i] % alphabet.length];
    }
    return code;
}

function createResetCode(userId) {
    for (const [code, data] of resetCodes.entries()) {
        if (data.userId === userId) {
            resetCodes.delete(code);
        }
    }

    let code;
    do {
        code = generateResetCode();
    } while (resetCodes.has(code));

    resetCodes.set(code, {
        userId,
        createdAt: Date.now(),
        used: false
    });
    return code;
}

function consumeResetCode(code) {
    const data = resetCodes.get(code.toUpperCase());
    if (!data) return null;
    if (data.used) return null;
    if (Date.now() - data.createdAt > RESET_CODE_EXPIRY) {
        resetCodes.delete(code.toUpperCase());
        return null;
    }
    data.used = true;
    return data.userId;
}

function checkAndRecordResetAttempt(username, ip) {
    const key = `${username.toLowerCase()}|${ip}`;
    const now = Date.now();
    let record = resetAttempts.get(key);
    if (record && (now - record.firstAttempt) > RESET_ATTEMPT_WINDOW) {
        resetAttempts.delete(key);
        record = undefined;
    }
    if (record && record.count >= MAX_RESET_ATTEMPTS) {
        return false;
    }
    if (record) {
        record.count++;
    } else {
        resetAttempts.set(key, { count: 1, firstAttempt: now });
    }
    return true;
}

function clearResetAttempts(username) {
    const prefix = `${username.toLowerCase()}|`;
    for (const key of resetAttempts.keys()) {
        if (key.startsWith(prefix)) {
            resetAttempts.delete(key);
        }
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [code, data] of resetCodes.entries()) {
        if (now - data.createdAt > RESET_CODE_EXPIRY) {
            resetCodes.delete(code);
        }
    }
    for (const [key, record] of resetAttempts.entries()) {
        if (now - record.firstAttempt > RESET_ATTEMPT_WINDOW) {
            resetAttempts.delete(key);
        }
    }
}, 15 * 60 * 1000);

// ============ INVITE CODE SYSTEM ============

function generateInviteCode() {
    return crypto.randomBytes(6).toString('base64url').substring(0, 8).toUpperCase();
}

async function createInviteCodeHelper(createdBy) {
    for (let attempts = 0; attempts < 10; attempts++) {
        const code = generateInviteCode();
        const created = await db.createInviteCodeIfNotExists(code, createdBy);
        if (created) return created;
    }
    throw new Error('Failed to generate unique invite code after 10 attempts');
}

// Migration: Create initial admin user from env vars if no users exist
async function migrateInitialAdmin() {
    const allUsers = await db.getAllUsers();
    if (allUsers.length === 0) {
        const adminUsername = config.adminUsername;
        const adminPasswordHash = config.adminPasswordHash;

        if (adminPasswordHash) {
            await db.createUser({
                username: adminUsername,
                passwordHash: adminPasswordHash,
                role: 'admin',
                isActive: true
            });
            console.log(`Migrated admin user: ${adminUsername}`);
        }
    }
}

// ============ PENDING 2FA SESSIONS ============

const pending2FASessions = new Map();
const PENDING_2FA_EXPIRY = 5 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [token, session] of pending2FASessions.entries()) {
        if (now - session.createdAt > PENDING_2FA_EXPIRY) {
            pending2FASessions.delete(token);
        }
    }
}, 60 * 1000);

// ============ SECURITY MIDDLEWARE ============

app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://*.paypal.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://*.paypal.com"],
            imgSrc: ["'self'", "data:", "https://*.paypal.com", "https://*.paypalobjects.com"],
            frameSrc: ["https://*.paypal.com"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    }
}));
app.use(express.json());

// Block access to sensitive files and directories before static middleware
app.use((req, res, next) => {
    const requestPath = decodeURIComponent(req.path).toLowerCase();
    if (/\/\./.test(requestPath)) return res.status(404).end();
    const blocked = [
        '/server.js', '/config.js', '/package.json', '/package-lock.json',
        '/backup.sh', '/deploy.sh', '/rotate-encryption-key.js',
        '/db', '/ssl', '/node_modules'
    ];
    if (blocked.some(p => requestPath === p || requestPath.startsWith(p + '/'))) {
        return res.status(404).end();
    }
    next();
});

// ============ HTML PAGE SERVING ============

const htmlPages = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/login.html': 'login.html',
    '/register.html': 'register.html',
    '/forgot-password.html': 'forgot-password.html',
    '/learn.html': 'learn.html',
    '/lesson.html': 'lesson.html',
    '/profile.html': 'profile.html',
    '/leaderboard.html': 'leaderboard.html'
};

Object.entries(htmlPages).forEach(([route, file]) => {
    app.get(route, (req, res) => {
        const filePath = path.join(__dirname, file);
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(filePath);
    });
});

// ============ STATIC FILES ============

app.use(express.static(__dirname, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        if (path.extname(filePath).toLowerCase() === '.html') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

app.set('trust proxy', 1);

// ============ SESSION CONFIGURATION ============

app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV !== 'development',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ============ CSRF PROTECTION ============

app.get('/api/csrf-token', (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.json({ csrfToken: req.session.csrfToken });
});

app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    if (req.path === '/api/paypal/create-order' || req.path.startsWith('/api/paypal/capture-order/')) {
        return next();
    }
    const token = req.headers['x-csrf-token'];
    const sessionToken = req.session.csrfToken;
    if (!token || !sessionToken) {
        return res.status(403).json({ message: 'Invalid or missing CSRF token' });
    }
    try {
        const tokenBuffer = Buffer.from(token, 'hex');
        const sessionTokenBuffer = Buffer.from(sessionToken, 'hex');
        if (tokenBuffer.length !== sessionTokenBuffer.length ||
            !crypto.timingSafeEqual(tokenBuffer, sessionTokenBuffer)) {
            return res.status(403).json({ message: 'Invalid or missing CSRF token' });
        }
    } catch (e) {
        return res.status(403).json({ message: 'Invalid or missing CSRF token' });
    }
    next();
});

// ============ RATE LIMITING ============

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again later.' }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many registration attempts. Please try again later.' }
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'If an account with that username exists and has an email on file, a reset code has been sent.' }
});

const totpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts. Please try again later.' }
});

const paypalOrderLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many order requests. Please try again later.' }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' },
    skip: (req) => req.session && req.session.user
});

const lessonSubmitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many lesson submissions. Please try again later.' },
    keyGenerator: (req, res) => req.session?.user?.id?.toString() || rateLimit.ipKeyGenerator(req, res)
});

app.use('/api/', generalLimiter);

// ============ USER CACHE ============

const userCache = new Map();
const USER_CACHE_TTL = 5000;

function getCachedUser(id) {
    const key = Number(id);
    const cached = userCache.get(key);
    if (!cached) return undefined;
    if (Date.now() - cached.ts < USER_CACHE_TTL) return cached.user;
    userCache.delete(key);
    return undefined;
}

function setCachedUser(user) {
    userCache.set(Number(user.id), { user, ts: Date.now() });
}

function invalidateCachedUser(id) {
    userCache.delete(Number(id));
}

const _origUpdateUser = db.updateUser;
db.updateUser = async function(userId, ...args) {
    const result = await _origUpdateUser.call(this, userId, ...args);
    invalidateCachedUser(userId);
    return result;
};
const _origDeleteUser = db.deleteUser;
db.deleteUser = async function(userId, ...args) {
    invalidateCachedUser(userId);
    return _origDeleteUser.call(this, userId, ...args);
};

// ============ AUTH MIDDLEWARE ============

const requireAuth = async (req, res, next) => {
    if (req.session && req.session.user && req.session.user.id) {
        try {
            const userId = req.session.user.id;
            let user = getCachedUser(userId);
            if (user === undefined) {
                user = await db.findUserById(userId);
                if (user) setCachedUser(user);
            }
            if (user && user.isActive) {
                req.user = user;
                return next();
            }
            req.session.destroy();
            return res.status(401).json({ message: 'Session invalid. Please log in again.' });
        } catch (err) {
            console.error('Auth middleware DB error:', err.message);
            return res.status(503).json({ message: 'Service temporarily unavailable. Please try again.' });
        }
    }
    res.status(401).json({ message: 'Unauthorized' });
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Admin access required' });
};

// ============ AUTH ENDPOINTS ============

app.post('/api/login', loginLimiter, asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const lockStatus = getLoginLockStatus(username);
    if (lockStatus.locked) {
        await bcrypt.compare(password, DUMMY_HASH);
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = await db.findUserByUsername(username);

    const passwordValid = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (user && user.isActive && passwordValid) {
        resetFailedLogins(username);

        if (user.totpEnabled && user.totpSecret) {
            const tempToken = crypto.randomBytes(32).toString('hex');
            pending2FASessions.set(tempToken, {
                userId: user.id,
                createdAt: Date.now()
            });
            return res.json({ requires2FA: true, tempToken });
        }

        const userData = { id: user.id, username: user.username, role: user.role };

        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regeneration error:', err);
                return res.status(500).json({ message: 'Login failed' });
            }
            req.session.user = userData;
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ message: 'Login failed' });
                }
                res.json({ message: 'Login successful', user: userData });
            });
        });
    } else {
        recordFailedLogin(username);
        res.status(401).json({ message: 'Invalid credentials' });
    }
}));

app.post('/api/login/verify-2fa', totpLimiter, asyncHandler(async (req, res) => {
    const { tempToken, totpCode } = req.body;

    if (!tempToken || !totpCode || typeof tempToken !== 'string' || typeof totpCode !== 'string') {
        return res.status(400).json({ message: 'Token and code are required' });
    }

    const session2FA = pending2FASessions.get(tempToken);
    if (!session2FA) {
        return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
    }

    if (Date.now() - session2FA.createdAt > PENDING_2FA_EXPIRY) {
        pending2FASessions.delete(tempToken);
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    const user = await db.findUserById(session2FA.userId);
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
        pending2FASessions.delete(tempToken);
        return res.status(401).json({ message: 'Invalid session. Please log in again.' });
    }

    let secret;
    try {
        secret = decryptString(user.totpSecret.encryptedData, user.totpSecret.iv);
    } catch (e) {
        return res.status(500).json({ message: 'Authentication error' });
    }

    const code = totpCode.trim();
    let verified = false;

    try {
        const result = otplib.verifySync({ token: code, secret });
        verified = result.valid;
    } catch (e) {
        // Invalid token format, will try backup codes
    }

    if (!verified && code.length === 8 && user.backupCodes && user.backupCodes.length > 0) {
        for (let i = 0; i < user.backupCodes.length; i++) {
            try {
                if (await bcrypt.compare(code, user.backupCodes[i])) {
                    const updatedCodes = [...user.backupCodes];
                    updatedCodes.splice(i, 1);
                    await db.updateUser(user.id, { backupCodes: updatedCodes });
                    verified = true;
                    break;
                }
            } catch (e) {
                // Skip invalid hash
            }
        }
    }

    if (!verified) {
        return res.status(401).json({ message: 'Invalid verification code' });
    }

    pending2FASessions.delete(tempToken);

    const userData = { id: user.id, username: user.username, role: user.role };
    req.session.regenerate((err) => {
        if (err) {
            console.error('Session regeneration error:', err);
            return res.status(500).json({ message: 'Login failed' });
        }
        req.session.user = userData;
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ message: 'Login failed' });
            }
            res.json({ message: 'Login successful', user: userData });
        });
    });
}));

app.post('/api/register', registerLimiter, asyncHandler(async (req, res) => {
    const { username, email, password, confirmPassword, inviteCode } = req.body;

    if (!username || !email || !password || !confirmPassword || !inviteCode
        || typeof username !== 'string' || typeof email !== 'string'
        || typeof password !== 'string'
        || typeof confirmPassword !== 'string' || typeof inviteCode !== 'string') {
        return res.status(400).json({ message: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }
    if (email.length > 254 || /[<>]/.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    const invite = await db.findInviteCode(inviteCode);
    if (!invite || invite.isUsed) {
        return res.status(400).json({ message: 'Invalid or expired invite code' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ message: 'Username must be 3-30 characters' });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ message: 'Username can only contain letters, numbers, and underscores' });
    }

    if (await db.findUserByUsername(username)) {
        return res.status(409).json({ message: 'Username already taken' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await db.registerWithInviteCode(inviteCode, {
            username: username,
            email: encryptString(email),
            passwordHash: passwordHash,
            role: 'user',
            isActive: true,
            totpSecret: null,
            totpEnabled: false,
            backupCodes: []
        });

        if (!newUser) {
            return res.status(409).json({ message: 'Invalid or already used invite code' });
        }

        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role
            }
        });
    } catch (error) {
        await db.rollbackInviteCode(inviteCode);
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed' });
    }
}));

app.post('/api/forgot-password', forgotPasswordLimiter, asyncHandler(async (req, res) => {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
        return res.json({ message: 'If an account with that username exists and has an email on file, a reset code has been sent.' });
    }

    const genericMessage = 'If an account with that username exists and has an email on file, a reset code has been sent.';

    res.json({ message: genericMessage });

    setImmediate(async () => {
        try {
            const user = await db.findUserByUsername(username);
            if (user && user.isActive && user.email && smtpTransport) {
                const email = decryptString(user.email.encryptedData, user.email.iv);
                const code = createResetCode(user.id);
                sendEmail(
                    email,
                    'Password Reset Code - Not The Green Owl',
                    `Your password reset code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, you can safely ignore this email.`
                ).catch(error => {
                    console.error('Error sending reset email:', error.message);
                });
            }
        } catch (error) {
            console.error('Error in forgot-password flow:', error.message);
        }
    });
}));

app.post('/api/reset-password', loginLimiter, asyncHandler(async (req, res) => {
    const { username, code, newPassword } = req.body;

    if (!username || !code || !newPassword
        || typeof username !== 'string' || typeof code !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    if (!checkAndRecordResetAttempt(username, req.ip)) {
        return res.status(429).json({ message: 'Too many failed reset attempts. Please request a new code.' });
    }

    const user = await db.findUserByUsername(username);

    if (!user || !user.isActive) {
        return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    const userId = consumeResetCode(code);
    if (!userId || user.id !== userId) {
        return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    try {
        await db.updateUser(user.id, {
            passwordHash: await bcrypt.hash(newPassword, 10),
            updatedAt: new Date().toISOString()
        });

        resetFailedLogins(username);
        clearResetAttempts(username);

        res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Failed to reset password' });
    }
}));

// ============ USER ENDPOINTS ============

app.get('/api/user', requireAuth, asyncHandler(async (req, res) => {
    const response = {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        displayName: req.user.displayName || null,
        targetBand: req.user.targetBand || null,
        dailyGoalXp: req.user.dailyGoalXp || 50,
        preferredTrack: req.user.preferredTrack || 'academic',
        has2FA: !!req.user.totpEnabled
    };

    res.json(response);
}));

app.put('/api/user/profile', requireAuth, asyncHandler(async (req, res) => {
    const { displayName, targetBand, dailyGoalXp, preferredTrack } = req.body;

    const updates = { updatedAt: new Date().toISOString() };

    if (displayName !== undefined) {
        if (displayName !== null && typeof displayName !== 'string') {
            return res.status(400).json({ message: 'Invalid display name' });
        }
        if (displayName && displayName.length > 50) {
            return res.status(400).json({ message: 'Display name must be 50 characters or less' });
        }
        updates.displayName = displayName ? displayName.trim() : null;
    }

    if (targetBand !== undefined) {
        const band = parseFloat(targetBand);
        if (!Number.isFinite(band) || band < 1 || band > 9) {
            return res.status(400).json({ message: 'Target band must be between 1 and 9' });
        }
        const validBands = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
        if (!validBands.includes(band)) {
            return res.status(400).json({ message: 'Target band must be in 0.5 increments' });
        }
        updates.targetBand = band;
    }

    if (dailyGoalXp !== undefined) {
        const goal = parseInt(dailyGoalXp, 10);
        if (!Number.isFinite(goal) || goal < 10 || goal > 500) {
            return res.status(400).json({ message: 'Daily XP goal must be between 10 and 500' });
        }
        updates.dailyGoalXp = goal;
    }

    if (preferredTrack !== undefined) {
        const validTracks = ['academic', 'general'];
        if (!validTracks.includes(preferredTrack)) {
            return res.status(400).json({ message: 'Preferred track must be "academic" or "general"' });
        }
        updates.preferredTrack = preferredTrack;
    }

    await db.updateUser(req.user.id, updates);
    res.json({ message: 'Profile updated' });
}));

// ============ USER EMAIL ENDPOINTS ============

app.get('/api/user/email', requireAuth, (req, res) => {
    const hasEmail = !!(req.user.email && req.user.email.iv && req.user.email.encryptedData);
    let maskedEmail = null;

    if (hasEmail) {
        try {
            const email = decryptString(req.user.email.encryptedData, req.user.email.iv);
            const parts = email.split('@');
            if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
                maskedEmail = parts[0].charAt(0) + '***@' + parts[1];
            }
        } catch (e) {
            // Decryption failed
        }
    }

    res.json({ hasEmail, maskedEmail });
});

app.put('/api/user/email', requireAuth, asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (email === undefined) {
        return res.status(400).json({ message: 'Email field is required' });
    }

    if (email === '' || email === null) {
        await db.updateUser(req.user.id, { email: null, updatedAt: new Date().toISOString() });
        return res.json({ message: 'Email removed', hasEmail: false, maskedEmail: null });
    }

    if (typeof email !== 'string') {
        return res.status(400).json({ message: 'Invalid email' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }
    if (email.length > 254 || /[<>]/.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    const parts = email.split('@');
    const maskedEmail = parts[0].charAt(0) + '***@' + parts[1];

    await db.updateUser(req.user.id, { email: encryptString(email), updatedAt: new Date().toISOString() });
    res.json({ message: 'Email updated', hasEmail: true, maskedEmail });
}));

// ============ 2FA ENDPOINTS ============

app.get('/api/user/2fa/status', requireAuth, (req, res) => {
    res.json({
        enabled: !!req.user.totpEnabled,
        backupCodesRemaining: (req.user.backupCodes || []).length
    });
});

app.post('/api/user/2fa/setup', requireAuth, asyncHandler(async (req, res) => {
    if (req.user.totpEnabled) {
        return res.status(400).json({ message: 'Two-factor authentication is already enabled. Disable it first before setting up again.' });
    }

    const secret = otplib.generateSecret();
    const otpauth = otplib.generateURI({ label: req.user.username, issuer: 'NotTheGreenOwl', secret });

    try {
        const qrCode = await QRCode.toDataURL(otpauth);

        await db.updateUser(req.user.id, { totpSecret: encryptString(secret), updatedAt: new Date().toISOString() });

        res.json({ secret, qrCode });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ message: 'Failed to setup 2FA' });
    }
}));

app.post('/api/user/2fa/verify', requireAuth, asyncHandler(async (req, res) => {
    const { totpCode } = req.body;

    if (!totpCode || typeof totpCode !== 'string') {
        return res.status(400).json({ message: 'Verification code is required' });
    }

    if (!req.user.totpSecret) {
        return res.status(400).json({ message: 'Please start 2FA setup first' });
    }

    let secret;
    try {
        secret = decryptString(req.user.totpSecret.encryptedData, req.user.totpSecret.iv);
    } catch (e) {
        return res.status(500).json({ message: 'Failed to verify code' });
    }

    let isValid = false;
    try {
        isValid = otplib.verifySync({ token: totpCode.trim(), secret }).valid;
    } catch (e) {
        // Invalid token format
    }
    if (!isValid) {
        return res.status(400).json({ message: 'Invalid verification code' });
    }

    const backupCodes = [];
    const hashedCodes = [];
    for (let i = 0; i < 10; i++) {
        const code = crypto.randomBytes(4).toString('hex');
        backupCodes.push(code);
        hashedCodes.push(await bcrypt.hash(code, 10));
    }

    await db.updateUser(req.user.id, { totpEnabled: true, backupCodes: hashedCodes, updatedAt: new Date().toISOString() });

    res.json({ message: '2FA enabled successfully', backupCodes });
}));

app.post('/api/user/2fa/disable', requireAuth, asyncHandler(async (req, res) => {
    const { totpCode } = req.body;

    if (!totpCode || typeof totpCode !== 'string') {
        return res.status(400).json({ message: 'Current code is required to disable 2FA' });
    }

    if (!req.user.totpEnabled || !req.user.totpSecret) {
        return res.status(400).json({ message: '2FA is not enabled' });
    }

    let secret;
    try {
        secret = decryptString(req.user.totpSecret.encryptedData, req.user.totpSecret.iv);
    } catch (e) {
        return res.status(500).json({ message: 'Failed to verify code' });
    }

    let isValid = false;
    try {
        isValid = otplib.verifySync({ token: totpCode.trim(), secret }).valid;
    } catch (e) {
        // Invalid token format
    }
    if (!isValid) {
        return res.status(400).json({ message: 'Invalid verification code' });
    }

    await db.updateUser(req.user.id, { totpSecret: null, totpEnabled: false, backupCodes: [], updatedAt: new Date().toISOString() });

    res.json({ message: '2FA disabled successfully' });
}));

// ============ LOGOUT ============

const logoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many logout requests. Please try again later.' },
    keyGenerator: (req, res) => req.session?.user?.id?.toString() || rateLimit.ipKeyGenerator(req, res)
});

app.post('/api/logout', logoutLimiter, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session during logout:', err);
            return res.status(500).json({ message: 'Failed to log out' });
        }
        res.clearCookie('connect.sid');
        return res.json({ message: 'Logged out successfully' });
    });
});

// ============ PAYPAL ENDPOINTS ============

app.get('/api/paypal/config', (req, res) => {
    res.json({
        enabled: !!paypalClient,
        price: paypalClient ? config.inviteCodePrice : null,
        clientId: paypalClient ? config.paypalClientId : null
    });
});

app.post('/api/paypal/create-order', paypalOrderLimiter, asyncHandler(async (req, res) => {
    if (!ordersController) {
        return res.status(503).json({ message: 'PayPal payments are not configured' });
    }

    try {
        const amount = parseFloat(config.inviteCodePrice).toFixed(2);
        if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            return res.status(500).json({ message: 'Invalid price configuration' });
        }

        const { result } = await ordersController.createOrder({
            body: {
                intent: 'CAPTURE',
                purchaseUnits: [{
                    amount: {
                        currencyCode: 'BRL',
                        value: amount
                    },
                    description: 'Invite Code Purchase'
                }]
            }
        });

        await db.createPaypalOrder({
            orderId: result.id,
            amount,
            currency: 'BRL',
            status: result.status,
            userId: null
        });

        res.status(201).json({ orderId: result.id });
    } catch (error) {
        console.error('Error creating PayPal order:', error.message || error);
        res.status(500).json({ message: 'Failed to create PayPal order' });
    }
}));

app.post('/api/paypal/capture-order/:orderId', paypalOrderLimiter, asyncHandler(async (req, res) => {
    if (!ordersController) {
        return res.status(503).json({ message: 'PayPal payments are not configured' });
    }

    const { orderId } = req.params;

    if (!/^[A-Z0-9\-]{10,25}$/.test(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const order = await db.findPaypalOrder(orderId);
    if (!order) {
        return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status === 'COMPLETED' && order.inviteCode) {
        return res.json({ inviteCode: order.inviteCode });
    }

    try {
        const { result } = await ordersController.captureOrder({ id: orderId });

        if (result.status === 'COMPLETED') {
            const freshOrder = await db.findPaypalOrder(orderId);
            if (freshOrder.inviteCode) {
                return res.json({ inviteCode: freshOrder.inviteCode });
            }

            const newCode = await createInviteCodeHelper('paypal');
            const completed = await db.completePaypalOrder(orderId, newCode.code);

            if (!completed) {
                const existing = await db.findPaypalOrder(orderId);
                if (existing && existing.inviteCode) {
                    return res.json({ inviteCode: existing.inviteCode });
                }
                return res.status(500).json({ message: 'Failed to finalize PayPal order' });
            }

            return res.json({ inviteCode: newCode.code });
        }

        await db.updatePaypalOrderStatus(orderId, result.status);

        return res.status(400).json({ message: 'Payment not completed. Status: ' + result.status });
    } catch (error) {
        console.error('Error capturing PayPal order:', error.message || error);
        const statusCode = error.statusCode;
        if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
            res.status(400).json({ message: 'Failed to capture payment' });
        } else {
            res.status(500).json({ message: 'Failed to capture payment' });
        }
    }
}));

// ============ LEARNING API ENDPOINTS ============

app.get('/api/skills', requireAuth, asyncHandler(async (req, res) => {
    const skills = await db.getAllSkills();
    const progress = await db.getSkillProgressForUser(req.user.id);

    const progressMap = {};
    for (const p of progress) {
        progressMap[p.skillId] = p;
    }

    const result = skills.map(skill => ({
        ...skill,
        totalLessons: progressMap[skill.id] ? progressMap[skill.id].totalLessons : 0,
        completedLessons: progressMap[skill.id] ? progressMap[skill.id].completedLessons : 0,
        totalXpEarned: progressMap[skill.id] ? progressMap[skill.id].totalXpEarned : 0
    }));

    res.json(result);
}));

app.get('/api/skills/:id/levels', requireAuth, asyncHandler(async (req, res) => {
    const skillId = parseInt(req.params.id, 10);
    const skill = await db.getSkillById(skillId);
    if (!skill) {
        return res.status(404).json({ message: 'Skill not found' });
    }

    const levels = await db.getLevelsBySkill(skillId);
    const progress = await db.getSkillProgressForUser(req.user.id);
    const skillProgress = progress.find(p => p.skillId === skillId);
    const userXpInSkill = skillProgress ? skillProgress.totalXpEarned : 0;

    const result = levels.map(level => ({
        ...level,
        unlocked: userXpInSkill >= (level.unlockThreshold || 0)
    }));

    res.json(result);
}));

app.get('/api/levels/:id/lessons', requireAuth, asyncHandler(async (req, res) => {
    const levelId = parseInt(req.params.id, 10);
    const level = await db.getLevelById(levelId);
    if (!level) {
        return res.status(404).json({ message: 'Level not found' });
    }

    const lessons = await db.getLessonsByLevel(levelId);
    const userProgressList = await db.getUserProgressByLevel(req.user.id, levelId);

    const progressMap = {};
    for (const p of userProgressList) {
        progressMap[p.lessonId] = p;
    }

    const result = lessons.map(lesson => ({
        ...lesson,
        completed: progressMap[lesson.id] ? progressMap[lesson.id].completed : false,
        bestScore: progressMap[lesson.id] ? progressMap[lesson.id].bestScore : 0,
        attempts: progressMap[lesson.id] ? progressMap[lesson.id].attempts : 0
    }));

    res.json(result);
}));

app.get('/api/lessons/:id', requireAuth, asyncHandler(async (req, res) => {
    const lessonId = parseInt(req.params.id, 10);
    const lesson = await db.getLessonById(lessonId);
    if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
    }

    const exercises = await db.getExercisesByLesson(lessonId);

    const sanitizedExercises = exercises.map(ex => ({
        id:           ex.id,
        lessonId:     ex.lessonId,
        exerciseType: ex.exerciseType,
        questionJson: ex.questionJson,
        points:       ex.points,
        explanation:  ex.explanation,
        sortOrder:    ex.sortOrder
    }));

    res.json({
        lesson,
        exercises: sanitizedExercises
    });
}));

// ============ EXERCISE SCORING HELPERS ============

function scoreExercise(exercise, userAnswer) {
    const type = exercise.exerciseType;
    const correctAnswer = exercise.answerJson;
    const questionData = exercise.questionJson;
    const points = exercise.points || 10;

    switch (type) {
        case 'multiple_choice': {
            const correct = String(correctAnswer).trim().toLowerCase();
            const given = String(userAnswer).trim().toLowerCase();
            const isCorrect = correct === given;
            return { isCorrect, pointsEarned: isCorrect ? points : 0 };
        }

        case 'fill_blank': {
            const given = String(userAnswer).trim().toLowerCase();
            const correct = String(correctAnswer).trim().toLowerCase();
            if (given === correct) {
                return { isCorrect: true, pointsEarned: points };
            }
            const alternatives = questionData && questionData.alternatives;
            if (Array.isArray(alternatives)) {
                const altMatch = alternatives.some(
                    alt => String(alt).trim().toLowerCase() === given
                );
                if (altMatch) {
                    return { isCorrect: true, pointsEarned: points };
                }
            }
            return { isCorrect: false, pointsEarned: 0 };
        }

        case 'true_false_ng': {
            const correct = String(correctAnswer).trim().toLowerCase();
            const given = String(userAnswer).trim().toLowerCase();
            const isCorrect = correct === given;
            return { isCorrect, pointsEarned: isCorrect ? points : 0 };
        }

        case 'matching': {
            if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) {
                return { isCorrect: false, pointsEarned: 0 };
            }
            // Frontend sends array of selected option strings (one per item, in order).
            // Correct answer is also an array of strings in the expected order.
            const isCorrect = userAnswer.length === correctAnswer.length &&
                userAnswer.every((val, i) =>
                    String(val).trim().toLowerCase() === String(correctAnswer[i]).trim().toLowerCase()
                );
            return { isCorrect, pointsEarned: isCorrect ? points : 0 };
        }

        case 'short_answer': {
            const given = String(userAnswer).trim().toLowerCase();
            const correct = String(correctAnswer).trim().toLowerCase();
            if (given === correct) {
                return { isCorrect: true, pointsEarned: points };
            }
            const alternatives = questionData && questionData.alternatives;
            if (Array.isArray(alternatives)) {
                const altMatch = alternatives.some(
                    alt => String(alt).trim().toLowerCase() === given
                );
                if (altMatch) {
                    return { isCorrect: true, pointsEarned: points };
                }
            }
            return { isCorrect: false, pointsEarned: 0 };
        }

        case 'ordering': {
            if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) {
                return { isCorrect: false, pointsEarned: 0 };
            }
            const isCorrect = userAnswer.length === correctAnswer.length &&
                userAnswer.every((item, i) => String(item).trim() === String(correctAnswer[i]).trim());
            return { isCorrect, pointsEarned: isCorrect ? points : 0 };
        }

        case 'essay_prompt':
        case 'speaking_prompt': {
            const selfScore = parseInt(userAnswer, 10);
            if (Number.isFinite(selfScore) && selfScore >= 0 && selfScore <= points) {
                return { isCorrect: selfScore > 0, pointsEarned: selfScore };
            }
            return { isCorrect: false, pointsEarned: 0 };
        }

        default:
            return { isCorrect: false, pointsEarned: 0 };
    }
}

app.post('/api/lessons/:id/submit', requireAuth, lessonSubmitLimiter, asyncHandler(async (req, res) => {
    const lessonId = parseInt(req.params.id, 10);
    const lesson = await db.getLessonById(lessonId);
    if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
    }

    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ message: 'Answers array is required' });
    }

    const exercises = await db.getExercisesByLesson(lessonId);
    if (exercises.length === 0) {
        return res.status(400).json({ message: 'No exercises found for this lesson' });
    }

    const exerciseMap = {};
    for (const ex of exercises) {
        exerciseMap[ex.id] = ex;
    }

    let totalScore = 0;
    let totalPoints = 0;
    const scoredAnswers = [];

    for (const exercise of exercises) {
        totalPoints += exercise.points || 10;
    }

    for (const answer of answers) {
        const exercise = exerciseMap[answer.exerciseId];
        if (!exercise) continue;

        const result = scoreExercise(exercise, answer.answer);
        totalScore += result.pointsEarned;

        scoredAnswers.push({
            exerciseId: exercise.id,
            isCorrect: result.isCorrect,
            pointsEarned: result.pointsEarned,
            answer: answer.answer
        });

        await db.saveUserExerciseAnswer(req.user.id, exercise.id, lessonId, {
            answerJson: answer.answer,
            isCorrect: result.isCorrect,
            pointsEarned: result.pointsEarned
        });
    }

    const percentage = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0;

    const xpReward = lesson.xpReward || 20;
    const xpEarned = Math.round(xpReward * (percentage / 100));

    const existingProgress = await db.getUserProgress(req.user.id, lessonId);
    const previousBest = existingProgress ? existingProgress.bestScore : 0;

    await db.upsertUserProgress(req.user.id, lessonId, {
        completed: true,
        score: percentage,
        bestScore: percentage,
        attempts: 1,
        xpEarned: xpEarned
    });

    const today = new Date().toISOString().split('T')[0];
    await db.upsertDailyActivity(req.user.id, today, xpEarned, 1);

    const stats = await db.getUserStats(req.user.id);
    const lastDate = stats.lastActivityDate ? stats.lastActivityDate.split('T')[0] : null;

    let newStreak = stats.currentStreak;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === today) {
        // Already active today, streak unchanged
    } else if (lastDate === yesterdayStr) {
        newStreak = stats.currentStreak + 1;
    } else {
        newStreak = 1;
    }

    const newLongest = Math.max(stats.longestStreak, newStreak);

    const isFirstCompletion = !existingProgress || !existingProgress.completed;

    await db.updateUserStats(req.user.id, {
        totalXp: stats.totalXp + xpEarned,
        currentStreak: newStreak,
        longestStreak: newLongest,
        lessonsCompleted: stats.lessonsCompleted + (isFirstCompletion ? 1 : 0),
        lastActivityDate: today
    });

    const newAchievements = await checkAndGrantAchievements(req.user.id);

    res.json({
        score: totalScore,
        totalPoints,
        percentage,
        xpEarned,
        newAchievements,
        streakInfo: {
            currentStreak: newStreak,
            longestStreak: newLongest
        }
    });
}));

// ============ DASHBOARD ============

app.get('/api/dashboard', requireAuth, asyncHandler(async (req, res) => {
    const skillProgress = await db.getSkillProgressForUser(req.user.id);
    const stats = await db.getUserStats(req.user.id);

    const SKILL_WEIGHTS = {
        listening: 0.25,
        reading: 0.25,
        writing: 0.25,
        speaking: 0.25
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const sp of skillProgress) {
        const slug = sp.skillSlug || sp.skillName.toLowerCase();
        const weight = SKILL_WEIGHTS[slug] || 0.25;
        const completionRate = sp.totalLessons > 0 ? sp.completedLessons / sp.totalLessons : 0;

        const band = 1 + completionRate * 8;
        weightedSum += band * weight;
        totalWeight += weight;
    }

    let bandEstimate = totalWeight > 0 ? weightedSum / totalWeight : 1;
    bandEstimate = Math.round(bandEstimate * 2) / 2;
    bandEstimate = Math.max(1, Math.min(9, bandEstimate));

    const perSkillProgress = skillProgress.map(sp => ({
        skillId: sp.skillId,
        skillName: sp.skillName,
        skillSlug: sp.skillSlug,
        totalLessons: sp.totalLessons,
        completedLessons: sp.completedLessons,
        totalXpEarned: sp.totalXpEarned,
        completionRate: sp.totalLessons > 0 ? Math.round((sp.completedLessons / sp.totalLessons) * 100) : 0
    }));

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const recentActivity = await db.getDailyActivity(req.user.id, sevenDaysAgoStr, todayStr);

    const todayActivity = recentActivity.find(a => {
        const actDate = a.activityDate ? a.activityDate.split('T')[0] : null;
        return actDate === todayStr;
    });
    const todayXp = todayActivity ? todayActivity.xpEarned : 0;
    const dailyGoal = req.user.dailyGoalXp || 50;

    res.json({
        bandEstimate,
        perSkillProgress,
        streakInfo: {
            currentStreak: stats.currentStreak,
            longestStreak: stats.longestStreak,
            lastActivityDate: stats.lastActivityDate
        },
        dailyGoalProgress: {
            todayXp,
            dailyGoal,
            percentage: Math.min(100, Math.round((todayXp / dailyGoal) * 100))
        },
        recentActivity
    });
}));

// ============ STATS ============

app.get('/api/stats', requireAuth, asyncHandler(async (req, res) => {
    const stats = await db.getUserStats(req.user.id);
    res.json(stats);
}));

app.get('/api/stats/daily', requireAuth, asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days, 10) || 30;
    const clampedDays = Math.min(Math.max(days, 1), 365);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - clampedDays);
    const startDateStr = startDate.toISOString().split('T')[0];

    const activity = await db.getDailyActivity(req.user.id, startDateStr, endDate);
    res.json(activity);
}));

// ============ ACHIEVEMENTS ============

app.get('/api/achievements', requireAuth, asyncHandler(async (req, res) => {
    const allAchievements = await db.getAllAchievements();
    const userAchievements = await db.getUserAchievements(req.user.id);

    const earnedMap = {};
    for (const ua of userAchievements) {
        earnedMap[ua.achievementId] = ua.earnedAt;
    }

    const result = allAchievements.map(a => ({
        ...a,
        earned: !!earnedMap[a.id],
        earnedAt: earnedMap[a.id] || null
    }));

    res.json(result);
}));

// ============ LEADERBOARD ============

app.get('/api/leaderboard', requireAuth, asyncHandler(async (req, res) => {
    const leaderboard = await db.getLeaderboard(20);
    res.json(leaderboard);
}));

app.get('/api/leaderboard/weekly', requireAuth, asyncHandler(async (req, res) => {
    const leaderboard = await db.getWeeklyLeaderboard(20);
    res.json(leaderboard);
}));

// ============ ADMIN ENDPOINTS ============

app.get('/api/admin/users', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const allUsers = await db.getAllUsers();

    const sanitizedUsers = allUsers.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        displayName: u.displayName || null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        isActive: u.isActive,
        hasEmail: !!(u.email && u.email.iv && u.email.encryptedData),
        has2FA: !!u.totpEnabled
    }));
    res.json(sanitizedUsers);
}));

app.post('/api/admin/invite-codes', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    try {
        const inviteCode = await createInviteCodeHelper(req.user.id);
        res.status(201).json({ code: inviteCode.code, createdAt: inviteCode.createdAt });
    } catch (error) {
        console.error('Error generating invite code:', error);
        res.status(500).json({ message: 'Failed to generate invite code' });
    }
}));

app.get('/api/admin/invite-codes', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const allCodes = await db.getAllInviteCodes();
    const allUsers = await db.getAllUsers();
    const usersById = {};
    allUsers.forEach(u => { usersById[u.id] = u; });

    const codesWithDetails = allCodes.map(ic => {
        const creatorId = parseInt(ic.createdBy, 10);
        const creator = (ic.createdBy === 'paypal' || ic.createdBy === 'pix') ? null : usersById[creatorId];
        const consumer = ic.usedBy ? usersById[ic.usedBy] : null;
        return {
            code: ic.code,
            createdAt: ic.createdAt,
            createdByUsername: ic.createdBy === 'paypal'
                ? 'PayPal Purchase'
                : ic.createdBy === 'pix'
                    ? 'PIX Purchase'
                    : (creator ? creator.username : 'Unknown'),
            isUsed: ic.isUsed,
            usedAt: ic.usedAt,
            usedByUsername: consumer ? consumer.username : null
        };
    });
    res.json(codesWithDetails);
}));

app.delete('/api/admin/invite-codes/:code', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const ic = await db.findInviteCode(code);

    if (!ic) {
        return res.status(404).json({ message: 'Invite code not found' });
    }
    if (ic.isUsed) {
        return res.status(400).json({ message: 'Cannot delete a used invite code' });
    }

    await db.deleteInviteCode(code);
    res.json({ message: 'Invite code deleted' });
}));

// ============ ACHIEVEMENT CHECKING HELPER ============

async function checkAndGrantAchievements(userId) {
    const stats = await db.getUserStats(userId);
    const allAchievements = await db.getAllAchievements();
    const userAchievements = await db.getUserAchievements(userId);

    const earnedSlugs = new Set(userAchievements.map(ua => ua.slug));
    const newAchievements = [];

    const skillProgress = await db.getSkillProgressForUser(userId);

    const SKILL_WEIGHTS = {
        listening: 0.25,
        reading: 0.25,
        writing: 0.25,
        speaking: 0.25
    };

    let weightedSum = 0;
    let totalWeight = 0;
    for (const sp of skillProgress) {
        const slug = sp.skillSlug || sp.skillName.toLowerCase();
        const weight = SKILL_WEIGHTS[slug] || 0.25;
        const completionRate = sp.totalLessons > 0 ? sp.completedLessons / sp.totalLessons : 0;
        const band = 1 + completionRate * 8;
        weightedSum += band * weight;
        totalWeight += weight;
    }
    let estimatedBand = totalWeight > 0 ? weightedSum / totalWeight : 1;
    estimatedBand = Math.round(estimatedBand * 2) / 2;
    estimatedBand = Math.max(1, Math.min(9, estimatedBand));

    const { pool } = require('./db/pool');
    const { rows: perfectRows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM user_progress
         WHERE user_id = $1 AND best_score >= 100 AND completed = TRUE`,
        [userId]
    );
    const hasPerfectScore = perfectRows[0].count > 0;

    const skillBeginnerComplete = {};
    for (const sp of skillProgress) {
        const slug = sp.skillSlug || sp.skillName.toLowerCase();
        const { rows: beginnerLevels } = await pool.query(
            `SELECT lv.id FROM levels lv WHERE lv.skill_id = $1 ORDER BY lv.sort_order LIMIT 1`,
            [sp.skillId]
        );
        if (beginnerLevels.length > 0) {
            const beginnerLevelId = beginnerLevels[0].id;
            const { rows: lessonRows } = await pool.query(
                `SELECT l.id FROM lessons l WHERE l.level_id = $1`,
                [beginnerLevelId]
            );
            const { rows: completedRows } = await pool.query(
                `SELECT COUNT(*)::int AS count FROM user_progress up
                 JOIN lessons l ON l.id = up.lesson_id
                 WHERE up.user_id = $1 AND l.level_id = $2 AND up.completed = TRUE`,
                [userId, beginnerLevelId]
            );
            skillBeginnerComplete[slug] = lessonRows.length > 0 && completedRows[0].count >= lessonRows.length;
        }
    }

    for (const achievement of allAchievements) {
        if (earnedSlugs.has(achievement.slug)) continue;

        let shouldGrant = false;
        const name = achievement.name || achievement.slug;

        switch (name) {
            case 'first_lesson':
                shouldGrant = stats.lessonsCompleted >= 1;
                break;
            case 'streak_3':
                shouldGrant = stats.currentStreak >= 3;
                break;
            case 'streak_7':
                shouldGrant = stats.currentStreak >= 7;
                break;
            case 'streak_30':
                shouldGrant = stats.currentStreak >= 30;
                break;
            case 'xp_100':
                shouldGrant = stats.totalXp >= 100;
                break;
            case 'xp_500':
                shouldGrant = stats.totalXp >= 500;
                break;
            case 'xp_1000':
                shouldGrant = stats.totalXp >= 1000;
                break;
            case 'xp_5000':
                shouldGrant = stats.totalXp >= 5000;
                break;
            case 'perfect_score':
                shouldGrant = hasPerfectScore;
                break;
            case 'listening_beginner':
                shouldGrant = !!skillBeginnerComplete['listening'];
                break;
            case 'reading_beginner':
                shouldGrant = !!skillBeginnerComplete['reading'];
                break;
            case 'writing_beginner':
                shouldGrant = !!skillBeginnerComplete['writing'];
                break;
            case 'speaking_beginner':
                shouldGrant = !!skillBeginnerComplete['speaking'];
                break;
            case 'band_5':
                shouldGrant = estimatedBand >= 5;
                break;
            case 'band_6':
                shouldGrant = estimatedBand >= 6;
                break;
            case 'band_7':
                shouldGrant = estimatedBand >= 7;
                break;
            case 'band_8':
                shouldGrant = estimatedBand >= 8;
                break;
            default:
                break;
        }

        if (shouldGrant) {
            const granted = await db.grantAchievement(userId, achievement.id);
            if (granted) {
                newAchievements.push({
                    id: achievement.id,
                    name: achievement.name,
                    slug: achievement.slug,
                    description: achievement.description,
                    iconUrl: achievement.iconUrl
                });
            }
        }
    }

    return newAchievements;
}

// ============ ERROR HANDLERS ============

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Invalid JSON in request body' });
    }
    console.error('Unhandled error:', err.message);
    res.status(err.status || 500).json({ message: 'Internal server error' });
});

// ============ SERVER STARTUP ============

const PORT = config.port;

(async () => {
    try {
        await testDbConnection();
        await migrateInitialAdmin();
    } catch (err) {
        console.error('FATAL: Database initialization failed:', err.message);
        process.exit(1);
    }

    const sslKeyPath = path.join(__dirname, 'ssl', 'key.pem');
    const sslCertPath = path.join(__dirname, 'ssl', 'cert.pem');

    if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
        const sslOptions = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath)
        };
        https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on https://localhost:${PORT}`);
            logStartupInfo();
        });
    } else {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on http://localhost:${PORT}`);
            logStartupInfo();
        });
    }

    setInterval(async () => {
        try {
            await db.cleanupExpiredPaypalOrders(24 * 60 * 60 * 1000);
        } catch (err) {
            console.error('Error cleaning up expired PayPal orders:', err.message);
        }
    }, 60 * 60 * 1000);
})();

function logStartupInfo() {
    if (smtpTransport) {
        console.log('SMTP configured — self-service password reset is available.');
    } else {
        console.log('No SMTP configured — password resets require admin action.');
    }

    if (paypalClient) {
        console.log(`PayPal configured — invite code purchases available at R$ ${config.inviteCodePrice}`);
    } else {
        console.log('No PayPal configured — invite code purchases disabled.');
    }
}
