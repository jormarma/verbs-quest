-- 1. Drop the RLS Policies that depend on the text-based users.id column
DROP POLICY IF EXISTS "read_own_profile" ON public.users;
DROP POLICY IF EXISTS "admin_read_all_users" ON public.users;
DROP POLICY IF EXISTS "admin_write_verbs" ON public.verbs;
DROP POLICY IF EXISTS "admin_read_all_sessions" ON public.game_sessions;

-- 2. Clean out the old clerk text-based user data
TRUNCATE TABLE public.game_sessions;
TRUNCATE TABLE public.users CASCADE;

-- 3. Drop the obsolete text columns and recreate them as UUIDs linked to Supabase Auth native identities
ALTER TABLE public.users DROP CONSTRAINT users_pkey CASCADE;
ALTER TABLE public.users DROP COLUMN id CASCADE;
ALTER TABLE public.users ADD COLUMN id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.game_sessions DROP COLUMN user_id CASCADE;
ALTER TABLE public.game_sessions ADD COLUMN user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE;

-- 4. Recreate the RLS Policies using the new UUID structure
-- Security definer functions bypass RLS entirely. This prevents the infinite 
-- recursion loop that happens when a users table policy queries the users table.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
END;
$$;

CREATE POLICY "read_own_profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "admin_read_all_users" ON public.users
    FOR SELECT USING (public.is_admin());

CREATE POLICY "admin_write_verbs" ON public.verbs
    FOR ALL USING (public.is_admin());

CREATE POLICY "admin_read_all_sessions" ON public.game_sessions
    FOR SELECT USING (public.is_admin());

-- 5. Drop the old Clerk sync fallback RPC as it is no longer necessary
DROP FUNCTION IF EXISTS public.sync_user_fallback(TEXT);

-- 6. Create the native Supabase Auth alignment function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, username, role)
  VALUES (
    new.id, 
    -- Extract a display name from auth metadata or fallback to email prefix / 'Student'
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Student'),
    'student'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger the function every time a user uses Supabase Auth to register
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
