-- {{DISPLAY_NAME}} - RLS Policies and Helper Functions
-- Row Level Security on user_profiles + helper functions for role checks

-- Helper: get current user's role from JWT
-- NOTE: The custom_access_token_hook (003) intentionally overrides the JWT `role` claim
-- with the app_role from user_profiles. RLS policies should use auth.uid() for row ownership
-- checks, not auth.role(), since `role` is now the application role (e.g. 'admin', 'viewer').
CREATE OR REPLACE FUNCTION {{SUPABASE_SCHEMA}}.get_my_role()
RETURNS text
LANGUAGE sql STABLE
SET search_path = {{SUPABASE_SCHEMA}}
AS $$
  SELECT COALESCE(auth.jwt()->>'role', 'viewer')
$$;

-- Helper: check if current user is admin from JWT
CREATE OR REPLACE FUNCTION {{SUPABASE_SCHEMA}}.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = {{SUPABASE_SCHEMA}}
AS $$
  SELECT COALESCE((auth.jwt()->>'is_admin')::boolean, false)
$$;

-- RLS
ALTER TABLE {{SUPABASE_SCHEMA}}.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view own profile, admins see all
CREATE POLICY "Users can view own profile"
  ON {{SUPABASE_SCHEMA}}.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (SELECT {{SUPABASE_SCHEMA}}.is_admin()));

-- Users can update own full_name
-- NOTE: GRANT UPDATE (full_name) in 001 restricts which columns authenticated users can
-- actually modify. This RLS policy controls row-level access; the GRANT controls column-level.
CREATE POLICY "Users can update own profile"
  ON {{SUPABASE_SCHEMA}}.user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- NOTE: No INSERT policy needed for authenticated users. Profile creation is handled by the
-- create_user_profile() SECURITY DEFINER trigger in 001 (runs as table owner, bypasses RLS).

-- Service role has full access
CREATE POLICY "Service role full access"
  ON {{SUPABASE_SCHEMA}}.user_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
