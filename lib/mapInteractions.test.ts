import { describe, it, expect } from 'vitest';
import {
    clientToPercent,
    distributeColors,
    resolveColorConflicts,
    deriveContainerHeight,
    computeMapScale,
    visualToStoredPercent,
    fitPageSize,
    stationColorHex,
    STATION_COLOR_HEX,
} from './mapInteractions';
import type { Station } from '@/lib/types';

const stub = (id: string, targetX: number, targetY: number, colorVariant?: number): Station => ({
    id,
    number: id,
    name: id,
    description: '',
    material: '',
    instructions: '',
    impulses: [],
    setupBy: '',
    conductedBy: '',
    x: 0,
    y: 0,
    targetX,
    targetY,
    colorVariant,
});

describe('clientToPercent', () => {
    it('konvertiert Client-Koordinaten relativ zum Container in Prozent', () => {
        const rect = { left: 100, top: 50, width: 400, height: 200 };
        expect(clientToPercent(300, 150, rect)).toEqual({ x: 50, y: 50 });
        expect(clientToPercent(100, 50, rect)).toEqual({ x: 0, y: 0 });
        expect(clientToPercent(500, 250, rect)).toEqual({ x: 100, y: 100 });
    });

    it('clampt nicht (Verhalten-Treue zur Inline-Implementierung)', () => {
        const rect = { left: 0, top: 0, width: 100, height: 100 };
        // Maus außerhalb des Containers -> Werte ausserhalb [0,100] sind erlaubt
        const out = clientToPercent(-10, 110, rect);
        expect(out.x).toBeCloseTo(-10, 5);
        expect(out.y).toBeCloseTo(110, 5);
    });
});

describe('deriveContainerHeight', () => {
    it('landscape: width * (210/297)', () => {
        expect(deriveContainerHeight(297, 'landscape')).toBeCloseTo(210, 5);
    });
    it('portrait: width * (297/210)', () => {
        expect(deriveContainerHeight(210, 'portrait')).toBeCloseTo(297, 5);
    });
});

describe('distributeColors', () => {
    it('leeres Array -> leeres Array', () => {
        expect(distributeColors([])).toEqual([]);
    });

    it('mutiert das Eingabe-Array nicht', () => {
        const stations = [stub('a', 10, 10), stub('b', 12, 12)];
        const before = JSON.parse(JSON.stringify(stations));
        distributeColors(stations);
        expect(stations).toEqual(before);
    });

    it('weit auseinander liegende Stationen -> Farben gleichmaessig (nicht alle Tuerkis)', () => {
        const stations = Array.from({ length: 8 }, (_, i) => stub(`s${i}`, (i % 4) * 30, Math.floor(i / 4) * 60));
        const counts = [0, 0, 0, 0];
        for (const s of distributeColors(stations)) counts[s.colorVariant!]++;
        expect(counts).toEqual([2, 2, 2, 2]);
    });

    it('benachbarte Stationen erhalten unterschiedliche Farben', () => {
        // Distanz (10,10) -> (12,12) ≈ 2.83, deutlich unter threshold=20 -> Konflikt
        const stations = [stub('a', 10, 10), stub('b', 12, 12), stub('c', 14, 14)];
        const colors = distributeColors(stations).map(s => s.colorVariant);
        expect(new Set(colors).size).toBe(3);
    });

    it('nebeneinanderliegende Blasen erhalten unterschiedliche Farben (Marker weit weg)', () => {
        const a = { ...stub('a', 10, 10), x: 50, y: 50 };
        const b = { ...stub('b', 90, 90), x: 60, y: 52 };
        const [ra, rb] = distributeColors([a, b]);
        expect(ra.colorVariant).not.toBe(rb.colorVariant);
    });

    it('echter Plan (16 Stationen): je Farbe 4x, keine eng benachbarten mit gleicher Farbe', () => {
        // Marker-/Blasenpositionen aus "26-10-18 Kommt her und esst!"
        const raw: [number, number, number, number][] = [
            [29.86, 47.78, 9.67, 86.62], [74.46, 53.37, 54.22, 80.56], [25.0, 46.25, 9.67, 35.55],
            [31.66, 39.64, 85.38, 33.35], [28.24, 53.37, 42.08, 89.43], [31.3, 67.23, 59.64, 73.25],
            [82.37, 45.74, 90.33, 74.58], [31.12, 71.81, 24.54, 93.05], [27.88, 27.05, 50.15, 21.66],
            [29.86, 57.69, 42.84, 75.89], [27.88, 42.56, 12.31, 10.83], [22.84, 26.67, 48.35, 8.0],
            [24.28, 53.5, 9.67, 58.25], [71.94, 61.51, 75.61, 76.73], [32.2, 44.34, 66.75, 42.15],
            [30.4, 31.37, 49.25, 35.4],
        ];
        const stations = raw.map(([tx, ty, x, y], i) => ({ ...stub(`s${i}`, tx, ty), x, y }));
        const result = distributeColors(stations);
        const counts = [0, 0, 0, 0];
        for (const s of result) counts[s.colorVariant!]++;
        expect(counts).toEqual([4, 4, 4, 4]);
        let sameColorNeighbors = 0;
        for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
            const a = result[i], b = result[j];
            // eng benachbart: Marker < 8 % (wie beim Ziehen) oder Blasen beruehren sich fast
            const near = Math.hypot(a.targetX - b.targetX, a.targetY - b.targetY) < 8 || Math.hypot(a.x - b.x, a.y - b.y) < 22;
            if (near && a.colorVariant === b.colorVariant) sameColorNeighbors++;
        }
        expect(sameColorNeighbors).toBe(0);
    });

    it('deterministisch', () => {
        const stations = Array.from({ length: 10 }, (_, i) => stub(`s${i}`, (i * 37) % 100, (i * 53) % 100));
        expect(distributeColors(stations)).toEqual(distributeColors(stations));
    });
});

