-- Allow anon reads on plannings and stations for shared plannings
-- (used by the share page which fetches without an authenticated user)
CREATE POLICY "plannings_shared_read" ON plannings FOR SELECT
  USING (id IN (SELECT planning_id FROM share_tokens));

CREATE POLICY "stations_shared_read" ON stations FOR SELECT
  USING (planning_id IN (SELECT planning_id FROM share_tokens));
