-- ── planning_snapshots ─────────────────────────────────────────────────────
-- Speichert einen Stationen-Snapshot pro Planung vor destruktiven Aktionen.
-- Nur Admins können Snapshots lesen; Schreiben erfolgt ausschließlich via
-- Service-Role aus API-Routen.

CREATE TABLE IF NOT EXISTS planning_snapshots (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  planning_id    uuid        NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
  stations_json  jsonb       NOT NULL,
  created_at     timestamptz DEFAULT now(),
  created_by     uuid        REFERENCES auth.users(id),
  trigger_action text        NOT NULL
);

ALTER TABLE planning_snapshots ENABLE ROW LEVEL SECURITY;

-- Nur Admins dürfen Snapshots lesen
CREATE POLICY "admins_read_snapshots" ON planning_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Service Role schreibt (WITH CHECK (true) — RLS wird von Service Role
-- ohnehin bypassed, die Policy erlaubt zusätzlich privilegierte Inserts)
CREATE POLICY "service_insert_snapshots" ON planning_snapshots
  FOR INSERT WITH CHECK (true);


-- ── plannings: DELETE nur für Admins ───────────────────────────────────────
-- Bestehende nutzereigene DELETE-Policy entfernen (falls vorhanden)
DROP POLICY IF EXISTS "Users can delete own plannings" ON plannings;
DROP POLICY IF EXISTS "users_delete_own_plannings"    ON plannings;

CREATE POLICY "admins_delete_plannings" ON plannings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
