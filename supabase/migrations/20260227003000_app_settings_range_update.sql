-- Narrow app settings bounds to match admin product requirements.
-- Time per level: 60..300 seconds
-- Verbs per level: 5..25

UPDATE public.app_settings
SET
    time_limit_seconds = GREATEST(60, LEAST(300, time_limit_seconds)),
    verbs_per_level = GREATEST(5, LEAST(25, verbs_per_level))
WHERE id = 1;

ALTER TABLE public.app_settings
    DROP CONSTRAINT IF EXISTS app_settings_time_limit_seconds_check,
    DROP CONSTRAINT IF EXISTS app_settings_verbs_per_level_check;

ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_time_limit_seconds_check
        CHECK (time_limit_seconds BETWEEN 60 AND 300),
    ADD CONSTRAINT app_settings_verbs_per_level_check
        CHECK (verbs_per_level BETWEEN 5 AND 25);
