-- Make leaderboard overview available to any authenticated user.
-- Admins and students now consume the same RPC/data for the overview list.

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
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
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

REVOKE ALL ON FUNCTION public.get_admin_users_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_users_overview() TO authenticated;
