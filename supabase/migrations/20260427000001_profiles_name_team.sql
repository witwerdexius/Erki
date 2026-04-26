-- Add name and team columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS team TEXT;

-- Update trigger to also insert name and team from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name, team)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'name', ''), ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'team', ''), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
