-- Global app configuration managed by admins.
-- Keeps a single-row settings record used by gameplay and RPC validation.

CREATE TABLE IF NOT EXISTS public.app_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    time_limit_seconds INT NOT NULL DEFAULT 180 CHECK (time_limit_seconds BETWEEN 30 AND 1800),
    verbs_per_level INT NOT NULL DEFAULT 5 CHECK (verbs_per_level BETWEEN 1 AND 20),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

INSERT INTO public.app_settings (id, time_limit_seconds, verbs_per_level)
VALUES (1, 180, 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_app_settings" ON public.app_settings;
CREATE POLICY "authenticated_read_app_settings" ON public.app_settings
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin_update_app_settings" ON public.app_settings;
CREATE POLICY "admin_update_app_settings" ON public.app_settings
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.app_settings FROM anon;
REVOKE ALL ON TABLE public.app_settings FROM authenticated;
GRANT SELECT ON TABLE public.app_settings TO authenticated;
GRANT UPDATE ON TABLE public.app_settings TO authenticated;
