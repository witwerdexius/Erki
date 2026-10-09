-- Nachdenktexte: Instruktionstext und importierte Texte pro Planung,
-- persoenlicher Standard-Instruktionstext im Profil.
ALTER TABLE plannings ADD COLUMN IF NOT EXISTS nachdenk_instruction text;   -- NULL = Standard (Profil oder eingebaut)
ALTER TABLE plannings ADD COLUMN IF NOT EXISTS nachdenk_rows jsonb;         -- [{station, ueberschrift, teil1, bibelzitat, teil2}]
ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS nachdenk_instruction_default text;
