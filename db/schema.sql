-- Not The Green Owl PostgreSQL Schema
-- Run: psql -U owl_app -d not_the_green_owl -f db/schema.sql

BEGIN;

-- ── Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                BIGSERIAL PRIMARY KEY,
    username          TEXT NOT NULL,
    password_hash     TEXT NOT NULL,
    role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    email             TEXT,              -- JSON: {"iv":"...","encryptedData":"..."}
    display_name      TEXT,
    target_band       NUMERIC(2,1) DEFAULT 6.5 CHECK (target_band >= 1 AND target_band <= 9),
    daily_goal_xp     INTEGER NOT NULL DEFAULT 50,
    preferred_track   TEXT NOT NULL DEFAULT 'academic' CHECK (preferred_track IN ('academic', 'general')),
    totp_secret       TEXT,              -- JSON: encrypted
    totp_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    backup_codes      TEXT[] NOT NULL DEFAULT '{}',
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Invite Codes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_codes (
    code       TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL,
    is_used    BOOLEAN NOT NULL DEFAULT FALSE,
    used_at    TIMESTAMPTZ,
    used_by    BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- ── PayPal Orders ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paypal_orders (
    order_id     TEXT PRIMARY KEY,
    amount       NUMERIC(10,2) NOT NULL,
    currency     TEXT NOT NULL DEFAULT 'BRL',
    status       TEXT NOT NULL,
    invite_code  TEXT,
    user_id      BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- ── Skills (4 IELTS modules) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    icon         TEXT,
    color        TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0
);

-- ── Levels (4 per skill) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS levels (
    id               SERIAL PRIMARY KEY,
    skill_id         INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    display_name     TEXT NOT NULL,
    band_min         NUMERIC(2,1) NOT NULL,
    band_max         NUMERIC(2,1) NOT NULL,
    cefr             TEXT,
    unlock_threshold INTEGER NOT NULL DEFAULT 0,  -- XP needed in this skill to unlock
    sort_order       INTEGER NOT NULL DEFAULT 0
);

-- ── Lessons ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
    id            SERIAL PRIMARY KEY,
    level_id      INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    lesson_type   TEXT NOT NULL DEFAULT 'practice' CHECK (lesson_type IN ('practice', 'quiz', 'review')),
    content_json  JSONB,
    xp_reward     INTEGER NOT NULL DEFAULT 20,
    duration_min  INTEGER NOT NULL DEFAULT 10,
    sort_order    INTEGER NOT NULL DEFAULT 0
);

-- ── Exercises ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exercises (
    id             SERIAL PRIMARY KEY,
    lesson_id      INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    exercise_type  TEXT NOT NULL CHECK (exercise_type IN (
        'multiple_choice', 'fill_blank', 'true_false_ng', 'matching',
        'short_answer', 'ordering', 'essay_prompt', 'speaking_prompt'
    )),
    question_json  JSONB NOT NULL,
    answer_json    JSONB NOT NULL,
    points         INTEGER NOT NULL DEFAULT 10,
    explanation    TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0
);

-- ── User Progress (per lesson) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_progress (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed    BOOLEAN NOT NULL DEFAULT FALSE,
    score        INTEGER NOT NULL DEFAULT 0,
    best_score   INTEGER NOT NULL DEFAULT 0,
    attempts     INTEGER NOT NULL DEFAULT 0,
    xp_earned    INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
);

-- ── User Exercise Answers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_exercise_answers (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id   INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    lesson_id     INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    answer_json   JSONB,
    is_correct    BOOLEAN NOT NULL DEFAULT FALSE,
    points_earned INTEGER NOT NULL DEFAULT 0,
    answered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── User Stats ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_stats (
    user_id            BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp           INTEGER NOT NULL DEFAULT 0,
    current_streak     INTEGER NOT NULL DEFAULT 0,
    longest_streak     INTEGER NOT NULL DEFAULT 0,
    lessons_completed  INTEGER NOT NULL DEFAULT 0,
    last_activity_date DATE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Achievements ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    description   TEXT,
    icon          TEXT,
    criteria_json JSONB,
    xp_bonus      INTEGER NOT NULL DEFAULT 0
);

-- ── User Achievements ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_achievements (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- ── Daily Activity ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_activity (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    xp_earned     INTEGER NOT NULL DEFAULT 0,
    lessons_done  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, activity_date)
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_is_active         ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_invite_codes_is_used    ON invite_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by    ON invite_codes(used_by);
CREATE INDEX IF NOT EXISTS idx_paypal_orders_status     ON paypal_orders(status);
CREATE INDEX IF NOT EXISTS idx_paypal_orders_created_at ON paypal_orders(created_at);

CREATE INDEX IF NOT EXISTS idx_levels_skill_id          ON levels(skill_id);
CREATE INDEX IF NOT EXISTS idx_lessons_level_id         ON lessons(level_id);
CREATE INDEX IF NOT EXISTS idx_exercises_lesson_id      ON exercises(lesson_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id    ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_lesson_id  ON user_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_user_exercise_answers_user ON user_exercise_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_exercise_answers_exercise ON user_exercise_answers(exercise_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user   ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date ON daily_activity(user_id, activity_date);

COMMIT;
