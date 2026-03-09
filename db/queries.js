const { pool } = require('./pool');

// ── Helpers ──────────────────────────────────────────────────────────

function parseJsonField(val) {
    if (val == null) return null;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (err) {
        console.error('Failed to parse JSON field:', err.message, '— value preview:', String(val).slice(0, 50));
        return null;
    }
}

function stringifyJsonField(val) {
    if (val == null) return null;
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
}

/**
 * Convert a snake_case DB row to a camelCase JS user object.
 * JSON-parses encrypted TEXT fields back to {iv, encryptedData} objects.
 */
function dbRowToUser(row) {
    if (!row) return null;
    const user = {
        id:             Number(row.id),
        username:       row.username,
        passwordHash:   row.password_hash,
        role:           row.role,
        email:          parseJsonField(row.email),
        displayName:    row.display_name,
        targetBand:     row.target_band,
        dailyGoalXp:    row.daily_goal_xp,
        preferredTrack: row.preferred_track,
        totpSecret:     parseJsonField(row.totp_secret),
        totpEnabled:    row.totp_enabled,
        backupCodes:    row.backup_codes || [],
        isActive:       row.is_active,
        createdAt:      row.created_at ? row.created_at.toISOString() : null,
        updatedAt:      row.updated_at ? row.updated_at.toISOString() : null
    };
    return user;
}

// ── User Queries ─────────────────────────────────────────────────────

async function findUserByUsername(username) {
    const { rows } = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
    );
    return dbRowToUser(rows[0]);
}

async function findUserById(id) {
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return dbRowToUser(rows[0]);
    } catch (err) {
        console.error(`DB findUserById failed: id=${id} — ${err.message}`);
        throw err;
    }
}

async function getAllUsers() {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
    return rows.map(dbRowToUser);
}

async function createUser(fields) {
    const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, role, email, display_name, target_band,
         daily_goal_xp, preferred_track, totp_secret, totp_enabled, backup_codes,
         is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
            fields.username,
            fields.passwordHash,
            fields.role || 'user',
            stringifyJsonField(fields.email),
            fields.displayName || null,
            fields.targetBand || null,
            fields.dailyGoalXp || null,
            fields.preferredTrack || null,
            stringifyJsonField(fields.totpSecret),
            fields.totpEnabled || false,
            fields.backupCodes || [],
            fields.isActive !== undefined ? fields.isActive : true,
            fields.createdAt || new Date().toISOString(),
            fields.updatedAt || new Date().toISOString()
        ]
    );
    return dbRowToUser(rows[0]);
}

async function registerWithInviteCode(inviteCode, userFields) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Atomically consume the invite code
        const { rowCount } = await client.query(
            `UPDATE invite_codes SET is_used = TRUE, used_at = NOW()
             WHERE code = $1 AND is_used = FALSE`,
            [inviteCode.toUpperCase()]
        );
        if (rowCount === 0) {
            await client.query('ROLLBACK');
            return null;
        }
        // Create the user
        const { rows } = await client.query(
            `INSERT INTO users (username, password_hash, role, email, totp_secret, totp_enabled, backup_codes, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
                userFields.username,
                userFields.passwordHash,
                userFields.role || 'user',
                stringifyJsonField(userFields.email),
                stringifyJsonField(userFields.totpSecret),
                userFields.totpEnabled || false,
                userFields.backupCodes || [],
                userFields.isActive !== undefined ? userFields.isActive : true
            ]
        );
        const newUser = dbRowToUser(rows[0]);
        // Set used_by on the invite code
        await client.query(
            'UPDATE invite_codes SET used_by = $1 WHERE code = $2',
            [newUser.id, inviteCode.toUpperCase()]
        );
        await client.query('COMMIT');
        return newUser;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Column allowlist for dynamic SET
const USER_COLUMN_MAP = {
    username:        'username',
    passwordHash:    'password_hash',
    role:            'role',
    email:           { col: 'email',           json: true },
    displayName:     'display_name',
    targetBand:      'target_band',
    dailyGoalXp:     'daily_goal_xp',
    preferredTrack:  'preferred_track',
    totpSecret:      { col: 'totp_secret',     json: true },
    totpEnabled:     'totp_enabled',
    backupCodes:     'backup_codes',
    isActive:        'is_active',
    updatedAt:       'updated_at'
};

async function updateUser(userId, updates) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [jsKey, value] of Object.entries(updates)) {
        const mapping = USER_COLUMN_MAP[jsKey];
        if (!mapping) continue;

        let col, val;
        if (typeof mapping === 'string') {
            col = mapping;
            val = value;
        } else {
            col = mapping.col;
            val = mapping.json ? stringifyJsonField(value) : value;
        }
        setClauses.push(`${col} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
    }

    if (setClauses.length === 0) return null;

    values.push(userId);
    const { rows } = await pool.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return dbRowToUser(rows[0]);
}

