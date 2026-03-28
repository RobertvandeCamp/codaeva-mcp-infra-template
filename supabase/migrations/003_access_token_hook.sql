-- {{DISPLAY_NAME}} - Custom Access Token Hook
-- Injects role and is_admin from user_profiles into JWT claims

CREATE OR REPLACE FUNCTION {{SUPABASE_SCHEMA}}.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = {{SUPABASE_SCHEMA}}
AS $$
DECLARE
  claims jsonb;
  v_user_id uuid;
  v_role text;
  v_is_admin boolean;
  v_is_active boolean;
BEGIN
  claims := event->'claims';
  v_user_id := (event->>'user_id')::uuid;

  -- Get user profile
  SELECT up.role::text, up.is_admin, up.is_active
  INTO v_role, v_is_admin, v_is_active
  FROM {{SUPABASE_SCHEMA}}.user_profiles up
  WHERE up.id = v_user_id;

  -- Inactive user: empty claims
  IF NOT COALESCE(v_is_active, false) THEN
    claims := jsonb_set(claims, '{role}', '"viewer"'::jsonb);
    claims := jsonb_set(claims, '{is_admin}', 'false'::jsonb);
    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
  END IF;

  -- Inject role and is_admin into JWT
  claims := jsonb_set(claims, '{role}', to_jsonb(COALESCE(v_role, 'viewer')));
  claims := jsonb_set(claims, '{is_admin}', to_jsonb(COALESCE(v_is_admin, false)));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;

EXCEPTION WHEN OTHERS THEN
  -- Fallback: return original token (don't block logins on hook errors)
  RETURN event;
END;
$$;

-- Hook permissions
GRANT USAGE ON SCHEMA {{SUPABASE_SCHEMA}} TO supabase_auth_admin;
GRANT SELECT ON {{SUPABASE_SCHEMA}}.user_profiles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION {{SUPABASE_SCHEMA}}.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION {{SUPABASE_SCHEMA}}.custom_access_token_hook FROM authenticated, anon, public;
