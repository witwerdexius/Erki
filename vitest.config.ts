import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/__tests__/**/*.ts'],
    env: {
      // Dummy-Werte, damit lib/supabase.ts beim Import nicht crasht.
      // Tests greifen nicht auf Supabase zu — nur pure Funktionen.
      NEXT_PUBLIC_SUPABASE_URL: 'https://dummy.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
