-- RLS-Policies für stations-Tabelle ergänzen
--
-- Problem: UPSERT wird geblockt, wenn der User nicht Eigentümer der Planung ist
-- (z. B. Community-Mitglied, das eine Planung eines Kollegen bearbeitet).
-- Die bestehende ALL-Policy prüft nur plannings.user_id = auth.uid() und
-- kann fremde Planungen nicht einsehen, weil plannings-RLS das verhindert.
--
-- Lösung: SECURITY DEFINER Hilfsfunktion, die plannings ohne RLS-Filter prüft,
-- dann 4 granulare Policies (SELECT / INSERT / UPDATE / DELETE).

-- RLS ist bereits aktiviert:
-- ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

-- Helper: prüft ob auth.uid() Zugriff auf eine Planung hat.
-- SECURITY DEFINER nötig, damit die plannings-Tabelle ohne RLS-Filter
-- abgefragt werden kann (sonst sieht ein Community-Mitglied nur eigene Planungen).
CREATE OR REPLACE FUNCTION public.can_access_planning(p_planning_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM plannings p
        WHERE p.id = p_planning_id
          AND (
              -- Eigentümer der Planung
              p.user_id = auth.uid()
              -- Oder: Planungsersteller ist in derselben Community wie der aktuelle User
              OR (
                  get_my_community_id() IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM profiles owner_profile
                      WHERE owner_profile.id = p.user_id
                        AND owner_profile.community_id = get_my_community_id()
                  )
              )
          )
    );
$$;

-- SELECT: authentifizierte User dürfen Stationen lesen für Planungen, die ihnen gehören
CREATE POLICY "stations_auth_select" ON stations
    FOR SELECT
    TO authenticated
    USING (can_access_planning(planning_id));

-- INSERT: authentifizierte User dürfen Stationen für eigene Planungen einfügen
CREATE POLICY "stations_auth_insert" ON stations
    FOR INSERT
    TO authenticated
    WITH CHECK (can_access_planning(planning_id));

-- UPDATE: authentifizierte User dürfen eigene Stationen ändern
CREATE POLICY "stations_auth_update" ON stations
    FOR UPDATE
    TO authenticated
    USING (can_access_planning(planning_id))
    WITH CHECK (can_access_planning(planning_id));

-- DELETE: authentifizierte User dürfen eigene Stationen löschen
CREATE POLICY "stations_auth_delete" ON stations
    FOR DELETE
    TO authenticated
    USING (can_access_planning(planning_id));
