-- Lageplan-Vorlagen (map_templates)
--
-- Speichern den kompletten Lageplan einer Planung zur Wiederverwendung:
-- Hintergrundbild, Zoom, Masken, Bereiche, Logo- und Überschrift-Position.
-- Koordinaten wie in plannings (masks/areas ungezoomt, Overlays in sichtbaren %).
--
-- Sichtbar für die ganze Community; ändern/löschen dürfen der Ersteller und
-- Community-Admins (analog zu can_access_planning).

CREATE TABLE IF NOT EXISTS map_templates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  background_image text,
  bg_zoom          numeric     NOT NULL DEFAULT 1,
  masks            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  areas            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  logo_overlay     jsonb,
  label_overlay    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE map_templates ENABLE ROW LEVEL SECURITY;

-- Ersteller gehört zur Community des Aufrufers, oder Admin verwaltet Ersteller ohne Community
CREATE OR REPLACE FUNCTION public.map_template_in_my_scope(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles creator
    WHERE creator.id = p_user_id
      AND (
        (get_my_community_id() IS NOT NULL AND creator.community_id = get_my_community_id())
        OR (is_community_admin() AND creator.community_id IS NULL)
      )
  );
$$;

CREATE POLICY "map_templates_select" ON map_templates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR map_template_in_my_scope(user_id));

CREATE POLICY "map_templates_insert" ON map_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "map_templates_update" ON map_templates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (is_community_admin() AND map_template_in_my_scope(user_id)))
  WITH CHECK (user_id = auth.uid() OR (is_community_admin() AND map_template_in_my_scope(user_id)));

CREATE POLICY "map_templates_delete" ON map_templates
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (is_community_admin() AND map_template_in_my_scope(user_id)));
