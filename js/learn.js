(function() {
    const skillColors = { listening: '#3b82f6', reading: '#10b981', writing: '#f59e0b', speaking: '#ef4444' };
    const skillIcons = { listening: '🎧', reading: '📖', writing: '✍️', speaking: '🗣️' };

    let currentSkill = null;
    let currentLevel = null;

    async function loadSkills() {
        showView('loading');
        try {
            const res = await csrfFetch('/api/skills', { credentials: 'include' });
            if (res.status === 401) { window.location.href = '/login.html'; return; }
            const skills = await res.json();
            renderSkills(skills);
        } catch (err) {
            console.error('Error loading skills:', err);
        }
    }

    function renderSkills(skills) {
        const grid = document.getElementById('skillsGrid');
        grid.innerHTML = skills.map((skill, i) => {
            const colorKey = skill.name.toLowerCase();
            const color = skillColors[colorKey] || '#f59e0b';
            const icon = skillIcons[colorKey] || '📚';
            const pct = skill.totalLessons > 0 ? Math.round((skill.completedLessons / skill.totalLessons) * 100) : 0;
            return `
                <div class="skill-card" data-id="${skill.id}" style="animation-delay:${i * 0.1}s" onclick="learnApp.selectSkill(${skill.id})">
                    <div style="position:absolute;top:0;left:0;right:0;height:4px;background:${color}"></div>
                    <div style="font-size:2rem;margin-bottom:0.75rem">${icon}</div>
                    <h3>${skill.displayName}</h3>
                    <div class="skill-stats">${skill.completedLessons}/${skill.totalLessons} lessons &middot; ${skill.totalXp} XP</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('pageTitle').textContent = t('learn.selectSkill');
        updateBreadcrumb();
        showView('skills');
    }

    window.learnApp = {
        selectSkill: async function(skillId) {
            showView('loading');
            try {
                const res = await csrfFetch(`/api/skills/${skillId}/levels`, { credentials: 'include' });
                const data = await res.json();
                currentSkill = data.skill;
                renderLevels(data.levels);
            } catch (err) {
                console.error('Error loading levels:', err);
            }
        },

        selectLevel: async function(levelId) {
            showView('loading');
            try {
                const res = await csrfFetch(`/api/levels/${levelId}/lessons`, { credentials: 'include' });
                const data = await res.json();
                currentLevel = data.level;
                renderLessons(data.lessons);
            } catch (err) {
                console.error('Error loading lessons:', err);
            }
        },

        backToSkills: function() {
            currentSkill = null;
            currentLevel = null;
            loadSkills();
        },

        backToLevels: function() {
            if (currentSkill) {
                currentLevel = null;
                this.selectSkill(currentSkill.id);
            }
        }
    };

    function renderLevels(levels) {
        const list = document.getElementById('levelsList');
        const levelIcons = ['🌱', '📈', '🎯', '🏆'];
        list.innerHTML = levels.map((level, i) => {
            const locked = !level.unlocked;
            return `
                <div class="level-card ${locked ? 'locked' : ''}" style="animation-delay:${i * 0.1}s"
                     ${locked ? '' : `onclick="learnApp.selectLevel(${level.id})"`}>
                    <div style="width:48px;height:48px;border-radius:12px;background:var(--color-bg-surface);display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0">${levelIcons[i] || '📚'}</div>
                    <div class="level-info">
                        <h3>${level.displayName}</h3>
                        <div class="level-meta">Band ${level.bandMin}–${level.bandMax} ${level.cefr ? '· ' + level.cefr : ''}</div>
                    </div>
                    <span class="level-badge ${locked ? 'locked-badge' : 'unlocked'}">${locked ? t('learn.locked') : t('learn.levels')}</span>
                </div>
            `;
        }).join('');

        document.getElementById('pageTitle').textContent = currentSkill.displayName;
        updateBreadcrumb();
        showView('levels');
    }

    function renderLessons(lessons) {
        const list = document.getElementById('lessonsList');
        list.innerHTML = lessons.map((lesson, i) => {
            const done = lesson.completed;
            return `
                <a href="/lesson.html?id=${lesson.id}" class="lesson-card" style="animation-delay:${i * 0.05}s">
                    <div class="lesson-status ${done ? 'done' : ''}">
                        ${done ? '✓' : i + 1}
                    </div>
                    <div class="lesson-info">
                        <h4>${lesson.title}</h4>
                        <div class="lesson-meta">
                            <span>${lesson.durationMin || 10} min</span>
                            <span>+${lesson.xpReward} XP</span>
                        </div>
                    </div>
                    ${lesson.bestScore > 0 ? `<div class="lesson-score">${lesson.bestScore}%</div>` : ''}
                </a>
            `;
        }).join('');

        document.getElementById('pageTitle').textContent = currentLevel.displayName;
        updateBreadcrumb();
        showView('lessons');
    }

    function updateBreadcrumb() {
        const bc = document.getElementById('breadcrumb');
        let html = `<a onclick="learnApp.backToSkills()">${t('learn.selectSkill')}</a>`;
        if (currentSkill) {
            html += `<span class="sep">›</span><a onclick="learnApp.backToLevels()">${currentSkill.displayName}</a>`;
        }
        if (currentLevel) {
            html += `<span class="sep">›</span><span>${currentLevel.displayName}</span>`;
        }
        bc.innerHTML = html;
    }

    function showView(view) {
        document.getElementById('loadingContainer').classList.toggle('hidden', view !== 'loading');
        document.getElementById('skillsView').classList.toggle('hidden', view !== 'skills');
        document.getElementById('levelsView').classList.toggle('hidden', view !== 'levels');
        document.getElementById('lessonsView').classList.toggle('hidden', view !== 'lessons');
    }

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await csrfFetch('/api/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/login.html';
    });

    loadSkills();
})();
