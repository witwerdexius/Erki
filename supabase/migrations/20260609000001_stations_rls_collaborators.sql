-- Erweitere can_access_planning: Share-Link-Mitarbeiter (planning_collaborators)
-- erhalten Schreib- und Lesezugriff auf Stationen.
--
-- Ursache des 403: Benutzer, die via Share-Link beigetreten sind, stehen in
-- planning_collaborators, sind aber NICHT Eigentümer der Planung und
-- möglicherweise nicht in derselben Community. can_access_planning prüfte
-- bislang nur Eigentümerschaft und Community – nicht collaborators.
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

              -- Planungsersteller ist in derselben Community
              OR (
                  get_my_community_id() IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM profiles owner_profile
                      WHERE owner_profile.id = p.user_id
                        AND owner_profile.community_id = get_my_community_id()
                  )
              )

              -- Community-Admin darf auch Planungen von Usern ohne Community verwalten
              OR (
                  is_community_admin()
                  AND get_my_community_id() IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM profiles owner_profile
                      WHERE owner_profile.id = p.user_id
                        AND owner_profile.community_id IS NULL
                  )
              )

              -- Share-Link-Mitarbeiter
              OR EXISTS (
                  SELECT 1 FROM planning_collaborators pc
                  WHERE pc.planning_id = p_planning_id
                    AND pc.user_id = auth.uid()
              )
          )
    );
$$;
