// ── Bereiche im Lageplan ─────────────────────────────────────────────────────
// Reine Hilfsfunktionen (ohne React/DOM) fuer benannte Bereiche (PlanArea).
//
// Koordinaten: Bereiche werden wie Masken UNGEZOOMT gespeichert und im Editor
// zusammen mit dem Hintergrund per scale(bgZoom) um die Mitte skaliert.
// Marker (targetX/targetY) liegen dagegen in sichtbaren % des Blatts.
// Fuer "liegt der Marker im Bereich?" wird der Bereich daher in sichtbare %
// umgerechnet: sichtbar = 50 + (gespeichert - 50) * bgZoom.

import type { PlanArea, Station } from './types';

/** Wert von Station.areaId fuer "ausdruecklich kein Bereich". */
export const AREA_NONE = '__none__';

type Pt = { x: number; y: number };

function pointInPolygon(px: number, py: number, poly: Pt[]): boolean {
    const n = poly.length;
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/** Bereichspunkte in sichtbare % (mit Zoom). */
export function areaToVisual(area: PlanArea, bgZoom = 1): Pt[] {
    const z = bgZoom > 0 ? bgZoom : 1;
    return area.points.map(p => ({ x: 50 + (p.x - 50) * z, y: 50 + (p.y - 50) * z }));
}

/** Flaechenschwerpunkt eines Polygons (fuer die Beschriftung); Fallback Mittelwert. */
export function polygonCentroid(points: Pt[]): Pt {
    const n = points.length;
    if (n === 0) return { x: 50, y: 50 };
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const f = points[j].x * points[i].y - points[i].x * points[j].y;
        a += f;
        cx += (points[j].x + points[i].x) * f;
        cy += (points[j].y + points[i].y) * f;
    }
    if (Math.abs(a) < 1e-9) {
        return {
            x: points.reduce((s, p) => s + p.x, 0) / n,
            y: points.reduce((s, p) => s + p.y, 0) / n,
        };
    }
    return { x: cx / (3 * a), y: cy / (3 * a) };
}

function polygonArea(points: Pt[]): number {
    let a = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        a += points[j].x * points[i].y - points[i].x * points[j].y;
    }
    return Math.abs(a) / 2;
}

/**
 * Bereich, in dem ein Punkt (sichtbare %) liegt. Bei ueberlappenden Bereichen
 * gewinnt der kleinste (der "genauere").
 */
export function areaAtPoint(areas: PlanArea[] | undefined, x: number, y: number, bgZoom = 1): PlanArea | undefined {
    let best: PlanArea | undefined;
    let bestSize = Infinity;
    for (const area of areas ?? []) {
        const poly = areaToVisual(area, bgZoom);
        if (!pointInPolygon(x, y, poly)) continue;
        const size = polygonArea(poly);
        if (size < bestSize) { best = area; bestSize = size; }
    }
    return best;
}

/** Bereich, in dem der Marker der Station liegt (automatische Zuordnung). */
export function autoAreaForStation(station: Pick<Station, 'targetX' | 'targetY'>, areas: PlanArea[] | undefined, bgZoom = 1): PlanArea | undefined {
    return areaAtPoint(areas, station.targetX, station.targetY, bgZoom);
}

/**
 * Wirksamer Bereich einer Station: manuelle Wahl (falls der Bereich noch
 * existiert), AREA_NONE = keiner, sonst automatisch nach Marker-Position.
 */
export function effectiveArea(
    station: Pick<Station, 'targetX' | 'targetY' | 'areaId'>,
    areas: PlanArea[] | undefined,
    bgZoom = 1,
): PlanArea | undefined {
    if (station.areaId === AREA_NONE) return undefined;
    if (station.areaId) {
        const manual = (areas ?? []).find(a => a.id === station.areaId);
        if (manual) return manual;
    }
    return autoAreaForStation(station, areas, bgZoom);
}

/** Name des wirksamen Bereichs oder ''. */
export function effectiveAreaName(
    station: Pick<Station, 'targetX' | 'targetY' | 'areaId'>,
    areas: PlanArea[] | undefined,
    bgZoom = 1,
): string {
    return effectiveArea(station, areas, bgZoom)?.name ?? '';
}

/** Entfernt einen Bereich und loest manuelle Zuordnungen darauf auf (-> automatisch). */
export function removeArea<S extends Pick<Station, 'areaId'>>(
    areas: PlanArea[],
    stations: S[],
    areaId: string,
): { areas: PlanArea[]; stations: S[] } {
    return {
        areas: areas.filter(a => a.id !== areaId),
        stations: stations.map(s => (s.areaId === areaId ? { ...s, areaId: null } : s)),
    };
}
