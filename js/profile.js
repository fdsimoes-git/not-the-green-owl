(function() {
    async function init() {
        try {
            const [userRes, statsRes, achRes] = await Promise.all([
                csrfFetch('/api/user', { credentials: 'include' }),
                csrfFetch('/api/stats', { credentials: 'include' }),
                csrfFetch('/api/achievements', { credentials: 'include' })
            ]);

            if (userRes.status === 401) { window.location.href = '/login.html'; return; }

            const user = await userRes.json();
            const stats = await statsRes.json();
            const achievements = await achRes.json();

            document.getElementById('loadingContainer').classList.add('hidden');
            document.getElementById('profileContent').classList.remove('hidden');

            // Fill form
            document.getElementById('displayName').value = user.displayName || '';
            document.getElementById('targetBand').value = user.targetBand || '6.5';
            document.getElementById('dailyGoalXp').value = user.dailyGoalXp || '50';
            document.getElementById('preferredTrack').value = user.preferredTrack || 'academic';

            // Email
            document.getElementById('emailDisplay').textContent = user.email || '—';

            // 2FA badge
            const badge = document.getElementById('twofaBadge');
            if (user.twoFactorEnabled) {
                badge.textContent = t('profile.enabled');
                badge.className = 'status-badge enabled';
            } else {
                badge.textContent = t('profile.disabled');
                badge.className = 'status-badge disabled';
            }

            // Stats
            document.getElementById('statXp').textContent = (stats.totalXp || 0).toLocaleString();
            document.getElementById('statStreak').textContent = stats.currentStreak || 0;
            document.getElementById('statLessons').textContent = stats.lessonsCompleted || 0;

            // Achievements
            renderAchievements(achievements);

        } catch (err) {
            console.error('Profile load error:', err);
            window.location.href = '/login.html';
        }
    }

    function renderAchievements(achievements) {
        const grid = document.getElementById('achievementsGrid');
        if (!achievements.length) {
            grid.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.85rem">${t('profile.noAchievements')}</p>`;
            return;
        }
        grid.innerHTML = achievements.map(a => {
            const earned = !!a.earnedAt;
            return `
                <div class="achievement-card ${earned ? 'earned' : 'locked'}">
                    <div class="ach-icon">${earned ? '🏆' : '🔒'}</div>
                    <h4>${a.displayName}</h4>
                    <p>${a.description}${a.xpBonus ? ' +' + a.xpBonus + ' XP' : ''}</p>
                </div>
            `;
        }).join('');
    }

    // Profile form submit
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.classList.add('loading');

        const body = {
            displayName: document.getElementById('displayName').value.trim(),
            targetBand: parseFloat(document.getElementById('targetBand').value),
            dailyGoalXp: parseInt(document.getElementById('dailyGoalXp').value, 10),
            preferredTrack: document.getElementById('preferredTrack').value
        };

        try {
            const res = await csrfFetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include'
            });
            const data = await res.json();
            const msg = document.getElementById('profileMsg');
            if (res.ok) {
                msg.textContent = t('profile.saved');
                msg.className = 'message success show';
            } else {
                msg.textContent = data.message || 'Error saving profile';
                msg.className = 'message error show';
            }
            setTimeout(() => msg.classList.remove('show'), 3000);
        } catch (err) {
            console.error('Save error:', err);
        } finally {
            btn.classList.remove('loading');
        }
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await csrfFetch('/api/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/login.html';
    });

    init();
})();
