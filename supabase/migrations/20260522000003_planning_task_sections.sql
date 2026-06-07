ALTER TABLE plannings ADD COLUMN IF NOT EXISTS task_sections text[] DEFAULT ARRAY['aufbau','feierzeit','catering','abbau'];
