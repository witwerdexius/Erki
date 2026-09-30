import { describe, it, expect } from 'vitest';
import {
    computePolygonPerimeterSlots,
    segmentsCross,
    type Marker,
    type MaskPolygon,
    type BlockedZone,
    type LayoutResult,
} from './bubbleLayoutMath';
import { extractOuterLoops, makeMaskDistance, pointInPoly, rectSignedDistance } from './offsetContour';

// A4 bei ~1123 px langer Seite (wie Mockup), r = 48 * 1123/800
const LONG = 1123, SHORT = 794;
const R = 48 * (LONG / 800);

const toPx = (m: MaskPolygon, W: number, H: number) => m.points.map(p => ({ x: p.x / 100 * W, y: p.y / 100 * H }));

function markersInside(mask: MaskPolygon, W: number, H: number, n: number): Marker[] {
    const poly = toPx(mask, W, H);
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const out: Marker[] = [];
    // deterministisches Raster, nur Punkte innerhalb der Maske
    const grid = Math.ceil(Math.sqrt(n * 6));
    const cand: { x: number; y: number }[] = [];
    for (let j = 1; j < grid; j++) for (let i = 1; i < grid; i++) {
        const x = x0 + (x1 - x0) * i / grid, y = y0 + (y1 - y0) * j / grid;
        if (pointInPoly(x, y, poly)) cand.push({ x, y });
    }
    const stride = cand.length / n;
    for (let k = 0; k < n; k++) {
        const c = cand[Math.floor(k * stride)];
        out.push({ id: `s${k}`, x: c.x, y: c.y });
    }
    return out;
}

function expectCleanLayout(res: LayoutResult, markers: Marker[], masks: MaskPolygon[], W: number, H: number, r: number) {
    const ids = Object.keys(res);
    expect(ids.sort()).toEqual(markers.map(m => m.id).sort());
    const pts = markers.map(m => res[m.id]);
    const dist = makeMaskDistance(masks.map(m => toPx(m, W, H)));
    for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(r - 1);
        expect(p.x).toBeLessThanOrEqual(W - r + 1);
        expect(p.y).toBeGreaterThanOrEqual(r - 1);
        expect(p.y).toBeLessThanOrEqual(H - r + 1);
        expect(dist(p.x, p.y)).toBeGreaterThan(0); // Mittelpunkt nie in der Maske
    }
    // keine Ueberlappung
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(2 * r - 1e-3);
    }
    // keine Linienkreuzungen
    let crossings = 0;
    for (let i = 0; i < markers.length; i++) for (let j = i + 1; j < markers.length; j++) {
        const a = markers[i], b = markers[j];
        if (segmentsCross(a.x, a.y, res[a.id].x, res[a.id].y, b.x, b.y, res[b.id].x, res[b.id].y)) crossings++;
    }
    return { pts, dist, crossings };
}

const rectMask: MaskPolygon = { points: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }] };
// U-Form (konkav), Oeffnung nach oben
const uMask: MaskPolygon = {
    points: [
        { x: 25, y: 25 }, { x: 40, y: 25 }, { x: 40, y: 55 }, { x: 60, y: 55 },
        { x: 60, y: 25 }, { x: 75, y: 25 }, { x: 75, y: 75 }, { x: 25, y: 75 },
    ],
};
// hohe, schmale Maske wie im Hochformat-Screenshot (fuellt fast die ganze Seite)
const tallMask: MaskPolygon = {
    points: [
        { x: 18, y: 12 }, { x: 50, y: 10 }, { x: 55, y: 35 }, { x: 88, y: 38 },
        { x: 85, y: 72 }, { x: 55, y: 70 }, { x: 50, y: 88 }, { x: 18, y: 88 },
    ],
};

