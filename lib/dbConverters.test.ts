import { describe, it, expect } from 'vitest';
import { rowToPlan, rowToStation, stationToRow, rowToTemplate, rowToProfile } from './db';
import type { Station } from './types';

const baseStationRow = {
  id: 'st-1',
  number: '1',
  name: 'Wasser-Station',
  description: 'Beschreibung',
  material: 'Eimer',
  instructions: 'Aufstellen',
  impulses: ['frage1', 'frage2'],
  setup_by: 'Anna',
  conducted_by: 'Tim',
  x: 25,
  y: 75,
  target_x: 30,
  target_y: 70,
  is_filled: true,
  color_variant: 2,
};

const basePlanRow = {
  id: 'plan-1',
  title: 'Sternstunden',
  status: 'active',
  url: 'https://example.org',
  background_image: 'data:image/png;base64,abc',
  masks: [{ points: [{ x: 1, y: 2 }] }],
  logo_overlay: { x: 10, y: 10, size: 20 },
  label_overlay: { x: 50, y: 50, text: 'ErKi', fontSize: 16 },
  bg_zoom: 1.5,
  explanation_data: { timeBlocks: [], nextDates: [] },
  source_url: 'https://jugendarbeit.online/x',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-02T00:00:00Z',
};

describe('rowToStation', () => {
  it('mappt snake_case → camelCase', () => {
    const s = rowToStation(baseStationRow);
    expect(s).toEqual({
      id: 'st-1', number: '1', name: 'Wasser-Station', description: 'Beschreibung',
      material: 'Eimer', instructions: 'Aufstellen', impulses: ['frage1', 'frage2'],
      setupBy: 'Anna', conductedBy: 'Tim', x: 25, y: 75, targetX: 30, targetY: 70,
      isFilled: true, colorVariant: 2,
    });
  });

  it('impulses defaultet auf [] wenn undefined', () => {
    expect(rowToStation({ ...baseStationRow, impulses: undefined }).impulses).toEqual([]);
  });

  it('impulses defaultet auf [] wenn null', () => {
    expect(rowToStation({ ...baseStationRow, impulses: null }).impulses).toEqual([]);
  });
});

describe('stationToRow', () => {
  const station: Station = {
    id: 'st-1', number: '1', name: 'X', description: 'd', material: 'm',
    instructions: 'i', impulses: ['a'], setupBy: 'A', conductedBy: 'B',
    x: 1, y: 2, targetX: 3, targetY: 4, isFilled: true, colorVariant: 3,
  };

  it('mappt camelCase → snake_case und ergänzt planning_id + sort_order', () => {
    const row = stationToRow(station, 'plan-42', 7);
    expect(row.planning_id).toBe('plan-42');
    expect(row.sort_order).toBe(7);
    expect(row.setup_by).toBe('A');
    expect(row.conducted_by).toBe('B');
    expect(row.target_x).toBe(3);
    expect(row.target_y).toBe(4);
    expect(row.is_filled).toBe(true);
    expect(row.color_variant).toBe(3);
  });

  it('isFilled defaultet auf false wenn undefined', () => {
    const { isFilled: _i, ...rest } = station;
    expect(stationToRow(rest as Station, 'p', 0).is_filled).toBe(false);
  });

  it('colorVariant defaultet auf 0 wenn undefined', () => {
    const { colorVariant: _c, ...rest } = station;
    expect(stationToRow(rest as Station, 'p', 0).color_variant).toBe(0);
  });

  it('round-trip stationToRow → rowToStation ist verlustfrei (mit definierten Defaults)', () => {
    const row = stationToRow(station, 'plan-1', 0);
    const back = rowToStation(row);
    expect(back).toEqual(station);
  });
});

describe('rowToPlan', () => {
  it('mappt snake_case → camelCase und nutzt übergebene stations', () => {
    const stations = [rowToStation(baseStationRow)];
    const p = rowToPlan(basePlanRow, stations);
    expect(p.id).toBe('plan-1');
    expect(p.title).toBe('Sternstunden');
    expect(p.status).toBe('active');
    expect(p.backgroundImage).toBe('data:image/png;base64,abc');
    expect(p.bgZoom).toBe(1.5);
    expect(p.sourceUrl).toBe('https://jugendarbeit.online/x');
    expect(p.stations).toBe(stations);
  });

  it('masks defaultet auf [] wenn null/undefined', () => {
    expect(rowToPlan({ ...basePlanRow, masks: null }, []).masks).toEqual([]);
    expect(rowToPlan({ ...basePlanRow, masks: undefined }, []).masks).toEqual([]);
  });

  it('bgZoom defaultet auf 1 wenn undefined', () => {
    expect(rowToPlan({ ...basePlanRow, bg_zoom: undefined }, []).bgZoom).toBe(1);
  });

  it('optionale Felder werden zu undefined wenn null', () => {
    const minimal = {
      id: 'p', title: 't', status: 'draft',
      url: null, background_image: null, masks: null,
      logo_overlay: null, label_overlay: null, bg_zoom: null,
      explanation_data: null, source_url: null,
      created_at: null, updated_at: null,
    };
    const p = rowToPlan(minimal, []);
    expect(p.url).toBeUndefined();
    expect(p.backgroundImage).toBeUndefined();
    expect(p.logoOverlay).toBeUndefined();
    expect(p.labelOverlay).toBeUndefined();
    expect(p.explanationData).toBeUndefined();
    expect(p.sourceUrl).toBeUndefined();
  });
});

describe('rowToTemplate', () => {
  const row = {
    id: 't-1', name: 'Vorlage', description: 'd', material: 'm', instructions: 'i',
    impulses: ['x'], setup_by: 'A', conducted_by: 'B', created_at: '2026-01-01',
  };

  it('mappt snake_case → camelCase', () => {
    expect(rowToTemplate(row)).toEqual({
      id: 't-1', name: 'Vorlage', description: 'd', material: 'm', instructions: 'i',
      impulses: ['x'], setupBy: 'A', conductedBy: 'B', createdAt: '2026-01-01',
    });
  });

  it('impulses defaultet auf [] wenn undefined', () => {
    expect(rowToTemplate({ ...row, impulses: undefined }).impulses).toEqual([]);
  });
});

describe('rowToProfile', () => {
  const row = {
    id: 'u-1', community_id: 'c-1', role: 'admin',
    display_name: 'Anna A.', email: 'a@b.de', name: 'Anna', team: 'Aktiv-Zeit',
    created_at: '2026-01-01',
  };

  it('mappt snake_case → camelCase', () => {
    const p = rowToProfile(row);
    expect(p).toEqual({
      id: 'u-1', communityId: 'c-1', role: 'admin',
      displayName: 'Anna A.', email: 'a@b.de', name: 'Anna', team: 'Aktiv-Zeit',
      createdAt: '2026-01-01',
    });
  });

  it("role defaultet auf 'user' wenn undefined", () => {
    expect(rowToProfile({ ...row, role: undefined }).role).toBe('user');
  });

  it('null-Werte werden zu undefined (display_name, email, name, team)', () => {
    const p = rowToProfile({ ...row, display_name: null, email: null, name: null, team: null });
    expect(p.displayName).toBeUndefined();
    expect(p.email).toBeUndefined();
    expect(p.name).toBeUndefined();
    expect(p.team).toBeUndefined();
  });

  it('community_id wird durchgereicht (auch null erlaubt)', () => {
    expect(rowToProfile({ ...row, community_id: null }).communityId).toBeNull();
  });
});