async function deleteUser(userId) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

async function getActiveAdminCount() {
    const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = TRUE"
    );
    return rows[0].count;
}

async function getAdminCount() {
    const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'"
    );
    return rows[0].count;
}

// ── Invite Code Queries ──────────────────────────────────────────────

async function findInviteCode(code) {
    const { rows } = await pool.query(
        'SELECT * FROM invite_codes WHERE code = $1',
        [code.toUpperCase()]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        code:      row.code,
        createdAt: row.created_at ? row.created_at.toISOString() : null,
        createdBy: row.created_by,
        isUsed:    row.is_used,
        usedAt:    row.used_at ? row.used_at.toISOString() : null,
        usedBy:    row.used_by != null ? Number(row.used_by) : null
    };
}

async function createInviteCode(code, createdBy) {
    const { rows } = await pool.query(
        'INSERT INTO invite_codes (code, created_by) VALUES ($1, $2) RETURNING *',
        [code, String(createdBy)]
    );
    const row = rows[0];
    return {
        code:      row.code,
        createdAt: row.created_at.toISOString(),
        createdBy: row.created_by,
        isUsed:    row.is_used,
        usedAt:    null,
        usedBy:    null
    };
}

async function createInviteCodeIfNotExists(code, createdBy) {
    const { rows } = await pool.query(
        'INSERT INTO invite_codes (code, created_by) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING RETURNING *',
        [code, String(createdBy)]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        code:      row.code,
        createdAt: row.created_at.toISOString(),
        createdBy: row.created_by,
        isUsed:    row.is_used,
        usedAt:    null,
        usedBy:    null
    };
}

async function consumeInviteCode(code, usedBy) {
    const { rowCount } = await pool.query(
        `UPDATE invite_codes SET is_used = TRUE, used_at = NOW(), used_by = $1
         WHERE code = $2 AND is_used = FALSE`,
        [usedBy, code.toUpperCase()]
    );
    return rowCount > 0;
}

async function rollbackInviteCode(code) {
    await pool.query(
        'UPDATE invite_codes SET is_used = FALSE, used_at = NULL WHERE code = $1 AND used_by IS NULL',
        [code.toUpperCase()]
    );
}

async function deleteInviteCode(code) {
    await pool.query('DELETE FROM invite_codes WHERE code = $1', [code.toUpperCase()]);
}

async function getAllInviteCodes() {
    const { rows } = await pool.query('SELECT * FROM invite_codes ORDER BY created_at DESC');
    return rows.map(row => ({
        code:      row.code,
        createdAt: row.created_at ? row.created_at.toISOString() : null,
        createdBy: row.created_by,
        isUsed:    row.is_used,
        usedAt:    row.used_at ? row.used_at.toISOString() : null,
        usedBy:    row.used_by != null ? Number(row.used_by) : null
    }));
}

// ── PayPal Order Queries ─────────────────────────────────────────────

function dbRowToPaypalOrder(row) {
    if (!row) return null;
    return {
        orderId:     row.order_id,
        amount:      parseFloat(row.amount),
        currency:    row.currency,
        status:      row.status,
        inviteCode:  row.invite_code,
        userId:      row.user_id != null ? Number(row.user_id) : null,
        createdAt:   row.created_at ? row.created_at.toISOString() : null,
        confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null
    };
}

