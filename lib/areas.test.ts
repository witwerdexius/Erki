import { describe, it, expect } from 'vitest';
import {
    AREA_NONE,
    areaAtPoint,
    areaToVisual,
    assignStationToArea,
    autoAreaForStation,
    findFreeSpotInArea,
    effectiveArea,
    effectiveAreaName,
    polygonCentroid,
    removeArea,
} from './areas';
import type { PlanArea } from './types';

const square = (id: string, name: string, x0: number, y0: number, x1: number, y1: number): PlanArea => ({
    id, name, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

const saal = square('a1', 'Saal', 10, 10, 50, 50);
const garten = square('a2', 'Garten', 50, 50, 90, 90);
const buehne = square('a3', 'Bühne', 20, 20, 30, 30); // liegt im Saal

describe('areaAtPoint / autoAreaForStation', () => {
    it('findet den Bereich, in dem der Punkt liegt', () => {
        expect(areaAtPoint([saal, garten], 30, 40)?.name).toBe('Saal');
        expect(areaAtPoint([saal, garten], 70, 70)?.name).toBe('Garten');
        expect(areaAtPoint([saal, garten], 95, 5)).toBeUndefined();
    });
    it('bei Ueberlappung gewinnt der kleinere Bereich', () => {
        expect(areaAtPoint([saal, buehne], 25, 25)?.name).toBe('Bühne');
        expect(areaAtPoint([buehne, saal], 25, 25)?.name).toBe('Bühne');
    });
    it('beruecksichtigt den Zoom (Bereich ungezoomt gespeichert, Marker sichtbar)', () => {
        // Saal 10..50 bei Zoom 0.5 -> sichtbar 30..50
        expect(areaToVisual(saal, 0.5)[0]).toEqual({ x: 30, y: 30 });
        expect(areaAtPoint([saal], 20, 20, 0.5)).toBeUndefined();
        expect(areaAtPoint([saal], 40, 40, 0.5)?.name).toBe('Saal');
    });
    it('Station: Marker entscheidet', () => {
        expect(autoAreaForStation({ targetX: 60, targetY: 80 }, [saal, garten])?.id).toBe('a2');
    });
    it('keine Bereiche -> undefined', () => {
        expect(areaAtPoint(undefined, 10, 10)).toBeUndefined();
        expect(areaAtPoint([], 10, 10)).toBeUndefined();
    });
});

describe('effectiveArea', () => {
    const areas = [saal, garten];
    it('ohne manuelle Wahl: automatisch', () => {
        expect(effectiveAreaName({ targetX: 30, targetY: 30 }, areas)).toBe('Saal');
        expect(effectiveAreaName({ targetX: 30, targetY: 30, areaId: null }, areas)).toBe('Saal');
    });
    it('manuelle Wahl schlaegt Automatik', () => {
        expect(effectiveAreaName({ targetX: 30, targetY: 30, areaId: 'a2' }, areas)).toBe('Garten');
    });
    it('AREA_NONE = ausdruecklich kein Bereich', () => {
        expect(effectiveArea({ targetX: 30, targetY: 30, areaId: AREA_NONE }, areas)).toBeUndefined();
        expect(effectiveAreaName({ targetX: 30, targetY: 30, areaId: AREA_NONE }, areas)).toBe('');
    });
    it('manuelle Wahl auf geloeschten Bereich -> wieder automatisch', () => {
        expect(effectiveAreaName({ targetX: 70, targetY: 70, areaId: 'weg' }, areas)).toBe('Garten');
    });
});

describe('polygonCentroid', () => {
    it('Schwerpunkt eines Quadrats', () => {
        const c = polygonCentroid(saal.points);
        expect(c.x).toBeCloseTo(30, 6);
        expect(c.y).toBeCloseTo(30, 6);
    });
    it('entartete Polygone -> Mittelwert, leer -> Mitte', () => {
        expect(polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual({ x: 5, y: 0 });
        expect(polygonCentroid([])).toEqual({ x: 50, y: 50 });
    });
});

describe('removeArea', () => {
    it('entfernt den Bereich und setzt manuelle Zuordnungen auf automatisch', () => {
        const stations = [{ id: 's1', areaId: 'a1' }, { id: 's2', areaId: 'a2' }, { id: 's3', areaId: AREA_NONE }];
        const r = removeArea([saal, garten], stations, 'a1');
        expect(r.areas.map(a => a.id)).toEqual(['a2']);
        expect(r.stations.map(s => s.areaId)).toEqual([null, 'a2', AREA_NONE]);
    });
});

describe('findFreeSpotInArea', () => {
    it('ohne andere Marker: Punkt tief im Bereich (nahe der Mitte)', () => {
        const p = findFreeSpotInArea(saal, []);
        expect(p.x).toBeGreaterThan(25); expect(p.x).toBeLessThan(35);
        expect(p.y).toBeGreaterThan(25); expect(p.y).toBeLessThan(35);
    });
    it('weicht vorhandenen Markern aus', () => {
        const p = findFreeSpotInArea(saal, [{ x: 30, y: 30 }]);
        expect(Math.hypot(p.x - 30, p.y - 30)).toBeGreaterThan(5);
        expect(areaAtPoint([saal], p.x, p.y)?.id).toBe('a1');
    });
    it('mehrere Marker nacheinander stapeln sich nicht', () => {
        const placed: { x: number; y: number }[] = [];
        for (let i = 0; i < 4; i++) placed.push(findFreeSpotInArea(saal, placed));
        for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
            expect(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y)).toBeGreaterThan(8);
        }
    });
    it('beruecksichtigt den Zoom (Ergebnis in sichtbaren %)', () => {
        const p = findFreeSpotInArea(saal, [], 0.5); // sichtbar 30..50
        expect(p.x).toBeGreaterThan(30); expect(p.x).toBeLessThan(50);
    });
});

describe('assignStationToArea', () => {
    const areas = [saal, garten];
    const base = [
        { id: 's1', targetX: 30, targetY: 30, areaId: null as string | null, x: 5, y: 5 },
        { id: 's2', targetX: 70, targetY: 70, areaId: null as string | null, x: 95, y: 95 },
    ];
    it('Bereichswechsel verlegt den Marker in den neuen Bereich, Kreis bleibt', () => {
        const r = assignStationToArea(base, 's1', 'a2', areas);
        const s1 = r.find(s => s.id === 's1')!;
        expect(areaAtPoint(areas, s1.targetX, s1.targetY)?.id).toBe('a2');
        expect(s1.areaId).toBeNull(); // folgt jetzt automatisch dem Marker
        expect([s1.x, s1.y]).toEqual([5, 5]);
        expect(Math.hypot(s1.targetX - 70, s1.targetY - 70)).toBeGreaterThan(5); // nicht auf s2
    });
    it('Marker schon im gewählten Bereich: bleibt liegen', () => {
        const r = assignStationToArea(base, 's1', 'a1', areas);
        expect(r[0]).toEqual({ ...base[0], areaId: null });
    });
    it('"Kein Bereich" und "Automatisch" verschieben nicht', () => {
        expect(assignStationToArea(base, 's1', AREA_NONE, areas)[0]).toEqual({ ...base[0], areaId: AREA_NONE });
        expect(assignStationToArea([{ ...base[0], areaId: 'a2' }], 's1', null, areas)[0]).toEqual({ ...base[0], areaId: null });
    });
    it('überlappender kleinerer Bereich: Wahl bleibt manuell', () => {
        // Bühne liegt im Saal; Marker in den Saal verlegen kann in der Bühne landen
        const r = assignStationToArea([{ ...base[1] }], 's2', 'a1', [saal, buehne]);
        const s = r[0];
        expect(effectiveArea(s, [saal, buehne])?.id).toBe('a1');
    });
    it('unbekannte Station -> unverändert', () => {
        expect(assignStationToArea(base, 'x', 'a1', areas)).toBe(base);
    });
});
