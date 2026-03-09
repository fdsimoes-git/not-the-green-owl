(function() {
    let allTimeData = null;
    let weeklyData = null;
    let currentTab = 'allTime';

    async function init() {
        try {
            const res = await csrfFetch('/api/leaderboard', { credentials: 'include' });
            if (res.status === 401) { window.location.href = '/login.html'; return; }
            allTimeData = await res.json();

            document.getElementById('loadingContainer').classList.add('hidden');
            document.getElementById('leaderboardContent').classList.remove('hidden');

            renderList(allTimeData);
        } catch (err) {
            console.error('Leaderboard load error:', err);
        }
    }

    function renderList(data) {
        const list = document.getElementById('leaderboardList');
        if (!data || !data.length) {
            list.innerHTML = `<div class="lb-empty">${t('leader.empty')}</div>`;
            return;
        }
        list.innerHTML = data.map((entry, i) => {
            const rank = i + 1;
            let rankClass = 'normal';
            if (rank === 1) rankClass = 'gold';
            else if (rank === 2) rankClass = 'silver';
            else if (rank === 3) rankClass = 'bronze';

            const isYou = entry.isCurrentUser;
            return `
                <div class="lb-row ${isYou ? 'is-you' : ''} ${rank <= 3 ? 'top-3' : ''}" style="animation-delay:${i * 0.05}s">
                    <div class="lb-rank ${rankClass}">${rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}</div>
                    <div class="lb-name">${entry.displayName || entry.username}${isYou ? `<span class="you-tag">${t('leader.you')}</span>` : ''}</div>
                    <div class="lb-xp">${(entry.totalXp || 0).toLocaleString()} XP</div>
                </div>
            `;
        }).join('');
    }

    // Tab switching
    document.getElementById('tabAllTime').addEventListener('click', async function() {
        if (currentTab === 'allTime') return;
        currentTab = 'allTime';
        this.classList.add('active');
        document.getElementById('tabWeekly').classList.remove('active');
        if (allTimeData) {
            renderList(allTimeData);
        }
    });

    document.getElementById('tabWeekly').addEventListener('click', async function() {
        if (currentTab === 'weekly') return;
        currentTab = 'weekly';
        this.classList.add('active');
        document.getElementById('tabAllTime').classList.remove('active');

        if (!weeklyData) {
            try {
                const res = await csrfFetch('/api/leaderboard/weekly', { credentials: 'include' });
                weeklyData = await res.json();
            } catch (err) {
                console.error('Weekly leaderboard error:', err);
                weeklyData = [];
            }
        }
        renderList(weeklyData);
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await csrfFetch('/api/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/login.html';
    });

    init();
})();