async function createPaypalOrder({ orderId, amount, currency, status, userId }) {
    const { rows } = await pool.query(
        `INSERT INTO paypal_orders (order_id, amount, currency, status, user_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [orderId, amount, currency || 'BRL', status, userId || null]
    );
    return dbRowToPaypalOrder(rows[0]);
}

async function findPaypalOrder(orderId) {
    const { rows } = await pool.query(
        'SELECT * FROM paypal_orders WHERE order_id = $1',
        [orderId]
    );
    return dbRowToPaypalOrder(rows[0]);
}

async function completePaypalOrder(orderId, inviteCode) {
    const { rows } = await pool.query(
        `UPDATE paypal_orders SET status = 'COMPLETED', invite_code = $1, confirmed_at = NOW()
         WHERE order_id = $2 AND invite_code IS NULL RETURNING *`,
        [inviteCode, orderId]
    );
    return dbRowToPaypalOrder(rows[0]);
}

async function updatePaypalOrderStatus(orderId, status) {
    await pool.query(
        'UPDATE paypal_orders SET status = $1 WHERE order_id = $2',
        [status, orderId]
    );
}

async function cleanupExpiredPaypalOrders(maxAgeMs) {
    await pool.query(
        `DELETE FROM paypal_orders
         WHERE status != 'COMPLETED'
           AND created_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')`,
        [maxAgeMs]
    );
}

// ── Learning Queries ─────────────────────────────────────────────────

async function getAllSkills() {
    const { rows } = await pool.query('SELECT * FROM skills ORDER BY sort_order');
    return rows.map(row => ({
        id:          Number(row.id),
        name:        row.name,
        slug:        row.slug,
        description: row.description,
        iconUrl:     row.icon_url,
        sortOrder:   row.sort_order,
        createdAt:   row.created_at ? row.created_at.toISOString() : null
    }));
}

async function getSkillById(id) {
    const { rows } = await pool.query('SELECT * FROM skills WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id:          Number(row.id),
        name:        row.name,
        slug:        row.slug,
        description: row.description,
        iconUrl:     row.icon_url,
        sortOrder:   row.sort_order,
        createdAt:   row.created_at ? row.created_at.toISOString() : null
    };
}

async function getLevelsBySkill(skillId) {
    const { rows } = await pool.query(
        'SELECT * FROM levels WHERE skill_id = $1 ORDER BY sort_order',
        [skillId]
    );
    return rows.map(row => ({
        id:          Number(row.id),
        skillId:     Number(row.skill_id),
        name:        row.name,
        slug:        row.slug,
        description: row.description,
        sortOrder:   row.sort_order,
        createdAt:   row.created_at ? row.created_at.toISOString() : null
    }));
}

async function getLevelById(id) {
    const { rows } = await pool.query('SELECT * FROM levels WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id:          Number(row.id),
        skillId:     Number(row.skill_id),
        name:        row.name,
        slug:        row.slug,
        description: row.description,
        sortOrder:   row.sort_order,
        createdAt:   row.created_at ? row.created_at.toISOString() : null
    };
}

async function getLessonsByLevel(levelId) {
    const { rows } = await pool.query(
        'SELECT * FROM lessons WHERE level_id = $1 ORDER BY sort_order',
        [levelId]
    );
    return rows.map(row => ({
        id:          Number(row.id),
        levelId:     Number(row.level_id),
        title:       row.title,
        slug:        row.slug,
        description: row.description,
        xpReward:    row.xp_reward,
        sortOrder:   row.sort_order,
        createdAt:   row.created_at ? row.created_at.toISOString() : null
    }));
}

async function getLessonById(id) {
    const { rows } = await pool.query('SELECT * FROM lessons WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id:          Number(row.id),
        levelId:     Number(row.level_id),
        title:       row.title,
        slug:        row.slug,
        description: row.description,
        xpReward:    row.xp_reward,
        sortOrder:   row.sort_order,
        createdAt:   row.created_at ? row.created_at.toISOString() : null
    };
}

