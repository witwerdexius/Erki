import { describe, it, expect } from 'vitest';
import {
    clientToPercent,
    distributeColors,
    resolveColorConflicts,
    deriveContainerHeight,
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

    it('weit auseinander liegende Stationen -> alle bekommen colorVariant 0', () => {
        // Distanz zwischen (0,0) und (50,50) ≈ 70.7, weit über default threshold=20
        const stations = [stub('a', 0, 0), stub('b', 50, 50)];
        const result = distributeColors(stations);
        expect(result[0].colorVariant).toBe(0);
        expect(result[1].colorVariant).toBe(0);
    });

    it('benachbarte Stationen erhalten unterschiedliche Farben', () => {
        // Distanz (10,10) -> (12,12) ≈ 2.83, deutlich unter threshold=20 -> Konflikt
        const stations = [stub('a', 10, 10), stub('b', 12, 12), stub('c', 14, 14)];
        const result = distributeColors(stations);
        expect(result[0].colorVariant).toBe(0);
        expect(result[1].colorVariant).toBe(1);
        expect(result[2].colorVariant).toBe(2);
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
