import { describe, it, expect, vi } from 'vitest';

// Supabase-Client mocken, damit der Hook-Import nicht den echten Client braucht.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import {
  applyStationEvent,
  isStationEcho,
  mergeExternalPlanUpdate,
  rowToStation,
  useRealtimeSync,
} from './useRealtimeSync';
import type { Plan, Station } from '@/lib/types';

// ── Test-Fixtures ────────────────────────────────────────────────────────

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    id: 's1',
    number: '1',
    name: 'Station 1',
    description: 'desc',
    material: 'mat',
    instructions: 'instr',
    impulses: ['a', 'b'],
    setupBy: 'A',
    conductedBy: 'B',
    x: 10,
    y: 20,
    targetX: 30,
    targetY: 40,
    isFilled: false,
    colorVariant: 0,
    ...overrides,
  };
}

function makeStationRow(s: Station): Record<string, unknown> {
  return {
    id: s.id,
    number: s.number,
    name: s.name,
    description: s.description,
    material: s.material,
    instructions: s.instructions,
    impulses: s.impulses,
    setup_by: s.setupBy,
    conducted_by: s.conductedBy,
    x: s.x,
    y: s.y,
    target_x: s.targetX,
    target_y: s.targetY,
    is_filled: s.isFilled,
    color_variant: s.colorVariant,
  };
}

function makePlan(stations: Station[] = []): Plan {
  return {
    id: 'plan-1',
    title: 'Plan',
    status: 'draft',
    stations,
    bgZoom: 1,
  };
}

// ── rowToStation ─────────────────────────────────────────────────────────

describe('rowToStation', () => {
  it('konvertiert snake_case-Felder in camelCase', () => {
    const s = makeStation();
    expect(rowToStation(makeStationRow(s))).toEqual(s);
  });

  it('liefert leeres impulses-Array wenn null', () => {
    const row = { ...makeStationRow(makeStation()), impulses: null };
    expect(rowToStation(row).impulses).toEqual([]);
  });
});

// ── isStationEcho ────────────────────────────────────────────────────────

describe('isStationEcho', () => {
  it('erkennt identische Stationen als Echo', () => {
    expect(isStationEcho(makeStation(), makeStation())).toBe(true);
  });

  it('erkennt Namen-Änderung als nicht-Echo', () => {
    expect(isStationEcho(makeStation(), makeStation({ name: 'Neu' }))).toBe(false);
  });

  it('erkennt Position-Änderung als nicht-Echo', () => {
    expect(isStationEcho(makeStation({ x: 10 }), makeStation({ x: 11 }))).toBe(false);
  });

  it('erkennt impulses-Reihenfolge-Änderung als nicht-Echo', () => {
    expect(
      isStationEcho(makeStation({ impulses: ['a', 'b'] }), makeStation({ impulses: ['b', 'a'] })),
    ).toBe(false);
  });

  it('erkennt isFilled-Toggle als nicht-Echo', () => {
    expect(
      isStationEcho(makeStation({ isFilled: false }), makeStation({ isFilled: true })),
    ).toBe(false);
  });
});

// ── mergeExternalPlanUpdate ──────────────────────────────────────────────