async function getExercisesByLesson(lessonId) {
    const { rows } = await pool.query(
        'SELECT * FROM exercises WHERE lesson_id = $1 ORDER BY sort_order',
        [lessonId]
    );
    return rows.map(row => ({
        id:           Number(row.id),
        lessonId:     Number(row.lesson_id),
        type:         row.type,
        prompt:       row.prompt,
        options:      parseJsonField(row.options),
        correctAnswer: row.correct_answer,
        explanation:  row.explanation,
        points:       row.points,
        sortOrder:    row.sort_order,
        createdAt:    row.created_at ? row.created_at.toISOString() : null
    }));
}

async function getUserProgress(userId, lessonId) {
    const { rows } = await pool.query(
        'SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
        [userId, lessonId]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id:         Number(row.id),
        userId:     Number(row.user_id),
        lessonId:   Number(row.lesson_id),
        completed:  row.completed,
        score:      row.score,
        bestScore:  row.best_score,
        attempts:   row.attempts,
        xpEarned:   row.xp_earned,
        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
        updatedAt:  row.updated_at ? row.updated_at.toISOString() : null
    };
}

async function getUserProgressByLevel(userId, levelId) {
    const { rows } = await pool.query(
        `SELECT up.* FROM user_progress up
         JOIN lessons l ON l.id = up.lesson_id
         WHERE up.user_id = $1 AND l.level_id = $2`,
        [userId, levelId]
    );
    return rows.map(row => ({
        id:         Number(row.id),
        userId:     Number(row.user_id),
        lessonId:   Number(row.lesson_id),
        completed:  row.completed,
        score:      row.score,
        bestScore:  row.best_score,
        attempts:   row.attempts,
        xpEarned:   row.xp_earned,
        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
        updatedAt:  row.updated_at ? row.updated_at.toISOString() : null
    }));
}

async function upsertUserProgress(userId, lessonId, { completed, score, bestScore, attempts, xpEarned }) {
    const { rows } = await pool.query(
        `INSERT INTO user_progress (user_id, lesson_id, completed, score, best_score, attempts, xp_earned, completed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $3 THEN NOW() ELSE NULL END, NOW())
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET
           completed = $3,
           score = $4,
           best_score = GREATEST(user_progress.best_score, $5),
           attempts = user_progress.attempts + $6,
           xp_earned = user_progress.xp_earned + $7,
           completed_at = CASE WHEN $3 AND user_progress.completed_at IS NULL THEN NOW() ELSE user_progress.completed_at END,
           updated_at = NOW()
         RETURNING *`,
        [userId, lessonId, completed, score, bestScore, attempts, xpEarned]
    );
    const row = rows[0];
    return {
        id:         Number(row.id),
        userId:     Number(row.user_id),
        lessonId:   Number(row.lesson_id),
        completed:  row.completed,
        score:      row.score,
        bestScore:  row.best_score,
        attempts:   row.attempts,
        xpEarned:   row.xp_earned,
        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
        updatedAt:  row.updated_at ? row.updated_at.toISOString() : null
    };
}