describe('resolveColorConflicts', () => {
    it('Station nicht gefunden -> Original-Liste zurück (gleiche Referenz)', () => {
        const stations = [stub('a', 0, 0, 0)];
        const result = resolveColorConflicts('does-not-exist', stations);
        expect(result).toBe(stations);
    });

    it('kein Konflikt -> Original-Liste zurück (gleiche Referenz)', () => {
        const stations = [stub('a', 0, 0, 0), stub('b', 80, 80, 1)];
        const result = resolveColorConflicts('a', stations);
        expect(result).toBe(stations);
    });

    it('Konflikt -> rotiert colorVariant der gedraggten Station', () => {
        // a und b stehen sehr nah beisammen, beide colorVariant=0 -> Konflikt
        const stations = [stub('a', 0, 0, 0), stub('b', 2, 2, 0)];
        const result = resolveColorConflicts('a', stations);
        expect(result).not.toBe(stations);
        expect(result.find(s => s.id === 'a')?.colorVariant).toBe(1);
        // b unverändert
        expect(result.find(s => s.id === 'b')?.colorVariant).toBe(0);
    });

    it('Default-Color via index%4 wenn colorVariant undefined', () => {
        // a (Index 0, default 0) und b (Index 4 = 4%4 = 0) liegen sehr nah
        // beieinander -> Konflikt zwischen den index-basierten Defaults.
        // c/d/e dazwischen werden räumlich weit entfernt platziert, damit sie
        // beim Rotieren nicht stören und der Konflikt eindeutig bleibt.
        const stations = [
            stub('a', 0, 0),
            stub('c', 90, 90),
            stub('d', 80, 80),
            stub('e', 70, 70),
            stub('b', 1, 1),
        ];
        // a default 0, b default (4%4)=0 -> Distanz 1.41 < 8 -> Konflikt erkannt,
        // a rotiert auf 1. c/d/e weit weg, kein weiterer Konflikt.
        const result = resolveColorConflicts('a', stations);
        expect(result.find(s => s.id === 'a')?.colorVariant).toBe(1);
    });
});

