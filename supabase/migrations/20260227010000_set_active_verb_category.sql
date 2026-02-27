-- Add an atomic RPC for admins to switch the active verb category.
-- This keeps app_settings.active_verb_category and verbs.active synchronized.

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

    UPDATE public.app_settings
    SET active_verb_category = p_category,
        updated_at = timezone('utc'::text, now()),
        updated_by = v_user_id
    WHERE id = 1;

    SELECT COUNT(*)::INT, COALESCE(MAX(level_group), 0)::INT
    INTO v_active_verbs, v_max_level
    FROM public.verbs
    WHERE active = TRUE;

    RETURN jsonb_build_object(
        'active_verb_category', p_category,
        'active_verbs', v_active_verbs,
        'max_level', v_max_level
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_verb_category(INT) TO authenticated;