async function saveUserExerciseAnswer(userId, exerciseId, lessonId, { answerJson, isCorrect, pointsEarned }) {
    const { rows } = await pool.query(
        `INSERT INTO user_exercise_answers (user_id, exercise_id, lesson_id, answer_json, is_correct, points_earned)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, exerciseId, lessonId, stringifyJsonField(answerJson), isCorrect, pointsEarned]
    );
    const row = rows[0];
    return {
        id:           Number(row.id),
        userId:       Number(row.user_id),
        exerciseId:   Number(row.exercise_id),
        lessonId:     Number(row.lesson_id),
        answerJson:   parseJsonField(row.answer_json),
        isCorrect:    row.is_correct,
        pointsEarned: row.points_earned,
        answeredAt:   row.answered_at ? row.answered_at.toISOString() : null
    };
}

async function getUserStats(userId) {
    const { rows } = await pool.query(
        'SELECT * FROM user_stats WHERE user_id = $1',
        [userId]
    );
    if (!rows[0]) {
        // Create default stats
        const { rows: created } = await pool.query(
            `INSERT INTO user_stats (user_id, total_xp, current_streak, longest_streak, lessons_completed, last_activity_date)
             VALUES ($1, 0, 0, 0, 0, NULL)
             ON CONFLICT (user_id) DO NOTHING
             RETURNING *`,
            [userId]
        );
        // Handle race condition: if ON CONFLICT hit, re-fetch
        if (!created[0]) {
            const { rows: refetched } = await pool.query(
                'SELECT * FROM user_stats WHERE user_id = $1',
                [userId]
            );
            return dbRowToUserStats(refetched[0]);
        }
        return dbRowToUserStats(created[0]);
    }
    return dbRowToUserStats(rows[0]);
}

function dbRowToUserStats(row) {
    if (!row) return null;
    return {
        userId:           Number(row.user_id),
        totalXp:          row.total_xp,
        currentStreak:    row.current_streak,
        longestStreak:    row.longest_streak,
        lessonsCompleted: row.lessons_completed,
        lastActivityDate: row.last_activity_date ? row.last_activity_date.toISOString() : null,
        updatedAt:        row.updated_at ? row.updated_at.toISOString() : null
    };
}

const USER_STATS_COLUMN_MAP = {
    totalXp:          'total_xp',
    currentStreak:    'current_streak',
    longestStreak:    'longest_streak',
    lessonsCompleted: 'lessons_completed',
    lastActivityDate: 'last_activity_date'
};

async function updateUserStats(userId, updates) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [jsKey, value] of Object.entries(updates)) {
        const col = USER_STATS_COLUMN_MAP[jsKey];
        if (!col) continue;
        setClauses.push(`${col} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
    }

    if (setClauses.length === 0) return null;

    setClauses.push('updated_at = NOW()');
    values.push(userId);
    const { rows } = await pool.query(
        `UPDATE user_stats SET ${setClauses.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`,
        values
    );
    return dbRowToUserStats(rows[0]);
}

async function upsertDailyActivity(userId, date, xpEarned, lessonsDone) {
    const { rows } = await pool.query(
        `INSERT INTO daily_activity (user_id, activity_date, xp_earned, lessons_done)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, activity_date) DO UPDATE SET
           xp_earned = daily_activity.xp_earned + $3,
           lessons_done = daily_activity.lessons_done + $4
         RETURNING *`,
        [userId, date, xpEarned, lessonsDone]
    );
    const row = rows[0];
    return {
        id:           Number(row.id),
        userId:       Number(row.user_id),
        activityDate: row.activity_date ? row.activity_date.toISOString() : null,
        xpEarned:     row.xp_earned,
        lessonsDone:  row.lessons_done
    };
}

async function getDailyActivity(userId, startDate, endDate) {
    const { rows } = await pool.query(
        `SELECT * FROM daily_activity
         WHERE user_id = $1 AND activity_date >= $2 AND activity_date <= $3
         ORDER BY activity_date`,
        [userId, startDate, endDate]
    );
    return rows.map(row => ({
        id:           Number(row.id),
        userId:       Number(row.user_id),
        activityDate: row.activity_date ? row.activity_date.toISOString() : null,
        xpEarned:     row.xp_earned,
        lessonsDone:  row.lessons_done
    }));
}

async function getAllAchievements() {
    const { rows } = await pool.query('SELECT * FROM achievements ORDER BY id');
    return rows.map(row => ({
        id:          Number(row.id),
        name:        row.name,
        slug:        row.slug,
        description: row.description,
        iconUrl:     row.icon_url,
        criteria:    parseJsonField(row.criteria),
        createdAt:   row.created_at ? row.created_at.toISOString() : null
    }));
}

async function getUserAchievements(userId) {
    const { rows } = await pool.query(
        `SELECT ua.*, a.name, a.slug, a.description, a.icon_url, a.criteria
         FROM user_achievements ua
         JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = $1
         ORDER BY ua.earned_at DESC`,
        [userId]
    );
    return rows.map(row => ({
        userId:        Number(row.user_id),
        achievementId: Number(row.achievement_id),
        earnedAt:      row.earned_at ? row.earned_at.toISOString() : null,
        name:          row.name,
        slug:          row.slug,
        description:   row.description,
        iconUrl:       row.icon_url,
        criteria:      parseJsonField(row.criteria)
    }));
}

async function grantAchievement(userId, achievementId) {
    const { rows } = await pool.query(
        `INSERT INTO user_achievements (user_id, achievement_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, achievement_id) DO NOTHING
         RETURNING *`,
        [userId, achievementId]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        userId:        Number(row.user_id),
        achievementId: Number(row.achievement_id),
        earnedAt:      row.earned_at ? row.earned_at.toISOString() : null
    };
}

