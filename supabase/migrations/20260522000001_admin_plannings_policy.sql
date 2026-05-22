-- Admins können alle Planungen verwalten (lesen und bearbeiten)
-- Hintergrund: Die RLS-Policy "Eigene Planungen verwalten" erlaubt nur
-- dem Eigentümer den Zugriff. Admins (role='admin' in profiles) sollen
-- jedoch alle Planungen lesen und bearbeiten können.
CREATE POLICY "admins_manage_all_plannings" ON plannings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
