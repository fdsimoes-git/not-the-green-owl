(function() {
    const params = new URLSearchParams(window.location.search);
    const lessonId = params.get('id');
    if (!lessonId) { window.location.href = '/learn.html'; return; }

    let lesson = null;
    let exercises = [];
    let currentIndex = 0;
    let userAnswers = {};

    async function init() {
        try {
            const res = await csrfFetch(`/api/lessons/${lessonId}`, { credentials: 'include' });
            if (res.status === 401) { window.location.href = '/login.html'; return; }
            if (!res.ok) { window.location.href = '/learn.html'; return; }
            const data = await res.json();
            lesson = data.lesson;
            exercises = data.exercises;

            document.getElementById('lessonTitle').textContent = lesson.title;
            document.getElementById('loadingContainer').classList.add('hidden');
            document.getElementById('exerciseView').classList.remove('hidden');

            renderExercise(0);
        } catch (err) {
            console.error('Error loading lesson:', err);
            window.location.href = '/learn.html';
        }
    }

    function renderExercise(index) {
        currentIndex = index;
        const ex = exercises[index];
        const total = exercises.length;

        document.getElementById('exerciseCounter').textContent = `${index + 1} ${t('lesson.of')} ${total}`;
        document.getElementById('progressFill').style.width = ((index + 1) / total * 100) + '%';

        const container = document.getElementById('exerciseContainer');
        const q = ex.questionJson;
        let html = `<div class="exercise-card">`;
        html += `<span class="exercise-type-badge">${formatType(ex.exerciseType)}</span>`;

        // Question text
        if (q.passage) {
            html += `<div class="exercise-question">${q.question || ''}<div class="passage">${q.passage}</div></div>`;
        } else {
            html += `<div class="exercise-question">${q.question || q.prompt || q.topic || ''}</div>`;
        }

        // Answer area by type
        const saved = userAnswers[ex.id];

        switch (ex.exerciseType) {
            case 'multiple_choice':
                html += `<div class="options-list">`;
                (q.options || []).forEach((opt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const selected = saved === opt ? ' selected' : '';
                    html += `<button class="option-btn${selected}" onclick="lessonApp.selectOption(${ex.id}, '${escapeAttr(opt)}', this)">
                        <span class="option-letter">${letter}</span>${opt}</button>`;
                });
                html += `</div>`;
                break;

            case 'fill_blank':
            case 'short_answer':
                html += `<input class="text-input" type="text" placeholder="Type your answer..."
                    value="${saved || ''}" oninput="lessonApp.setAnswer(${ex.id}, this.value)">`;
                break;

            case 'true_false_ng':
                html += `<div class="tf-options">`;
                ['true', 'false', 'not given'].forEach(val => {
                    const sel = saved === val ? ' selected' : '';
                    html += `<button class="tf-btn${sel}" onclick="lessonApp.selectTF(${ex.id}, '${val}', this)">${val.charAt(0).toUpperCase() + val.slice(1)}</button>`;
                });
                html += `</div>`;
                break;

            case 'matching':
                html += `<div class="matching-pairs">`;
                (q.items || []).forEach((item, i) => {
                    html += `<div class="matching-row">
                        <div class="matching-left">${item}</div>
                        <select class="matching-select" onchange="lessonApp.setMatchAnswer(${ex.id}, ${i}, this.value)">
                            <option value="">Select...</option>
                            ${(q.options || []).map(o => `<option value="${escapeAttr(o)}" ${saved && saved[i] === o ? 'selected' : ''}>${o}</option>`).join('')}
                        </select>
                    </div>`;
                });
                html += `</div>`;
                break;

            case 'ordering':
                const items = saved || [...(q.items || [])];
                if (!saved) userAnswers[ex.id] = items;
                html += `<div class="ordering-list" id="orderingList">`;
                items.forEach((item, i) => {
                    html += `<div class="ordering-item">
                        <div class="ordering-arrows">
                            <button onclick="lessonApp.moveOrder(${ex.id}, ${i}, -1)">▲</button>
                            <button onclick="lessonApp.moveOrder(${ex.id}, ${i}, 1)">▼</button>
                        </div>
                        <span>${item}</span>
                    </div>`;
                });
                html += `</div>`;
                break;

            case 'essay_prompt':
                html += `<textarea class="text-input" placeholder="${t('lesson.essayPrompt')}"
                    oninput="lessonApp.setAnswer(${ex.id}, 'essay')">${saved === 'essay' ? '' : (saved || '')}</textarea>`;
                if (q.modelAnswer) {
                    html += `<details style="margin-top:1rem"><summary style="cursor:pointer;color:var(--color-accent-primary);font-size:0.85rem">${t('lesson.modelAnswer')}</summary>
                        <div style="margin-top:0.5rem;padding:1rem;background:var(--color-bg-base);border-radius:var(--radius-md);font-size:0.9rem;color:var(--color-text-secondary)">${q.modelAnswer}</div></details>`;
                }
                html += `<div class="self-assess">
                    <label>${t('lesson.selfAssess').replace('{max}', ex.points)}</label>
                    <input type="range" min="0" max="${ex.points}" value="${typeof saved === 'number' ? saved : 0}"
                        oninput="lessonApp.setSelfScore(${ex.id}, this.value); this.nextElementSibling.textContent=this.value">
                    <div class="range-value">${typeof saved === 'number' ? saved : 0}</div>
                </div>`;
                break;

            case 'speaking_prompt':
                if (q.prepTime) html += `<div style="margin-bottom:1rem;font-size:0.85rem;color:var(--color-text-muted)">Preparation time: ${q.prepTime}s &middot; Speaking time: ${q.speakTime || 120}s</div>`;
                html += `<div class="self-assess">
                    <label>${t('lesson.selfAssess').replace('{max}', ex.points)}</label>
                    <input type="range" min="0" max="${ex.points}" value="${typeof saved === 'number' ? saved : 0}"
                        oninput="lessonApp.setSelfScore(${ex.id}, this.value); this.nextElementSibling.textContent=this.value">
                    <div class="range-value">${typeof saved === 'number' ? saved : 0}</div>
                </div>`;
                break;
        }

        html += `</div>`;
        container.innerHTML = html;

        // Navigation buttons
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        prevBtn.disabled = index === 0;

        if (index === total - 1) {
            nextBtn.textContent = t('lesson.submit');
            nextBtn.onclick = () => submitLesson();
        } else {
            nextBtn.textContent = t('lesson.next');
            nextBtn.onclick = () => renderExercise(index + 1);
        }
        prevBtn.onclick = () => { if (index > 0) renderExercise(index - 1); };
    }

    window.lessonApp = {
        selectOption: function(exId, value, btn) {
            userAnswers[exId] = value;
            btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        },

        selectTF: function(exId, value, btn) {
            userAnswers[exId] = value;
            btn.parentElement.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        },

        setAnswer: function(exId, value) {
            userAnswers[exId] = value;
        },

        setMatchAnswer: function(exId, index, value) {
            if (!userAnswers[exId]) userAnswers[exId] = [];
            userAnswers[exId][index] = value;
        },

        moveOrder: function(exId, index, dir) {
            const items = userAnswers[exId];
            const newIndex = index + dir;
            if (newIndex < 0 || newIndex >= items.length) return;
            [items[index], items[newIndex]] = [items[newIndex], items[index]];
            renderExercise(currentIndex);
        },

        setSelfScore: function(exId, value) {
            userAnswers[exId] = parseInt(value, 10);
        }
    };

    async function submitLesson() {
        const submitBtn = document.getElementById('nextBtn');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        const answers = exercises.map(ex => ({
            exerciseId: ex.id,
            answer: userAnswers[ex.id] !== undefined ? userAnswers[ex.id] : null
        }));

        try {
            const res = await csrfFetch(`/api/lessons/${lessonId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
                credentials: 'include'
            });

            const data = await res.json();
            if (!res.ok) {
                alert(data.message || 'Submission failed');
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                return;
            }

            showResults(data);
        } catch (err) {
            console.error('Submit error:', err);
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }

    function showResults(data) {
        document.getElementById('exerciseView').classList.add('hidden');
        document.getElementById('resultsView').classList.remove('hidden');

        document.getElementById('resultScore').textContent = data.percentage + '%';
        document.getElementById('resultXp').textContent = '+' + data.xpEarned;
        document.getElementById('resultCorrect').textContent = data.results.filter(r => r.isCorrect).length;
        document.getElementById('resultIncorrect').textContent = data.results.filter(r => !r.isCorrect).length;

        const label = document.getElementById('resultLabel');
        if (data.percentage >= 90) label.textContent = 'Excellent!';
        else if (data.percentage >= 70) label.textContent = 'Good job!';
        else if (data.percentage >= 60) label.textContent = 'Keep practicing!';
        else label.textContent = 'Try again to improve your score.';

        // Result details
        const details = document.getElementById('resultDetails');
        details.innerHTML = data.results.map((r, i) => {
            const iconClass = r.isCorrect ? 'correct' : 'incorrect';
            return `<div class="result-item ${iconClass}">
                <div class="result-icon ${iconClass}">
                    ${r.isCorrect ? '✓' : '✗'}
                </div>
                <div>
                    <div class="result-text">Exercise ${i + 1}: ${r.pointsEarned}/${r.maxPoints} pts</div>
                    ${r.explanation ? `<div class="result-explanation">${r.explanation}</div>` : ''}
                </div>
            </div>`;
        }).join('');

        // Achievement toasts
        if (data.newAchievements && data.newAchievements.length > 0) {
            const toastContainer = document.getElementById('achievementToasts');
            data.newAchievements.forEach((ach, i) => {
                setTimeout(() => {
                    const toast = document.createElement('div');
                    toast.className = 'achievement-toast';
                    toast.innerHTML = `
                        <div class="toast-icon">🏆</div>
                        <div class="toast-text">
                            <h4>${ach.displayName}</h4>
                            <p>${ach.description}${ach.xpBonus ? ' +' + ach.xpBonus + ' XP' : ''}</p>
                        </div>`;
                    toastContainer.appendChild(toast);
                    setTimeout(() => toast.remove(), 5000);
                }, i * 1000);
            });
        }

        // Try again button
        document.getElementById('tryAgainBtn').onclick = () => {
            userAnswers = {};
            currentIndex = 0;
            document.getElementById('resultsView').classList.add('hidden');
            document.getElementById('exerciseView').classList.remove('hidden');
            renderExercise(0);
        };
    }

    function formatType(type) {
        return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function escapeAttr(str) {
        return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    init();
})();