async function getLeaderboard(limit) {
    const { rows } = await pool.query(
        `SELECT us.*, u.username, u.display_name
         FROM user_stats us
         JOIN users u ON u.id = us.user_id
         WHERE u.is_active = TRUE
         ORDER BY us.total_xp DESC
         LIMIT $1`,
        [limit || 10]
    );
    return rows.map(row => ({
        userId:           Number(row.user_id),
        username:         row.username,
        displayName:      row.display_name,
        totalXp:          row.total_xp,
        currentStreak:    row.current_streak,
        longestStreak:    row.longest_streak,
        lessonsCompleted: row.lessons_completed
    }));
}

async function getWeeklyLeaderboard(limit) {
    const { rows } = await pool.query(
        `SELECT da.user_id, u.username, u.display_name,
                SUM(da.xp_earned)::int AS weekly_xp,
                SUM(da.lessons_done)::int AS weekly_lessons
         FROM daily_activity da
         JOIN users u ON u.id = da.user_id
         WHERE u.is_active = TRUE
           AND da.activity_date >= date_trunc('week', CURRENT_DATE)
         GROUP BY da.user_id, u.username, u.display_name
         ORDER BY weekly_xp DESC
         LIMIT $1`,
        [limit || 10]
    );
    return rows.map(row => ({
        userId:        Number(row.user_id),
        username:      row.username,
        displayName:   row.display_name,
        weeklyXp:      row.weekly_xp,
        weeklyLessons: row.weekly_lessons
    }));
}

async function getSkillProgressForUser(userId) {
    const { rows } = await pool.query(
        `SELECT s.id AS skill_id, s.name AS skill_name, s.slug AS skill_slug,
                COUNT(DISTINCT l2.id)::int AS total_lessons,
                COUNT(DISTINCT CASE WHEN up.completed THEN up.lesson_id END)::int AS completed_lessons,
                COALESCE(SUM(up.xp_earned), 0)::int AS total_xp_earned
         FROM skills s
         JOIN levels lv ON lv.skill_id = s.id
         JOIN lessons l2 ON l2.level_id = lv.id
         LEFT JOIN user_progress up ON up.lesson_id = l2.id AND up.user_id = $1
         GROUP BY s.id, s.name, s.slug
         ORDER BY s.sort_order`,
        [userId]
    );
    return rows.map(row => ({
        skillId:          Number(row.skill_id),
        skillName:        row.skill_name,
        skillSlug:        row.skill_slug,
        totalLessons:     row.total_lessons,
        completedLessons: row.completed_lessons,
        totalXpEarned:    row.total_xp_earned
    }));
}

module.exports = {
    // Helpers
    parseJsonField,
    stringifyJsonField,
    dbRowToUser,

    // Users
    findUserByUsername,
    findUserById,
    getAllUsers,
    createUser,
    registerWithInviteCode,
    updateUser,
    deleteUser,
    getActiveAdminCount,
    getAdminCount,

    // Invite Codes
    findInviteCode,
    createInviteCode,
    createInviteCodeIfNotExists,
    consumeInviteCode,
    rollbackInviteCode,
    deleteInviteCode,
    getAllInviteCodes,

    // PayPal Orders
    dbRowToPaypalOrder,
    createPaypalOrder,
    findPaypalOrder,
    completePaypalOrder,
    updatePaypalOrderStatus,
    cleanupExpiredPaypalOrders,

    // Learning
    getAllSkills,
    getSkillById,
    getLevelsBySkill,
    getLevelById,
    getLessonsByLevel,
    getLessonById,
    getExercisesByLesson,
    getUserProgress,
    getUserProgressByLevel,
    upsertUserProgress,
    saveUserExerciseAnswer,
    getUserStats,
    updateUserStats,
    upsertDailyActivity,
    getDailyActivity,
    getAllAchievements,
    getUserAchievements,
    grantAchievement,
    getLeaderboard,
    getWeeklyLeaderboard,
    getSkillProgressForUser
};
