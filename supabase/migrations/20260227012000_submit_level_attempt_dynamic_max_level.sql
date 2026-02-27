-- Make progression cap depend on the active verb list max level.

CREATE OR REPLACE FUNCTION public.submit_level_attempt(
    p_level_id INT,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE,
    p_error_count INT,
    p_questions_count INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_duration_seconds INT;
    v_is_perfect BOOLEAN;
    v_level_time_limit INT;
    v_max_level INT;
    v_new_level_cap INT;
    v_on_time BOOLEAN;
    v_no_errors BOOLEAN;
    v_status TEXT;
    v_top_scores JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Read runtime setting with safe fallback to legacy 180 seconds.
    SELECT COALESCE(s.time_limit_seconds, 180)
    INTO v_level_time_limit
    FROM public.app_settings s
    WHERE s.id = 1;

    v_level_time_limit := COALESCE(v_level_time_limit, 180);

    -- Resolve current playable max level from the active verb list.
    SELECT COALESCE(MAX(v.level_group), 1)
    INTO v_max_level
    FROM public.verbs v
    WHERE v.active = TRUE;

    v_max_level := GREATEST(1, COALESCE(v_max_level, 1));

    IF p_level_id < 1 OR p_level_id > v_max_level THEN
        RAISE EXCEPTION 'Invalid level attempt for active verb list';
    END IF;

    v_duration_seconds := EXTRACT(EPOCH FROM (p_end_time - p_start_time));

    IF v_duration_seconds < (p_questions_count * 0.8) THEN
        RAISE EXCEPTION 'Anti-cheat triggered: Completion time physically impossible';
    END IF;

    v_on_time := (v_duration_seconds <= v_level_time_limit);
    v_no_errors := (p_error_count = 0);
    v_is_perfect := (v_on_time AND v_no_errors);

    INSERT INTO public.game_sessions (
        user_id, level_attempted, errors_count, duration_seconds,
        is_perfect_run, client_timestamp_start, client_timestamp_end
    ) VALUES (
        v_user_id, p_level_id, p_error_count, v_duration_seconds,
        v_is_perfect, p_start_time, p_end_time
    );

    IF v_is_perfect THEN
        UPDATE public.users
        SET current_level_cap = LEAST(v_max_level, GREATEST(current_level_cap, p_level_id + 1))
        WHERE id = v_user_id
        RETURNING current_level_cap INTO v_new_level_cap;

        v_status := 'unlocked';
    ELSIF v_on_time AND NOT v_no_errors THEN
        UPDATE public.users
        SET current_level_cap = LEAST(current_level_cap, v_max_level)
        WHERE id = v_user_id
        RETURNING current_level_cap INTO v_new_level_cap;

        v_status := 'maintained';
    ELSE
        UPDATE public.users
        SET current_level_cap = GREATEST(1, LEAST(v_max_level, current_level_cap - 1))
        WHERE id = v_user_id AND current_level_cap >= p_level_id
        RETURNING current_level_cap INTO v_new_level_cap;

        v_new_level_cap := COALESCE(v_new_level_cap, 1);
        v_status := 'downgraded';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'duration_seconds', t.duration_seconds,
            'is_perfect_run', t.is_perfect_run,
            'completed_at', t.completed_at
        )
    ) INTO v_top_scores
    FROM (
        SELECT duration_seconds, is_perfect_run, completed_at
        FROM public.game_sessions
        WHERE user_id = v_user_id AND level_attempted = p_level_id
        ORDER BY duration_seconds ASC, completed_at DESC
        LIMIT 5
    ) t;

    RETURN jsonb_build_object(
        'status', v_status,
        'new_level', v_new_level_cap,
        'top_scores', COALESCE(v_top_scores, '[]'::jsonb)
    );
END;
$$;
