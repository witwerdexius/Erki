import { describe, it, expect } from 'vitest';
import {
  applyEditingBroadcast,
  pruneStaleEditing,
  STALE_MS,
  type EditingMap,
} from './editingMapHelpers';

describe('applyEditingBroadcast', () => {
  const baseMap: EditingMap = {};
  const now = 1_700_000_000_000;

  it("'start' fügt einen Eintrag mit Timestamp hinzu", () => {
    const result = applyEditingBroadcast(
      baseMap,
      { stationId: 's1', action: 'start', userId: 'u1', displayName: 'Anna' },
      now,
    );
    expect(result).toEqual({
      s1: { userId: 'u1', displayName: 'Anna', ts: now },
    });
  });

  it("'start' überschreibt einen bestehenden Eintrag (auch von anderem User)", () => {
    const map: EditingMap = {
      s1: { userId: 'u1', displayName: 'Anna', ts: now - 1000 },
    };
    const result = applyEditingBroadcast(
      map,
      { stationId: 's1', action: 'start', userId: 'u2', displayName: 'Bert' },
      now,
    );
    expect(result.s1).toEqual({ userId: 'u2', displayName: 'Bert', ts: now });
  });

  it("'start' ohne userId/displayName wird ignoriert (Map-Referenz bleibt stabil)", () => {
    const map: EditingMap = { s1: { userId: 'u1', displayName: 'Anna', ts: now } };
    const result = applyEditingBroadcast(
      map,
      { stationId: 's1', action: 'start' },
      now,
    );
    expect(result).toBe(map);
  });

  it("'stop' entfernt den Eintrag des passenden Users", () => {
    const map: EditingMap = { s1: { userId: 'u1', displayName: 'Anna', ts: now } };
    const result = applyEditingBroadcast(
      map,
      { stationId: 's1', action: 'stop', userId: 'u1' },
      now,
    );
    expect(result).toEqual({});
  });

  it("'stop' ohne bestehenden Eintrag liefert Original-Referenz (No-Op)", () => {
    const map: EditingMap = {};
    const result = applyEditingBroadcast(
      map,
      { stationId: 's1', action: 'stop', userId: 'u1' },
      now,
    );
    expect(result).toBe(map);
  });

  it("'stop' von User A kann Lock von User B nicht aufheben (Race-Condition-Schutz)", () => {
    const map: EditingMap = { s1: { userId: 'u1', displayName: 'Anna', ts: now } };
    const result = applyEditingBroadcast(
      map,
      { stationId: 's1', action: 'stop', userId: 'u2' },
      now,
    );
    expect(result).toBe(map);
    expect(result.s1).toBeDefined();
  });

  it("'stop' ohne userId akzeptiert (Legacy-Sender-Kompatibilität)", () => {
    const map: EditingMap = { s1: { userId: 'u1', displayName: 'Anna', ts: now } };
    const result = applyEditingBroadcast(
      map,
      { stationId: 's1', action: 'stop' },
      now,
    );
    expect(result).toEqual({});
  });

  it('Nachricht ohne stationId wird ignoriert', () => {
    const map: EditingMap = {};
    const result = applyEditingBroadcast(
      map,
      { stationId: '', action: 'start', userId: 'u1', displayName: 'Anna' },
      now,
    );
    expect(result).toBe(map);
  });

  it('lässt andere Stations-Einträge bei einer Mutation in Ruhe', () => {
    const map: EditingMap = {
      s1: { userId: 'u1', displayName: 'Anna', ts: now - 1000 },
      s2: { userId: 'u2', displayName: 'Bert', ts: now - 2000 },
    };
    const result = applyEditingBroadcast(
      map,
      { stationId: 's1', action: 'stop', userId: 'u1' },
      now,
    );
    expect(result).toEqual({
      s2: { userId: 'u2', displayName: 'Bert', ts: now - 2000 },
    });
  });
});

describe('pruneStaleEditing', () => {
  const now = 1_700_000_000_000;

  it('liefert Original-Referenz, wenn nichts stale ist (kein unnötiger Re-Render)', () => {
    const map: EditingMap = { s1: { userId: 'u1', displayName: 'Anna', ts: now } };
    const result = pruneStaleEditing(map, now);
    expect(result).toBe(map);
  });

  it('entfernt Einträge älter als STALE_MS', () => {
    const map: EditingMap = {
      fresh: { userId: 'u1', displayName: 'Anna', ts: now },
      stale: { userId: 'u2', displayName: 'Bert', ts: now - STALE_MS - 1 },
    };
    const result = pruneStaleEditing(map, now);
    expect(result).toEqual({
      fresh: { userId: 'u1', displayName: 'Anna', ts: now },
    });
  });

  it('Eintrag genau am Cutoff bleibt erhalten (>=)', () => {
    const map: EditingMap = {
      borderline: { userId: 'u1', displayName: 'Anna', ts: now - STALE_MS },
    };
    const result = pruneStaleEditing(map, now);
    expect(result).toBe(map);
  });

  it('liefert leere Map, wenn alle Einträge stale sind', () => {
    const map: EditingMap = {
      a: { userId: 'u1', displayName: 'A', ts: now - STALE_MS - 100 },
      b: { userId: 'u2', displayName: 'B', ts: now - STALE_MS - 200 },
    };
    const result = pruneStaleEditing(map, now);
    expect(result).toEqual({});
  });
});
