-- Erweitere can_access_planning: Community-Admins dürfen auch Planungen
-- von Usern ohne community_id lesen und schreiben.
--
-- Ursache des 403: Wenn der Planungseigentümer community_id = NULL hat
-- (noch nicht einer Community zugeordnet), schlägt der Community-Check fehl,
-- obwohl der Admin die Planung über share_tokens sehen und im Editor öffnen kann.
-- Die fehlende Schreibberechtigung auf stations führt dann zu code 42501.
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
              -- (neue User die noch nicht einer Community zugeordnet wurden)
              OR (
                  is_community_admin()
                  AND get_my_community_id() IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM profiles owner_profile
                      WHERE owner_profile.id = p.user_id
                        AND owner_profile.community_id IS NULL
                  )
              )
          )
    );
$$;
