import { describe, it, expect } from 'vitest';
import { diffStations } from './db';
import type { Station } from './types';

const st = (id: string, over: Partial<Station> = {}): Station => ({
  id, number: id, name: `Station ${id}`, description: '', material: '', instructions: '',
  impulses: [], setupBy: '', conductedBy: '', x: 10, y: 10, targetX: 20, targetY: 20,
  isFilled: false, colorVariant: 0, helpersRequired: 1, ...over,
});

describe('diffStations', () => {
  it('schreibt nichts, wenn lokal nichts geändert wurde', () => {
    const prev = [st('a'), st('b')];
    const next = JSON.parse(JSON.stringify(prev)) as Station[];
    expect(diffStations(prev, next, 'p')).toEqual({ inserts: [], updates: [], deleteIds: [] });
  });

  it('löscht keine Stationen, die lokal unbekannt sind (parallel angelegt)', () => {
    // Station "c" existiert nur in der DB — taucht weder in prev noch in next auf.
    const prev = [st('a')];
    const next = [st('a')];
    expect(diffStations(prev, next, 'p').deleteIds).toEqual([]);
  });

  it('löscht nur lokal entfernte Stationen', () => {
    const prev = [st('a'), st('b')];
    const next = [st('a')];
    expect(diffStations(prev, next, 'p').deleteIds).toEqual(['b']);
  });

  it('schreibt nur die geänderten Spalten einer Station', () => {
    const prev = [st('a', { conductedBy: 'Armin' })];
    const next = [st('a', { conductedBy: 'Kephas' })];
    expect(diffStations(prev, next, 'p').updates).toEqual([{ id: 'a', patch: { conducted_by: 'Kephas' } }]);
  });

  it('überschreibt unveränderte Stationen nicht mit veraltetem Stand', () => {
    // Lokaler Stand ist veraltet (kennt externe Änderung nicht), hat aber selbst nichts geändert.
    const prev = [st('a', { conductedBy: '' }), st('b')];
    const next = [st('a', { conductedBy: '' }), st('b', { name: 'Neu' })];
    const { updates } = diffStations(prev, next, 'p');
    expect(updates).toEqual([{ id: 'b', patch: { name: 'Neu' } }]);
  });

  it('legt neue Stationen als Insert an', () => {
    const prev = [st('a')];
    const next = [st('a'), st('b')];
    const { inserts } = diffStations(prev, next, 'p');
    expect(inserts.map(r => r.id)).toEqual(['b']);
    expect(inserts[0].sort_order).toBe(1);
  });

  it('erkennt Umsortierung als sort_order-Änderung', () => {
    const prev = [st('a'), st('b')];
    const next = [st('b'), st('a')];
    const { updates } = diffStations(prev, next, 'p');
    expect(updates).toEqual([
      { id: 'b', patch: { sort_order: 0 } },
      { id: 'a', patch: { sort_order: 1 } },
    ]);
  });

  it('erkennt Änderungen an Impulsen', () => {
    const prev = [st('a', { impulses: ['x'] })];
    const next = [st('a', { impulses: ['x', 'y'] })];
    expect(diffStations(prev, next, 'p').updates).toEqual([{ id: 'a', patch: { impulses: ['x', 'y'] } }]);
  });
});
