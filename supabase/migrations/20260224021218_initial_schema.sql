-- 1. Create Tables

-- Users Table (Mirrors Clerk Identity)
CREATE TABLE public.users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'student',
    username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    current_level_cap INT NOT NULL DEFAULT 1
);

-- Verbs Table
CREATE TABLE public.verbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    infinitive TEXT NOT NULL,
    past_simple TEXT NOT NULL,
    past_participle TEXT NOT NULL,
    level_group INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Game Sessions Table
CREATE TABLE public.game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    level_attempted INT NOT NULL,
    errors_count INT NOT NULL,
    duration_seconds INT NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_perfect_run BOOLEAN NOT NULL,
    client_timestamp_start TIMESTAMP WITH TIME ZONE NOT NULL,
    client_timestamp_end TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Users
CREATE POLICY "read_own_profile" ON public.users
    FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "admin_read_all_users" ON public.users
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin')
    );

-- Verbs
CREATE POLICY "public_read_verbs" ON public.verbs
    FOR SELECT USING (true); -- Public read for offline caching

CREATE POLICY "admin_write_verbs" ON public.verbs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin')
    );

-- Game Sessions
CREATE POLICY "insert_own_sessions" ON public.game_sessions
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "read_own_sessions" ON public.game_sessions
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "admin_read_all_sessions" ON public.game_sessions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin')
    );

-- 4. RPC Functions

-- The Anti-Cheat "Submit Result" RPC
CREATE OR REPLACE FUNCTION public.submit_level_attempt(
    p_level_id INT,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE,
    p_error_count INT,
    p_questions_count INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as DB owner to bypass RLS for the users table update
AS $$
DECLARE
    v_user_id UUID;
    v_duration_seconds INT;
    v_is_perfect BOOLEAN;
    v_level_time_limit INT := 100; -- 3 minutes
    v_new_level_cap INT;
BEGIN
    -- Validation 2 (Identity)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Validation 1 (Time)
    v_duration_seconds := EXTRACT(EPOCH FROM (p_end_time - p_start_time));
    
    -- Anti-cheat rule: Physically impossible to type that fast (< 0.8s per question)
    IF v_duration_seconds < (p_questions_count * 0.8) THEN
        RAISE EXCEPTION 'Anti-cheat triggered: Completion time physically impossible';
    END IF;

    v_on_time := (v_duration_seconds <= v_level_time_limit);
    v_no_errors := (p_error_count = 0);
    v_is_perfect := (v_on_time AND v_no_errors);

    -- Execution
    INSERT INTO public.game_sessions (
        user_id, level_attempted, errors_count, duration_seconds, 
        is_perfect_run, client_timestamp_start, client_timestamp_end
    ) VALUES (
        v_user_id, p_level_id, p_error_count, v_duration_seconds,
        v_is_perfect, p_start_time, p_end_time
    );

    IF v_is_perfect THEN
        -- Case 1 and 5: Unlock next level
        UPDATE public.users 
        SET current_level_cap = LEAST(18, GREATEST(current_level_cap, p_level_id + 1))
        WHERE id = v_user_id
        RETURNING current_level_cap INTO v_new_level_cap;

        RETURN jsonb_build_object('status', 'unlocked', 'new_level', v_new_level_cap);
    ELSIF v_on_time AND NOT v_no_errors THEN
        -- Case 2: Passes with errors and on time -> no upgrade, no downgrade
        SELECT current_level_cap INTO v_new_level_cap FROM public.users WHERE id = v_user_id;

        RETURN jsonb_build_object('status', 'maintained', 'new_level', v_new_level_cap);
    ELSE
        -- Case 3 and 4: Not on time -> downgrade level cap minimum 1
        UPDATE public.users
        SET current_level_cap = GREATEST(1, current_level_cap - 1)
        WHERE id = v_user_id AND current_level_cap >= p_level_id
        RETURNING current_level_cap INTO v_new_level_cap;

        RETURN jsonb_build_object('status', 'downgraded', 'new_level', COALESCE(v_new_level_cap, 1));
    END IF;
END;
$$;

-- The "Self-Heal" Sync Fallback RPC
CREATE OR REPLACE FUNCTION public.sync_user_fallback(
    p_username TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id TEXT;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Upsert the user profile if it doesn't already exist
    INSERT INTO public.users (id, username, role)
    VALUES (v_user_id, p_username, 'student')
    ON CONFLICT (id) DO NOTHING;
END;
$$;
