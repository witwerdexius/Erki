-- Fix: ensure_community_admin trigger promoted every user with NULL community_id to admin
-- because NULL = NULL is always false in SQL, making NOT EXISTS always true.
-- Now we skip the check entirely when community_id is NULL.
CREATE OR REPLACE FUNCTION public.ensure_community_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.community_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE community_id = NEW.community_id AND role = 'admin'
  ) THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$;