describe('offsetContour', () => {
    it('Rechteck-Maske: Linie hat ueberall Abstand d (Ecken rund)', () => {
        const W = LONG, H = SHORT, d = 40;
        const md = makeMaskDistance([toPx(rectMask, W, H)]);
        const F = (x: number, y: number) => Math.max(md(x, y) - d, rectSignedDistance(x, y, 1, 1, W - 1, H - 1));
        const loops = extractOuterLoops(F, W, H, 6);
        expect(loops).toHaveLength(1);
        for (const p of loops[0]) expect(Math.abs(md(p.x, p.y) - d)).toBeLessThan(2);
    });

    it('Innenhof (Loch) wird verworfen, nur der Aussenrand bleibt', () => {
        const W = 800, H = 600;
        // Ring aus zwei Masken um einen freien Hof: Aussenrand + Hof-Rand
        const outer = [{ x: 200, y: 150 }, { x: 600, y: 150 }, { x: 600, y: 450 }, { x: 200, y: 450 }];
        const md0 = makeMaskDistance([outer]);
        const hole = (x: number, y: number) => x > 300 && x < 500 && y > 250 && y < 350;
        const F = (x: number, y: number) => Math.max(
            (hole(x, y) ? 50 : md0(x, y)) - 10,
            rectSignedDistance(x, y, 1, 1, W - 1, H - 1),
        );
        const loops = extractOuterLoops(F, W, H, 5);
        expect(loops).toHaveLength(1);
        const xs = loops[0].map(p => p.x);
        expect(Math.min(...xs)).toBeLessThan(200);
    });
});

