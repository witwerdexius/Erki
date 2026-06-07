-- Entfernt den CHECK-Constraint auf planning_tasks.section,
-- damit custom Rubriken (beliebiger text) gespeichert werden können.
-- Der Constraint erlaubte nur ('aufbau', 'feierzeit', 'catering', 'abbau').
ALTER TABLE planning_tasks DROP CONSTRAINT IF EXISTS planning_tasks_section_check;