describe('computeMapScale', () => {
    it('nutzt die lange Seite: Hoch- und Querformat ergeben denselben Faktor', () => {
        const quer = computeMapScale(2480, 1754);
        const hoch = computeMapScale(1754, 2480);
        expect(quer).toBeCloseTo(3.1, 5);
        expect(hoch).toBeCloseTo(quer, 5);
    });
    it('liefert 1 bei Groesse 0', () => {
        expect(computeMapScale(0, 0)).toBe(1);
    });
});

describe('visualToStoredPercent', () => {
    it('Zoom 1: unveraendert', () => {
        expect(visualToStoredPercent({ x: 12, y: 80 }, 1)).toEqual({ x: 12, y: 80 });
    });
    it('Mitte bleibt bei jedem Zoom die Mitte', () => {
        expect(visualToStoredPercent({ x: 50, y: 50 }, 0.7)).toEqual({ x: 50, y: 50 });
    });
    it('ist die Umkehrung von sichtbar = 50 + (gespeichert - 50) * zoom', () => {
        for (const zoom of [0.7, 0.9, 1.2, 1.3]) {
            const stored = { x: 23, y: 71 };
            const visual = { x: 50 + (stored.x - 50) * zoom, y: 50 + (stored.y - 50) * zoom };
            const back = visualToStoredPercent(visual, zoom);
            expect(back.x).toBeCloseTo(stored.x, 10);
            expect(back.y).toBeCloseTo(stored.y, 10);
        }
    });
    it('Zoom 0 oder negativ -> wie Zoom 1 (kein NaN/Infinity)', () => {
        expect(visualToStoredPercent({ x: 30, y: 40 }, 0)).toEqual({ x: 30, y: 40 });
    });
});

describe('stationColorHex', () => {
    it('nutzt colorVariant, wenn gesetzt', () => {
        expect(stationColorHex(2, 0)).toBe(STATION_COLOR_HEX[2]);
    });
    it('faellt auf den Index zurueck (modulo 4), wie Blasen und Marker', () => {
        expect(stationColorHex(undefined, 5)).toBe(STATION_COLOR_HEX[1]);
        expect(stationColorHex(null, 3)).toBe(STATION_COLOR_HEX[3]);
    });
    it('colorVariant 0 wird nicht als "leer" behandelt', () => {
        expect(stationColorHex(0, 3)).toBe(STATION_COLOR_HEX[0]);
    });
});

describe('fitPageSize', () => {
    const A4 = 210 / 297;
    it('Hochformat auf dem iPhone: exakt A4, durch die Breite begrenzt', () => {
        // 390 px breit, viel Hoehe verfuegbar (vorher: Blatt zu hoch)
        const { width, height } = fitPageSize(374, 700, 'portrait', 1024, 0.8 * 844);
        expect(width).toBeCloseTo(374, 5);
        expect(width / height).toBeCloseTo(A4, 6);
    });
    it('Hochformat am Desktop: durch die Hoehe (max 80vh) begrenzt', () => {
        const { width, height } = fitPageSize(1200, 900, 'portrait', 1024, 0.8 * 1000);
        expect(height).toBeCloseTo(800, 5);
        expect(width / height).toBeCloseTo(A4, 6);
    });
    it('Querformat: volle Breite bis max. 1024 px, Hoehe folgt', () => {
        expect(fitPageSize(1400, 900, 'landscape', 1024, 800)).toEqual({ width: 1024, height: 1024 * A4 });
        const small = fitPageSize(360, 600, 'landscape', 1024, 800);
        expect(small.width).toBe(360);
        expect(small.height / small.width).toBeCloseTo(A4, 6);
    });
    it('noch nicht gemessen -> 0', () => {
        expect(fitPageSize(0, 0, 'portrait', 1024, 800)).toEqual({ width: 0, height: 0 });
    });
    it('Hoehe noch 0 (Layout nicht fertig) -> ueber die Breite', () => {
        const { width, height } = fitPageSize(374, 0, 'portrait', 1024, Infinity);
        expect(width).toBe(374);
        expect(width / height).toBeCloseTo(A4, 6);
    });
});
