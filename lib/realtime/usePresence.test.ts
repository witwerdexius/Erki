import { describe, it, expect, vi } from 'vitest';

// Supabase-Client mocken, damit der Hook-Import nicht den echten Client braucht.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import { flattenPresenceState, usePresence, type PresenceEntry } from './usePresence';

describe('flattenPresenceState', () => {
  it('liefert leeres Array für leeren State', () => {
    expect(flattenPresenceState({})).toEqual([]);
  });

  it('flacht einen einzelnen Key mit einem Eintrag ab', () => {
    type User = { userId: string };
    const state: Record<string, PresenceEntry<User>[]> = {
      'user-a': [{ presence_ref: 'r1', userId: 'a' }],
    };
    expect(flattenPresenceState<User>(state)).toEqual([
      { presence_ref: 'r1', userId: 'a' },
    ]);
  });

  it('flacht mehrere Keys mit je mehreren Einträgen ab', () => {
    type User = { userId: string };
    const state: Record<string, PresenceEntry<User>[]> = {
      'user-a': [
        { presence_ref: 'r1', userId: 'a' },
        { presence_ref: 'r2', userId: 'a' },
      ],
      'user-b': [{ presence_ref: 'r3', userId: 'b' }],
    };
    const result = flattenPresenceState<User>(state);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.presence_ref).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('überspringt Keys, deren Wert kein Array ist (Defensive gegen unerwartete Shapes)', () => {
    const state = {
      'user-a': [{ presence_ref: 'r1', userId: 'a' }],
      'broken': null as unknown as PresenceEntry<{ userId: string }>[],
    };
    const result = flattenPresenceState(state);
    expect(result).toHaveLength(1);
    expect(result[0]?.presence_ref).toBe('r1');
  });

  it('behält die T-Felder im Ergebnis-Eintrag', () => {
    type User = { userId: string; name: string };
    const state: Record<string, PresenceEntry<User>[]> = {
      'user-a': [{ presence_ref: 'r1', userId: 'a', name: 'Anna' }],
    };
    const result = flattenPresenceState<User>(state);
    expect(result[0]).toEqual({ presence_ref: 'r1', userId: 'a', name: 'Anna' });
  });
});

describe('usePresence (module export)', () => {
  it('exportiert die Hook-Funktion', () => {
    expect(typeof usePresence).toBe('function');
  });
});