describe('mergeExternalPlanUpdate', () => {
  const baseRow = { title: 'Neu', status: 'active', updated_at: '2025-01-01' };

  it('merget leichte Felder unabhängig vom Tab', () => {
    const next = mergeExternalPlanUpdate(makePlan(), baseRow, false);
    expect(next.title).toBe('Neu');
    expect(next.status).toBe('active');
    expect(next.updatedAt).toBe('2025-01-01');
  });

  it('lädt schwere Felder NICHT auf leichtem Tab', () => {
    const row = { ...baseRow, background_image: 'data:img', masks: [{ points: [] }] };
    const next = mergeExternalPlanUpdate(makePlan(), row, false);
    expect(next.backgroundImage).toBeUndefined();
    // Keine Mutation der bestehenden masks (current.masks war undefined).
    expect(next.masks).toBeUndefined();
  });

  it('lädt schwere Felder auf heavyTab=true', () => {
    const row = {
      ...baseRow,
      background_image: 'data:img',
      masks: [{ points: [{ x: 1, y: 2 }] }],
      logo_overlay: { x: 0, y: 0, size: 10 },
      label_overlay: { x: 0, y: 0, text: 'L', fontSize: 12 },
      explanation_data: { timeBlocks: [{}, {}, {}], nextDates: [] },
    };
    const next = mergeExternalPlanUpdate(makePlan(), row, true);
    expect(next.backgroundImage).toBe('data:img');
    expect(next.masks).toEqual([{ points: [{ x: 1, y: 2 }] }]);
    expect(next.logoOverlay).toEqual({ x: 0, y: 0, size: 10 });
    expect(next.labelOverlay).toBeDefined();
    expect(next.explanationData).toBeDefined();
  });

  it('behält bestehende current-Werte wenn Row-Felder undefined sind', () => {
    const current = makePlan();
    current.title = 'Alt';
    const next = mergeExternalPlanUpdate(current, {}, false);
    expect(next.title).toBe('Alt');
    expect(next.bgZoom).toBe(1);
  });
});

// ── applyStationEvent ────────────────────────────────────────────────────

describe('applyStationEvent', () => {
  it('UPDATE: ignoriert Echo (identische Felder)', () => {
    const s = makeStation();
    const plan = makePlan([s]);
    expect(applyStationEvent(plan, 'UPDATE', { newRow: makeStationRow(s) })).toBeNull();
  });

  it('UPDATE: ersetzt vorhandene Station bei Änderung', () => {
    const s = makeStation();
    const plan = makePlan([s]);
    const next = applyStationEvent(plan, 'UPDATE', {
      newRow: makeStationRow(makeStation({ name: 'Neu' })),
    });
    expect(next?.stations).toHaveLength(1);
    expect(next?.stations[0]?.name).toBe('Neu');
  });

  it('UPDATE: ignoriert Update für unbekannte Station-ID', () => {
    const plan = makePlan([makeStation({ id: 's1' })]);
    const next = applyStationEvent(plan, 'UPDATE', {
      newRow: makeStationRow(makeStation({ id: 'unknown' })),
    });
    expect(next).toBeNull();
  });

  it('INSERT: hängt neue Station an', () => {
    const plan = makePlan([makeStation({ id: 's1' })]);
    const next = applyStationEvent(plan, 'INSERT', {
      newRow: makeStationRow(makeStation({ id: 's2', name: 'Zwei' })),
    });
    expect(next?.stations).toHaveLength(2);
    expect(next?.stations[1]?.id).toBe('s2');
  });

  it('INSERT: ignoriert wenn ID schon im Plan ist (Doppel-Insert)', () => {
    const plan = makePlan([makeStation({ id: 's1' })]);
    const next = applyStationEvent(plan, 'INSERT', {
      newRow: makeStationRow(makeStation({ id: 's1' })),
    });
    expect(next).toBeNull();
  });

  it('DELETE: entfernt Station aus Liste', () => {
    const plan = makePlan([makeStation({ id: 's1' }), makeStation({ id: 's2' })]);
    const next = applyStationEvent(plan, 'DELETE', { oldRow: { id: 's1' } });
    expect(next?.stations.map(s => s.id)).toEqual(['s2']);
  });

  it('DELETE: ignoriert Delete für unbekannte ID', () => {
    const plan = makePlan([makeStation({ id: 's1' })]);
    const next = applyStationEvent(plan, 'DELETE', { oldRow: { id: 'unknown' } });
    expect(next).toBeNull();
  });
});

// ── useRealtimeSync (Modul-Export-Smoketest) ────────────────────────────

// Hinweis: Vollständige React-Hook-Tests bräuchten @testing-library/react
// (per Constraints nicht verfügbar). Die Pure-Helper oben decken die
// kritische Logik ab; hier nur ein Modul-Export-Smoketest.
describe('useRealtimeSync (module export)', () => {
  it('exportiert die Hook-Funktion', () => {
    expect(typeof useRealtimeSync).toBe('function');
  });

  it('akzeptiert genau ein Options-Objekt', () => {
    expect(useRealtimeSync.length).toBe(1);
  });
});
