-- Step 1: Add verb category support and global active list setting.
-- Categories:
-- 1 = basic
-- 2 = complete
-- 3 = extremely complete

ALTER TABLE public.verbs
    ADD COLUMN IF NOT EXISTS category INT;

UPDATE public.verbs
SET category = 1
WHERE category IS NULL;

ALTER TABLE public.verbs
    ALTER COLUMN category SET DEFAULT 1,
    ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.verbs
    DROP CONSTRAINT IF EXISTS verbs_category_check;

ALTER TABLE public.verbs
    ADD CONSTRAINT verbs_category_check
        CHECK (category BETWEEN 1 AND 3);

CREATE INDEX IF NOT EXISTS verbs_category_level_active_idx
    ON public.verbs (category, level_group, active);

ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS active_verb_category INT;

UPDATE public.app_settings
SET active_verb_category = 1
WHERE active_verb_category IS NULL;

ALTER TABLE public.app_settings
    ALTER COLUMN active_verb_category SET DEFAULT 1,
    ALTER COLUMN active_verb_category SET NOT NULL;

ALTER TABLE public.app_settings
    DROP CONSTRAINT IF EXISTS app_settings_active_verb_category_check;

ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_active_verb_category_check
        CHECK (active_verb_category BETWEEN 1 AND 3);
