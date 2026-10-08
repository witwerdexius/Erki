import { describe, it, expect } from 'vitest';
import {
    AREA_NONE,
    areaAtPoint,
    areaToVisual,
    autoAreaForStation,
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
