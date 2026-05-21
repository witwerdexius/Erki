import { describe, it, expect, vi } from 'vitest';

// Supabase-Client mocken, damit der Hook-Import nicht den echten Client braucht.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import { useBroadcast } from './useBroadcast';

// Hinweis: `useBroadcast` ist React-Glue ohne natürlich extrahierbare Pure-Logic
// (anders als `flattenPresenceState` in `usePresence.ts`). Funktionale Tests, die
// mount/unmount durchspielen, brauchten `@testing-library/react` oder
// `react-test-renderer` — beides per Aufgabenbeschreibung explizit verboten.
// Daher hier nur ein Modul-Export-Smoketest; die Verhalten-Tests passieren in
// einer späteren Welle, wenn die Hooks an UI-Komponenten verdrahtet werden und
// durch Component-Tests / E2E-Tests abgedeckt sind.
describe('useBroadcast (module export)', () => {
  it('exportiert die Hook-Funktion', () => {
    expect(typeof useBroadcast).toBe('function');
  });

  it('hat genau einen Parameter (Options-Objekt)', () => {
    expect(useBroadcast.length).toBe(1);
  });
});
