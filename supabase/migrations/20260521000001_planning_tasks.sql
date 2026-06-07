-- Aufgaben-Rubriken für Zeitplanung
--
-- Neue Tabelle planning_tasks für manuelle Aufgaben in den Rubriken
-- Aufbau / Feierzeit / Catering / Abbau.
-- Die Rubrik "Stationen" wird NICHT hier gespeichert – sie kommt aus stations.
--
-- Außerdem: helpers_required-Spalte auf stations, damit pro Station
-- die benötigte Helferzahl editierbar ist.

-- helpers_required auf stations ergänzen
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS helpers_required integer NOT NULL DEFAULT 1;

-- Neue Tabelle für Aufgaben in den manuellen Rubriken
CREATE TABLE planning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id uuid NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('aufbau', 'feierzeit', 'catering', 'abbau')),
  name text NOT NULL,
  helpers_required integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE planning_tasks ENABLE ROW LEVEL SECURITY;

-- RLS: analog zu stations – can_access_planning() ist bereits als
-- SECURITY DEFINER Funktion vorhanden (aus 20260428000001_stations_rls.sql).
CREATE POLICY "planning_tasks_select" ON planning_tasks
    FOR SELECT
    TO authenticated
    USING (can_access_planning(planning_id));

CREATE POLICY "planning_tasks_insert" ON planning_tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (can_access_planning(planning_id));

CREATE POLICY "planning_tasks_update" ON planning_tasks
    FOR UPDATE
    TO authenticated
    USING (can_access_planning(planning_id))
    WITH CHECK (can_access_planning(planning_id));

CREATE POLICY "planning_tasks_delete" ON planning_tasks
    FOR DELETE
    TO authenticated
    USING (can_access_planning(planning_id));

-- Realtime aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE planning_tasks;
