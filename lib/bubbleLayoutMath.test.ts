import { describe, it, expect } from 'vitest';
import { computeBubbleSlots, type Marker, type BlockedZone } from './bubbleLayoutMath';

const W = 800;
const H = 600;
const R = 48; // bubbleRadius bei W=800: 48 * (800/800) = 48
const onPerimeter = (x: number, y: number) =>
    Math.abs(x - (R + 10)) < 1 || Math.abs(x - (W - R - 10)) < 1 ||
    Math.abs(y - (R + 10)) < 1 || Math.abs(y - (H - R - 10)) < 1;

describe('computeBubbleSlots', () => {
    it('empty input -> empty output', () => {
        const result = computeBubbleSlots({ markers: [], containerWidth: W, containerHeight: H });
        expect(Object.keys(result)).toHaveLength(0);
    });

    it('container width=0 -> empty result, no NaN', () => {
        const m: Marker[] = [{ id: 'a', x: 10, y: 10 }];
        const result = computeBubbleSlots({ markers: m, containerWidth: 0, containerHeight: H });
        expect(Object.keys(result)).toHaveLength(0);
    });

    it('container height=0 -> empty result, no NaN', () => {
        const m: Marker[] = [{ id: 'a', x: 10, y: 10 }];
        const result = computeBubbleSlots({ markers: m, containerWidth: W, containerHeight: 0 });
        expect(Object.keys(result)).toHaveLength(0);
    });

    it('single station -> projects to perimeter', () => {
        const result = computeBubbleSlots({ markers: [{ id: 'a', x: 200, y: 300 }], containerWidth: W, containerHeight: H });
        const slot = result['a'];
        expect(slot).toBeDefined();
        expect(onPerimeter(slot.x, slot.y)).toBe(true);
    });

    it('two stations -> both placed and on perimeter, IDs preserved', () => {
        const markers: Marker[] = [{ id: 'a', x: 200, y: 200 }, { id: 'b', x: 600, y: 400 }];
        const result = computeBubbleSlots({ markers, containerWidth: W, containerHeight: H });
        expect(Object.keys(result).sort((a, b) => a.localeCompare(b))).toEqual(['a', 'b']);
        expect(onPerimeter(result['a'].x, result['a'].y)).toBe(true);
        expect(onPerimeter(result['b'].x, result['b'].y)).toBe(true);
    });

    it('two stations with collision tendency -> separated by at least 2*R-ish', () => {
        // Beide Marker fast identisch -> Modul muss sie trennen.
        const markers: Marker[] = [{ id: 'a', x: 400, y: 295 }, { id: 'b', x: 400, y: 305 }];
        const result = computeBubbleSlots({ markers, containerWidth: W, containerHeight: H });
        const dx = result['a'].x - result['b'].x;
        const dy = result['a'].y - result['b'].y;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThan(2 * R);
    });

    it('crossing markers -> swap untangles (slot order matches marker angular order)', () => {
        // Marker links/rechts mit Y-Versatz; Anfangs-Projektion koennte kreuzen,
        // nach Swap muss linker Marker linkeren Slot bekommen.
        const markers: Marker[] = [{ id: 'L', x: 200, y: 300 }, { id: 'R', x: 600, y: 300 }];
        const result = computeBubbleSlots({ markers, containerWidth: W, containerHeight: H });
        // Linker Marker -> Slot soll auch links liegen (kein x-Tausch)
        expect(result['L'].x).toBeLessThan(result['R'].x);
    });

    it('marker inside blocked zone -> slot pushed outside the zone bounds', () => {
        // Sperrzone bedeckt das ganze obere Drittel + linke Haelfte.
        const blockedZones: BlockedZone[] = [{ x: 0, y: 0, width: 50, height: 25 }];
        const result = computeBubbleSlots({
            markers: [{ id: 'a', x: 100, y: 80 }],
            containerWidth: W, containerHeight: H, blockedZones,
        });
        const lx = 0, ly = 0;
        const lw = (50 / 100) * W; // 400
        const lh = (25 / 100) * W; // 200, in % der Breite (s. Modul-Doku)
        const inZone = result['a'].x >= lx - R && result['a'].x <= lx + lw + R &&
                       result['a'].y >= ly - R && result['a'].y <= ly + lh + R;
        expect(inZone).toBe(false);
    });

    it('identical positions, same input twice -> deterministic output', () => {
        const markers: Marker[] = [
            { id: 'a', x: 400, y: 300 }, { id: 'b', x: 400, y: 300 }, { id: 'c', x: 400, y: 300 },
        ];
        const r1 = computeBubbleSlots({ markers, containerWidth: W, containerHeight: H });
        const r2 = computeBubbleSlots({ markers, containerWidth: W, containerHeight: H });
        expect(r1).toEqual(r2);
        for (const id of ['a', 'b', 'c']) {
            expect(Number.isFinite(r1[id].x)).toBe(true);
            expect(Number.isFinite(r1[id].y)).toBe(true);
        }
    });

    it('all slots stay within the container after clamping', () => {
        const markers: Marker[] = Array.from({ length: 6 }, (_, i) => ({
            id: `s${i}`, x: 100 + i * 100, y: 200 + (i % 2) * 200,
        }));
        const result = computeBubbleSlots({ markers, containerWidth: W, containerHeight: H });
        for (const id of Object.keys(result)) {
            expect(result[id].x).toBeGreaterThanOrEqual(R);
            expect(result[id].x).toBeLessThanOrEqual(W - R);
            expect(result[id].y).toBeGreaterThanOrEqual(R);
            expect(result[id].y).toBeLessThanOrEqual(H - R);
        }
    });
});
