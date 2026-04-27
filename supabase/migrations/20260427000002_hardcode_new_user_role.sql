-- New users always get role='user' regardless of metadata.
-- Admin role must be assigned explicitly by an existing admin via API.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name, team)
  VALUES (
    NEW.id,
    'user',
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'name', ''), ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'team', ''), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
