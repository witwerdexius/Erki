-- Add version column for optimistic locking on plannings.
-- Auto-increments on every UPDATE via a BEFORE-UPDATE trigger.
--
-- Hintergrund: savePlanning() in lib/db.ts nutzt diese Spalte als If-Match-Token.
-- Wenn zwei Clients parallel speichern, schlägt die Update-WHERE-Klausel beim
-- zweiten Client fehl (eq('version', expectedVersion) matcht keine Zeile mehr) –
-- der Client erhält dann einen VersionConflictError statt stiller Datenverlust.

ALTER TABLE plannings
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_plannings_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plannings_version_bump ON plannings;
CREATE TRIGGER plannings_version_bump
  BEFORE UPDATE ON plannings
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_plannings_version();
