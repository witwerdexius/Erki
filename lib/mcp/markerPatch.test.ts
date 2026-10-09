import { describe, it, expect, vi } from 'vitest';

// MCP-SDK wird hier nicht gebraucht
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({ McpServer: class {} }));
import { markerPatchForArea } from './server';

const saal = { id: 'a1', name: 'Saal', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }] };
const garten = { id: 'a2', name: 'Garten', points: [{ x: 60, y: 60 }, { x: 90, y: 60 }, { x: 90, y: 90 }, { x: 60, y: 90 }] };

function fakeDb(stations: { id: string; target_x: number; target_y: number; area_id: string | null }[]) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              if (table === 'plannings') return { single: async () => ({ data: { areas: [saal, garten], bg_zoom: 1 }, error: null }) };
              return Promise.resolve({ data: stations, error: null });
            },
          };
        },
      };
    },
  };
}

describe('markerPatchForArea (KI-Schnittstelle)', () => {
  const rows = [
    { id: 's1', target_x: 30, target_y: 30, area_id: null },
    { id: 's2', target_x: 75, target_y: 75, area_id: null },
  ];
  it('Bereichswechsel verlegt den Marker in den Bereich', async () => {
    const p = await markerPatchForArea(fakeDb(rows), 'plan', 's1', { areaId: 'a2' });
    expect(p.target_x as number).toBeGreaterThan(60);
    expect(p.target_y as number).toBeGreaterThan(60);
    expect(p.area_id).toBeNull();
  });
  it('mit explizitem Zielpunkt oder "__none__": keine Verlegung', async () => {
    expect(await markerPatchForArea(fakeDb(rows), 'plan', 's1', { areaId: 'a2', targetX: 5 })).toEqual({});
    expect(await markerPatchForArea(fakeDb(rows), 'plan', 's1', { areaId: '__none__' })).toEqual({});
  });
  it('neue Station: Marker landet frei im Bereich', async () => {
    const p = await markerPatchForArea(fakeDb(rows), 'plan', null, { areaId: 'a1' });
    expect(p.target_x as number).toBeGreaterThan(10);
    expect(p.target_x as number).toBeLessThan(50);
    expect(Math.hypot((p.target_x as number) - 30, (p.target_y as number) - 30)).toBeGreaterThan(5);
  });
  it('unbekannter Bereich -> Fehler', async () => {
    await expect(markerPatchForArea(fakeDb(rows), 'plan', 's1', { areaId: 'gibtsnicht' })).rejects.toThrow(/gibt es/);
  });
});
