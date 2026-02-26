-- Add RPC to get level runs details and level verbs for an admin

-- Drop old overload with TEXT param type (parameter type change requires explicit drop)
DROP FUNCTION IF EXISTS public.get_admin_user_level_runs(TEXT, INT);

CREATE OR REPLACE FUNCTION public.get_admin_user_level_runs(
    p_user_id UUID,
    p_level INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_runs JSONB;
    v_verbs JSONB;
BEGIN
    -- Check if the caller is an admin (users.id is UUID after native auth migration)
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Not authorized: Admin access required';
    END IF;

    -- Fetch the runs for the specific user and level, ordered by newest first
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'duration_seconds', t.duration_seconds,
                'is_perfect_run', t.is_perfect_run,
                'completed_at', t.completed_at,
                'errors_count', t.errors_count,
                'client_timestamp_start', t.client_timestamp_start
            ) ORDER BY t.client_timestamp_start DESC
        ),
        '[]'::jsonb
    ) INTO v_runs
    FROM public.game_sessions t
    WHERE t.user_id = p_user_id AND t.level_attempted = p_level;

    -- Fetch the verbs for the specific level
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', v.id,
                'infinitive', v.infinitive,
                'past_simple', v.past_simple,
                'past_participle', v.past_participle
            ) ORDER BY v.infinitive ASC
        ),
        '[]'::jsonb
    ) INTO v_verbs
    FROM public.verbs v
    WHERE v.level_group = p_level AND v.active = TRUE;

    -- Return combined JSON
    RETURN jsonb_build_object(
        'runs', v_runs,
        'verbs', v_verbs
    );
END;
$$;
