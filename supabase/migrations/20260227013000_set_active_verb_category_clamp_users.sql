-- Clamp users.current_level_cap to the active list max level when category changes.

CREATE OR REPLACE FUNCTION public.set_active_verb_category(p_category INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_active_verbs INT;
    v_max_level INT;
    v_users_clamped INT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can change the active verb category';
    END IF;

    IF p_category < 1 OR p_category > 3 THEN
        RAISE EXCEPTION 'Invalid category. Allowed values are 1, 2, or 3';
    END IF;

    UPDATE public.verbs
    SET active = (category = p_category)
    WHERE active IS DISTINCT FROM (category = p_category);

    SELECT COALESCE(MAX(level_group), 1)::INT
    INTO v_max_level
    FROM public.verbs
    WHERE active = TRUE;

    UPDATE public.users
    SET current_level_cap = GREATEST(1, LEAST(current_level_cap, v_max_level))
    WHERE current_level_cap > v_max_level;

    GET DIAGNOSTICS v_users_clamped = ROW_COUNT;

    UPDATE public.app_settings
    SET active_verb_category = p_category,
        updated_at = timezone('utc'::text, now()),
        updated_by = v_user_id
    WHERE id = 1;

    SELECT COUNT(*)::INT
    INTO v_active_verbs
    FROM public.verbs
    WHERE active = TRUE;

    RETURN jsonb_build_object(
        'active_verb_category', p_category,
        'active_verbs', v_active_verbs,
        'max_level', v_max_level,
        'users_clamped', v_users_clamped
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_verb_category(INT) TO authenticated;
