import { describe, it, expect } from 'vitest';
import {
    reorderStationsByDrop,
    reorderStationsByNumberInput,
    nextStationNumber,
} from './stationsTableHelpers';
import type { Station } from '@/lib/types';

function makeStation(id: string, number: string, name = id): Station {
    return {
        id,
        number,
        name,
        description: '',
        material: '',
        instructions: '',
        impulses: [],
        setupBy: '',
        conductedBy: '',
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        isFilled: false,
        colorVariant: 0,
    };
}

describe('reorderStationsByDrop', () => {
    it('verschiebt eine Station nach hinten und renumeriert', () => {
        const stations = [
            makeStation('a', '1'),
            makeStation('b', '2'),
            makeStation('c', '3'),
            makeStation('d', '4'),
        ];
        // Verhalten 1:1 wie alte Inline-Implementierung: toIdx wird vor dem
        // splice(fromIdx, 1) berechnet — beim Verschieben nach hinten landet
        // die Station daher hinter dem Ziel.
        const result = reorderStationsByDrop(stations, 'a', 'c');
        expect(result.map(s => s.id)).toEqual(['b', 'c', 'a', 'd']);
        expect(result.map(s => s.number)).toEqual(['1', '2', '3', '4']);
    });

    it('verschiebt eine Station nach vorne und renumeriert', () => {
        const stations = [
            makeStation('a', '1'),
            makeStation('b', '2'),
            makeStation('c', '3'),
        ];
        const result = reorderStationsByDrop(stations, 'c', 'a');
        expect(result.map(s => s.id)).toEqual(['c', 'a', 'b']);
        expect(result.map(s => s.number)).toEqual(['1', '2', '3']);
    });

    it('liefert dieselbe Referenz zurück, wenn dragged === target', () => {
        const stations = [makeStation('a', '1'), makeStation('b', '2')];
        const result = reorderStationsByDrop(stations, 'a', 'a');
        expect(result).toBe(stations);
    });

    it('mutiert das Eingabe-Array nicht', () => {
        const stations = [makeStation('a', '1'), makeStation('b', '2')];
        const before = stations.map(s => s.id);
        reorderStationsByDrop(stations, 'a', 'b');
        expect(stations.map(s => s.id)).toEqual(before);
    });
});

describe('reorderStationsByNumberInput', () => {
    it('verschiebt zur 1-basierten Zielposition und renumeriert', () => {
        const stations = [
            makeStation('a', '1'),
            makeStation('b', '2'),
            makeStation('c', '3'),
        ];
        const result = reorderStationsByNumberInput(stations, 'c', '1');
        expect(result.map(s => s.id)).toEqual(['c', 'a', 'b']);
        expect(result.map(s => s.number)).toEqual(['1', '2', '3']);
    });

    it('clampt zu hohe Eingaben auf das Maximum', () => {
        const stations = [
            makeStation('a', '1'),
            makeStation('b', '2'),
            makeStation('c', '3'),
        ];
        const result = reorderStationsByNumberInput(stations, 'a', '99');
        expect(result.map(s => s.id)).toEqual(['b', 'c', 'a']);
    });

    it('ignoriert NaN-Eingaben', () => {
        const stations = [makeStation('a', '1'), makeStation('b', '2')];
        const result = reorderStationsByNumberInput(stations, 'a', 'abc');
        expect(result).toBe(stations);
    });

    it('ignoriert Eingaben < 1', () => {
        const stations = [makeStation('a', '1'), makeStation('b', '2')];
        const result = reorderStationsByNumberInput(stations, 'a', '0');
        expect(result).toBe(stations);
    });

    it('normalisiert Nummern auch wenn die Position gleich bleibt', () => {
        const stations = [
            makeStation('a', '5'),
            makeStation('b', '7'),
            makeStation('c', '9'),
        ];
        const result = reorderStationsByNumberInput(stations, 'a', '1');
        expect(result.map(s => s.number)).toEqual(['1', '2', '3']);
    });
});

describe('nextStationNumber', () => {
    it('liefert "1" für eine leere Liste', () => {
        expect(nextStationNumber([])).toBe('1');
    });

    it('liefert max+1 als String', () => {
        const stations = [
            makeStation('a', '3'),
            makeStation('b', '7'),
            makeStation('c', '5'),
        ];
        expect(nextStationNumber(stations)).toBe('8');
    });

    it('ignoriert nicht-numerische Nummern (parseInt → NaN → 0)', () => {
        const stations = [makeStation('a', 'foo'), makeStation('b', '2')];
        expect(nextStationNumber(stations)).toBe('3');
    });
});