describe('computePolygonPerimeterSlots (Offset-Ring)', () => {
    it('leer / Groesse 0 -> leeres Ergebnis', () => {
        expect(computePolygonPerimeterSlots({ markers: [], containerWidth: LONG, containerHeight: SHORT, masks: [rectMask] })).toEqual({});
        expect(computePolygonPerimeterSlots({ markers: [{ id: 'a', x: 1, y: 1 }], containerWidth: 0, containerHeight: SHORT, masks: [rectMask] })).toEqual({});
    });

    it('Querformat, Rechteck, 10 Stationen: alle in Reihe 1 auf dem Ring (Abstand 0.55 r)', () => {
        const W = LONG, H = SHORT;
        const markers = markersInside(rectMask, W, H, 10);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [rectMask], bubbleRadius: R });
        const { pts, dist, crossings } = expectCleanLayout(res, markers, [rectMask], W, H, R);
        expect(crossings).toBe(0);
        // alle in Reihe 1 -> Mittelpunkt ~ 0.55 r von der Maske (Rasterfehler < r/8)
        for (const p of pts) expect(Math.abs(dist(p.x, p.y) - 0.55 * R)).toBeLessThan(R / 8);
    });

    it('Hochformat, Rechteck, 12 Stationen: ebenso sauber', () => {
        const W = SHORT, H = LONG;
        const markers = markersInside(rectMask, W, H, 12);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [rectMask], bubbleRadius: R });
        const { crossings } = expectCleanLayout(res, markers, [rectMask], W, H, R);
        expect(crossings).toBe(0);
    });

    it('Hochformat, grosse konkave Maske, 21 Stationen (Screenshot-Fall): keine Ueberlappung', () => {
        const W = SHORT, H = LONG;
        const markers = markersInside(tallMask, W, H, 21);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [tallMask], bubbleRadius: R });
        const { crossings } = expectCleanLayout(res, markers, [tallMask], W, H, R);
        expect(crossings).toBeLessThanOrEqual(2);
    });

    it('konkave U-Maske: Blasen nie in der Maske, ueberlappungsfrei', () => {
        const W = LONG, H = SHORT;
        const markers = markersInside(uMask, W, H, 14);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [uMask], bubbleRadius: R });
        expectCleanLayout(res, markers, [uMask], W, H, R);
    });

    it('mehrere Masken werden gemeinsam umrundet', () => {
        const W = LONG, H = SHORT;
        const a: MaskPolygon = { points: [{ x: 20, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 70 }, { x: 20, y: 70 }] };
        const b: MaskPolygon = { points: [{ x: 60, y: 30 }, { x: 80, y: 30 }, { x: 80, y: 70 }, { x: 60, y: 70 }] };
        const markers = [...markersInside(a, W, H, 5), ...markersInside(b, W, H, 5).map(m => ({ ...m, id: `b${m.id}` }))];
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [a, b], bubbleRadius: R });
        expectCleanLayout(res, markers, [a, b], W, H, R);
    });

    it('Sperrzone (Titel) bleibt frei', () => {
        const W = LONG, H = SHORT;
        const zone: BlockedZone = { x: 30, y: 1, width: 28, height: 5 };
        const markers = markersInside(rectMask, W, H, 12);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [rectMask], blockedZones: [zone], bubbleRadius: R });
        expectCleanLayout(res, markers, [rectMask], W, H, R);
        const zx0 = 0.30 * W - R, zx1 = 0.58 * W + R, zy0 = 0.01 * H - R, zy1 = 0.01 * H + 0.05 * W + R;
        for (const p of Object.values(res)) {
            const inside = p.x > zx0 && p.x < zx1 && p.y > zy0 && p.y < zy1;
            expect(inside).toBe(false);
        }
    });

    it('bgZoom verschiebt die Maske korrekt (Blasen ausserhalb der gezoomten Maske)', () => {
        const W = LONG, H = SHORT, zoom = 1.2;
        const zoomed: MaskPolygon = { points: rectMask.points.map(p => ({ x: 50 + (p.x - 50) * zoom, y: 50 + (p.y - 50) * zoom })) };
        const markers = markersInside(zoomed, W, H, 10);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [rectMask], bgZoom: zoom, bubbleRadius: R });
        expectCleanLayout(res, markers, [zoomed], W, H, R);
    });

    it('Maske mit Zungen bis an den Seitenrand (OG/EG/UG-Beschriftung): kein Kreis naeher als r + offset', () => {
        // Maskenform eines echten Plans: links drei schmale Zungen bis zum Seitenrand
        const tabs: MaskPolygon = { points: [{ x: -2.36, y: 14.18 }, { x: 16.83, y: 15.17 }, { x: 24.22, y: 7.26 }, { x: 44.40, y: 12.91 }, { x: 44.20, y: 38.34 }, { x: 62.99, y: 45.69 }, { x: 77.98, y: 33.96 }, { x: 100.56, y: 43.29 }, { x: 100.16, y: 55.02 }, { x: 81.17, y: 75.36 }, { x: 68.18, y: 77.34 }, { x: 46.60, y: 70.14 }, { x: 32.42, y: 92.60 }, { x: 11.23, y: 86.10 }, { x: 12.63, y: 76.92 }, { x: 0.84, y: 77.06 }, { x: 0.64, y: 71.12 }, { x: 12.63, y: 71.27 }, { x: 12.63, y: 59.96 }, { x: 12.43, y: 49.22 }, { x: -0.36, y: 49.37 }, { x: 0.44, y: 43.15 }, { x: 12.23, y: 43.43 }, { x: 11.63, y: 25.35 }, { x: 14.03, y: 20.97 }, { x: -0.76, y: 20.97 }, { x: -0.96, y: 15.17 }] };
        const W = SHORT, H = LONG;
        const markers = markersInside(tabs, W, H, 21);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [tabs], bubbleRadius: R });
        const { pts, dist } = expectCleanLayout(res, markers, [tabs], W, H, R);
        const cell = Math.max(3, R / 8);
        for (const p of pts) expect(dist(p.x, p.y)).toBeGreaterThanOrEqual(0.55 * R - cell / 2 - 1e-6);
    });

    it('deterministisch', () => {
        const W = SHORT, H = LONG;
        const markers = markersInside(tallMask, W, H, 15);
        const input = { markers, containerWidth: W, containerHeight: H, masks: [tallMask], bubbleRadius: R };
        expect(computePolygonPerimeterSlots(input)).toEqual(computePolygonPerimeterSlots(input));
    });

    it('zu viele Stationen -> Rueckfall liefert trotzdem fuer jede Station einen Platz', () => {
        const W = LONG, H = SHORT;
        const big: MaskPolygon = { points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }] };
        const markers = markersInside(big, W, H, 60);
        const res = computePolygonPerimeterSlots({ markers, containerWidth: W, containerHeight: H, masks: [big], bubbleRadius: R });
        expect(Object.keys(res)).toHaveLength(60);
        for (const p of Object.values(res)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    });

    it('ohne Masken -> Fallback computeBubbleSlots', () => {
        const markers: Marker[] = [{ id: 'a', x: 300, y: 300 }, { id: 'b', x: 700, y: 400 }];
        const res = computePolygonPerimeterSlots({ markers, containerWidth: LONG, containerHeight: SHORT, bubbleRadius: R });
        expect(Object.keys(res).sort()).toEqual(['a', 'b']);
    });
});
