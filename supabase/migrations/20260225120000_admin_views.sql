-- Admin Views Migration

-- 1. Overview RPC: Gets a list of users, their levels, total runs, and perfect runs
CREATE OR REPLACE FUNCTION public.get_admin_users_overview()
RETURNS TABLE (
    user_id TEXT,
    username TEXT,
    current_level_cap INT,
    total_runs BIGINT,
    total_perfect_runs BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Ensure the caller is an admin
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;

    RETURN QUERY
    SELECT 
        u.id::TEXT, 
        u.username, 
        u.current_level_cap,
        COUNT(gs.id) AS total_runs,
        COUNT(gs.id) FILTER (WHERE gs.is_perfect_run = TRUE) AS total_perfect_runs
    FROM public.users u
    LEFT JOIN public.game_sessions gs ON u.id = gs.user_id
    WHERE u.role = 'student'
    GROUP BY u.id, u.username, u.current_level_cap
    ORDER BY u.current_level_cap DESC, total_perfect_runs DESC;
END;
$$;

-- 2. Detail RPC: Gets runs per level, perfect runs per level, best time, and global rank
CREATE OR REPLACE FUNCTION public.get_admin_user_details(p_user_id UUID)
RETURNS TABLE (
    level_attempted INT,
    total_runs BIGINT,
    perfect_runs BIGINT,
    best_time_seconds INT,
    global_rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Ensure the caller is an admin
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;

    RETURN QUERY
    WITH UserLevelStats AS (
        -- Basic stats for the currently inspected user
        SELECT 
            gs.level_attempted,
            COUNT(gs.id) AS total_runs,
            COUNT(gs.id) FILTER (WHERE gs.is_perfect_run = TRUE) AS perfect_runs
        FROM public.game_sessions gs
        WHERE gs.user_id = p_user_id
        GROUP BY gs.level_attempted
    ),
    GlobalBestTimes AS (
        -- Calculate the single best time for EVERY user per level that was perfectly completed
        SELECT 
            gs.level_attempted,
            gs.user_id,
            MIN(gs.duration_seconds) as best_time
        FROM public.game_sessions gs
        WHERE gs.is_perfect_run = TRUE
        GROUP BY gs.level_attempted, gs.user_id
    ),
    RankedTimes AS (
        -- Rank those best times globally per level
        SELECT 
            gbt.level_attempted,
            gbt.user_id,
            gbt.best_time,
            RANK() OVER(PARTITION BY gbt.level_attempted ORDER BY gbt.best_time ASC) as rank
        FROM GlobalBestTimes gbt
    )
    SELECT 
        uls.level_attempted,
        uls.total_runs,
        uls.perfect_runs,
        rt.best_time,
        rt.rank
    FROM UserLevelStats uls
    LEFT JOIN RankedTimes rt ON uls.level_attempted = rt.level_attempted AND rt.user_id = p_user_id
    ORDER BY uls.level_attempted ASC;
END;
$$;
