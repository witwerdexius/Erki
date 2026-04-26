-- share_tokens: für Link-Sharing
CREATE TABLE share_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  planning_id uuid NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64url'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- planning_collaborators: wer arbeitet mit
CREATE TABLE planning_collaborators (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  planning_id uuid NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'editor')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(planning_id, user_id)
);

-- RLS aktivieren
ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_collaborators ENABLE ROW LEVEL SECURITY;

-- share_tokens: jeder kann lesen (für Token-Auflösung), nur Owner darf erstellen
CREATE POLICY "share_tokens_read" ON share_tokens FOR SELECT USING (true);
CREATE POLICY "share_tokens_insert" ON share_tokens FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- planning_collaborators: eigene Zeilen sehen + Beitritt per Token
CREATE POLICY "collaborators_own" ON planning_collaborators FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "collaborators_join" ON planning_collaborators FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "collaborators_delete_own" ON planning_collaborators FOR DELETE
  USING (user_id = auth.uid());
