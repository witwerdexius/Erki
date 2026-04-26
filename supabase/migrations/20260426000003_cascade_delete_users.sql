-- Add ON DELETE CASCADE to all foreign keys referencing auth.users
-- Run this in Supabase SQL Editor if applying manually.

-- Helper: drops all FK constraints from a given public table to auth.users
CREATE OR REPLACE FUNCTION pg_temp.drop_fk_to_auth_users(p_table text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t  ON t.oid = c.conrelid
    JOIN pg_namespace n  ON n.oid = t.relnamespace
    JOIN pg_class f  ON f.oid = c.confrelid
    JOIN pg_namespace fn ON fn.oid = f.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname  = 'public'
      AND t.relname  = p_table
      AND fn.nspname = 'auth'
      AND f.relname  = 'users'
  LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(p_table)
         || ' DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END;
$$;

-- ── profiles ────────────────────────────────────────────────────
SELECT pg_temp.drop_fk_to_auth_users('profiles');
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── plannings ───────────────────────────────────────────────────
SELECT pg_temp.drop_fk_to_auth_users('plannings');
ALTER TABLE public.plannings
  ADD CONSTRAINT plannings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── templates ───────────────────────────────────────────────────
SELECT pg_temp.drop_fk_to_auth_users('templates');
ALTER TABLE public.templates
  ADD CONSTRAINT templates_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── share_tokens ────────────────────────────────────────────────
SELECT pg_temp.drop_fk_to_auth_users('share_tokens');
ALTER TABLE public.share_tokens
  ADD CONSTRAINT share_tokens_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── planning_collaborators ──────────────────────────────────────
SELECT pg_temp.drop_fk_to_auth_users('planning_collaborators');
ALTER TABLE public.planning_collaborators
  ADD CONSTRAINT planning_collaborators_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
