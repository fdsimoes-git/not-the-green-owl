(function() {
    const skillColors = { listening: '#3b82f6', reading: '#10b981', writing: '#f59e0b', speaking: '#ef4444' };

    async function init() {
        try {
            const res = await csrfFetch('/api/dashboard', { credentials: 'include' });
            if (res.status === 401) { window.location.href = '/login.html'; return; }
            const data = await res.json();

            // Also fetch user info for nav
            const userRes = await csrfFetch('/api/user', { credentials: 'include' });
            const user = await userRes.json();

            const loading = document.getElementById('loading-overlay');
            if (loading) loading.classList.add('hidden');
            const content = document.getElementById('dashboardContent');
            if (content) content.classList.remove('hidden');

            // Nav username
            const navUser = document.getElementById('navUsername');
            if (navUser) navUser.textContent = user.displayName || user.username;

            // Band estimate
            const bandEl = document.getElementById('bandValue');
            if (bandEl) bandEl.textContent = data.bandEstimate.toFixed(1);
            const bandTarget = document.getElementById('bandTarget');
            if (bandTarget) bandTarget.textContent = user.targetBand;
            // Gauge fill
            const gaugeFill = document.getElementById('bandGaugeFill');
            if (gaugeFill) {
                const pct = ((data.bandEstimate - 1) / 8) * 100;
                const circumference = 2 * Math.PI * 54;
                gaugeFill.style.strokeDasharray = circumference;
                gaugeFill.style.strokeDashoffset = circumference * (1 - pct / 100);
            }

            // Streak
            const streakEl = document.getElementById('streakValue');
            if (streakEl) streakEl.textContent = data.streak.current;

            // Daily goal
            const goalFill = document.getElementById('goalBarFill');
            if (goalFill) goalFill.style.width = data.dailyGoal.percentage + '%';
            const goalText = document.getElementById('goalText');
            if (goalText) goalText.textContent = `${data.dailyGoal.earned} / ${data.dailyGoal.target} XP`;

            // Total XP
            const xpEl = document.getElementById('totalXpValue');
            if (xpEl) xpEl.textContent = data.totalXp.toLocaleString();

            // Lessons completed
            const lessonsEl = document.getElementById('lessonsValue');
            if (lessonsEl) lessonsEl.textContent = data.lessonsCompleted;

            // Skill progress
            const skillsContainer = document.getElementById('skillCards');
            if (skillsContainer) {
                skillsContainer.innerHTML = data.perSkillProgress.map(skill => {
                    const colorKey = skill.skillName.toLowerCase();
                    const color = skillColors[colorKey] || '#f59e0b';
                    return `
                        <div class="skill-progress-card" style="border-top: 3px solid ${color}">
                            <div class="skill-header">
                                <span class="skill-name">${skill.skillName}</span>
                                <span class="skill-pct">${skill.percentage}%</span>
                            </div>
                            <div class="skill-bar"><div class="skill-bar-fill" style="width:${skill.percentage}%; background:${color}"></div></div>
                            <div class="skill-meta">${skill.completedLessons}/${skill.totalLessons} lessons &middot; ${skill.totalXp} XP</div>
                        </div>
                    `;
                }).join('');
            }

            // Recent activity chart
            const chartContainer = document.getElementById('activityChart');
            if (chartContainer && data.recentActivity) {
                const days = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(Date.now() - i * 86400000);
                    const dateStr = d.toISOString().slice(0, 10);
                    const activity = data.recentActivity.find(a => a.activityDate === dateStr);
                    days.push({ date: dateStr, xp: activity ? activity.xpEarned : 0, day: d.toLocaleDateString('en', { weekday: 'short' }) });
                }
                const maxXp = Math.max(...days.map(d => d.xp), 10);
                chartContainer.innerHTML = days.map(d => {
                    const height = (d.xp / maxXp) * 100;
                    return `
                        <div class="chart-col">
                            <div class="chart-bar-wrapper">
                                <div class="chart-bar" style="height:${height}%"></div>
                            </div>
                            <div class="chart-label">${d.day}</div>
                            <div class="chart-xp">${d.xp}</div>
                        </div>
                    `;
                }).join('');
            }

        } catch (err) {
            console.error('Dashboard load error:', err);
            window.location.href = '/login.html';
        }
    }

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await csrfFetch('/api/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/login.html';
    });

    init();
})();
