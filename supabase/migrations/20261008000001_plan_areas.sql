-- Bereiche im Lageplan (z. B. "Saal", "Garten") zum Gruppieren von Stationen.
-- plannings.areas: [{ id, name, points: [{x,y}] }] — Koordinaten in % (ungezoomt, wie masks)
-- stations.area_id: manuell gewaehlter Bereich (id aus plannings.areas) oder
--                   '__none__' fuer "kein Bereich"; NULL = automatisch nach Marker-Position
ALTER TABLE plannings ADD COLUMN IF NOT EXISTS areas jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE stations  ADD COLUMN IF NOT EXISTS area_id text;
