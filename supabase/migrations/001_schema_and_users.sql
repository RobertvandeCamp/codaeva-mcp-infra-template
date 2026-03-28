-- {{DISPLAY_NAME}} - Schema and User Profiles
-- Creates schema, user_profiles table (1:1 with auth.users), and auto-create trigger

-- Schema
CREATE SCHEMA IF NOT EXISTS {{SUPABASE_SCHEMA}};

-- Roles enum (per D-06: template variabele voor custom rollen)
CREATE TYPE {{SUPABASE_SCHEMA}}.app_role AS ENUM ({{ROLES}});

-- user_profiles: central user table linked to auth.users
CREATE TABLE {{SUPABASE_SCHEMA}}.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role {{SUPABASE_SCHEMA}}.app_role NOT NULL DEFAULT 'viewer',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION {{SUPABASE_SCHEMA}}.create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = {{SUPABASE_SCHEMA}}
AS $$
BEGIN
  INSERT INTO {{SUPABASE_SCHEMA}}.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION {{SUPABASE_SCHEMA}}.create_user_profile();

-- updated_at trigger
CREATE OR REPLACE FUNCTION {{SUPABASE_SCHEMA}}.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON {{SUPABASE_SCHEMA}}.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION {{SUPABASE_SCHEMA}}.update_updated_at_column();

-- Grants
GRANT ALL ON {{SUPABASE_SCHEMA}}.user_profiles TO service_role;
GRANT SELECT ON {{SUPABASE_SCHEMA}}.user_profiles TO authenticated;
GRANT UPDATE (full_name) ON {{SUPABASE_SCHEMA}}.user_profiles TO authenticated;

COMMENT ON TABLE {{SUPABASE_SCHEMA}}.user_profiles IS 'User profiles linked to auth.users. Contains name, role, admin status.';
