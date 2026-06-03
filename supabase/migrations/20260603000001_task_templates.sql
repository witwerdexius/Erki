-- Aufgaben-Vorlagen (task_templates)
--
-- Community-weit geteilte Vorlagen für wiederkehrende Planungsaufgaben.
-- Analog zur bestehenden "templates"-Tabelle für Stationen.

CREATE TABLE task_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  helpers_required integer    NOT NULL DEFAULT 1,
  time            text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: eigene Vorlagen + Vorlagen der Community-Mitglieder
CREATE POLICY "task_templates_select" ON task_templates
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR (
            get_my_community_id() IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM profiles creator
                WHERE creator.id = user_id
                  AND creator.community_id = get_my_community_id()
            )
        )
    );

-- INSERT: nur eigene Vorlagen anlegen
CREATE POLICY "task_templates_insert" ON task_templates
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- UPDATE / DELETE: nur eigene Vorlagen bearbeiten
CREATE POLICY "task_templates_update" ON task_templates
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "task_templates_delete" ON task_templates
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
