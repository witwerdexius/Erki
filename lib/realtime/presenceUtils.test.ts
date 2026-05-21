import { describe, it, expect } from 'vitest';
import { dedupeOnlineUsers, getInitials, getPresenceColor } from './presenceUtils';

describe('dedupeOnlineUsers', () => {
  it('liefert leeres Array für leere Liste', () => {
    expect(dedupeOnlineUsers([])).toEqual([]);
  });

  it('lässt einen einzelnen Eintrag unverändert', () => {
    const input = [{ userId: 'a', displayName: 'Anna' }];
    expect(dedupeOnlineUsers(input)).toEqual(input);
  });

  it('dedupliziert mehrere Einträge mit gleicher userId (erstes Vorkommen gewinnt)', () => {
    const input = [
      { userId: 'a', displayName: 'Anna (Tab 1)' },
      { userId: 'b', displayName: 'Bert' },
      { userId: 'a', displayName: 'Anna (Tab 2)' },
    ];
    const result = dedupeOnlineUsers(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ userId: 'a', displayName: 'Anna (Tab 1)' });
    expect(result[1]).toEqual({ userId: 'b', displayName: 'Bert' });
  });

  it('überspringt Einträge ohne userId (Defensive)', () => {
    const input = [
      { userId: '', displayName: 'X' },
      { userId: 'a', displayName: 'Anna' },
    ];
    expect(dedupeOnlineUsers(input)).toEqual([{ userId: 'a', displayName: 'Anna' }]);
  });

  it('behält zusätzliche Felder (Generic-Pass-Through)', () => {
    const input = [
      { userId: 'a', displayName: 'Anna', presence_ref: 'ref-1' },
      { userId: 'a', displayName: 'Anna', presence_ref: 'ref-2' },
    ];
    const result = dedupeOnlineUsers(input);
    expect(result).toEqual([{ userId: 'a', displayName: 'Anna', presence_ref: 'ref-1' }]);
  });
});

describe('getInitials', () => {
  it('liefert "?" für leere Strings', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });

  it('liefert ersten Buchstaben (uppercase) für ein Wort', () => {
    expect(getInitials('anna')).toBe('A');
    expect(getInitials('ANNA')).toBe('A');
  });

  it('liefert ersten + letzten Anfangsbuchstaben für mehrere Wörter', () => {
    expect(getInitials('Anna Schmidt')).toBe('AS');
    expect(getInitials('Anna Marie Schmidt')).toBe('AS');
  });

  it('robust gegen Mehrfach-Whitespace', () => {
    expect(getInitials('  Anna   Schmidt  ')).toBe('AS');
  });
});

describe('getPresenceColor', () => {
  it('liefert deterministisch dieselbe Farbe für dieselbe userId', () => {
    expect(getPresenceColor('user-abc')).toBe(getPresenceColor('user-abc'));
  });

  it('liefert eine Farbe aus der Palette (gültiger Hex-Code)', () => {
    const color = getPresenceColor('user-abc');
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('liefert in der Regel verschiedene Farben für verschiedene userIds', () => {
    // Mit 6 Farben und 50 IDs sollten mindestens 2 verschiedene rauskommen.
    const colors = new Set<string>();
    for (let i = 0; i < 50; i++) {
      colors.add(getPresenceColor(`user-${i}`));
    }
    expect(colors.size).toBeGreaterThan(1);
  });
});
