-- 1. Remove all game sessions (stats)
TRUNCATE TABLE public.game_sessions;

-- 2. Delete all users from auth.users except the admin.
-- The ON DELETE CASCADE constraints will automatically remove their records from public.users
DELETE FROM auth.users WHERE email != 'admin@verbsquest.com';

-- 3. Reset application configuration to defaults requested
UPDATE public.app_settings 
SET time_limit_seconds = 120, verbs_per_level = 5
WHERE id = 1;
