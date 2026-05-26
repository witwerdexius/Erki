// Reine Map-Hilfsfunktionen, herausgelöst aus ErkiApp / MapView (Welle 4 — 3/4).
// Keine React- oder DOM-Abhängigkeiten — getestet in lib/mapInteractions.test.ts.

import type { Station, MaskPolygon } from '@/lib/types';

function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function gridInRect(minX: number, maxX: number, minY: number, maxY: number, count: number): { x: number; y: number }[] {
    const aspect = (maxX - minX) / Math.max(maxY - minY, 0.001);
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const pts: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols && pts.length < count + 10; c++) {
            pts.push({
                x: cols > 1 ? minX + c * (maxX - minX) / (cols - 1) : (minX + maxX) / 2,
                y: rows > 1 ? minY + r * (maxY - minY) / (rows - 1) : (minY + maxY) / 2,
            });
        }
    }
    return pts;
}

function gridInsidePolygon(poly: { x: number; y: number }[], count: number): { x: number; y: number }[] {
    const xs = poly.map(p => p.x);
    const ys = poly.map(p => p.y);
    const minX = Math.min(...xs) + 3, maxX = Math.max(...xs) - 3;
    const minY = Math.min(...ys) + 3, maxY = Math.max(...ys) - 3;
    if (maxX <= minX || maxY <= minY) return gridInRect(20, 80, 20, 80, count);
    const bw = maxX - minX, bh = maxY - minY;
    for (let n = Math.ceil(Math.sqrt(count * 2)); n <= 30; n++) {
        const cols = n;
        const rows = Math.max(1, Math.round(n * bh / Math.max(bw, 0.001)));
        const pts: { x: number; y: number }[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = cols > 1 ? minX + (c + 0.5) * bw / cols : (minX + maxX) / 2;
                const y = rows > 1 ? minY + (r + 0.5) * bh / rows : (minY + maxY) / 2;
                if (pointInPolygon(x, y, poly)) pts.push({ x, y });
            }
        }
        if (pts.length >= count) return pts;
    }
    return gridInRect(20, 80, 20, 80, count);
}

/**
 * Verteilt Stationen, die sich am selben (targetX, targetY) stapeln, auf ein
 * gleichmäßiges Grid. Stations mit eindeutiger Position werden nicht verändert.
 * Gibt dasselbe Array-Objekt zurück, wenn keine Stapel gefunden wurden.
 */
export function spreadPiledStations(stations: Station[], masks?: MaskPolygon[]): Station[] {
    if (stations.length === 0) return stations;

    const posCount = new Map<string, number>();
    for (const s of stations) {
        const key = `${s.targetX},${s.targetY}`;
        posCount.set(key, (posCount.get(key) ?? 0) + 1);
    }
    const piledKeys = new Set(
        [...posCount.entries()].filter(([, c]) => c >= 2).map(([k]) => k),
    );
    if (piledKeys.size === 0) return stations;

    const piledIndices = stations
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => piledKeys.has(`${s.targetX},${s.targetY}`))
        .sort((a, b) => (parseInt(a.s.number) || 0) - (parseInt(b.s.number) || 0))
        .map(({ i }) => i);

    const poly = masks?.[0]?.points;
    const gridPts = poly && poly.length >= 3
        ? gridInsidePolygon(poly, piledIndices.length)
        : gridInRect(20, 80, 20, 80, piledIndices.length);

    const out = stations.map(s => ({ ...s }));
    for (let n = 0; n < piledIndices.length; n++) {
        const pt = gridPts[n % gridPts.length];
        out[piledIndices[n]].targetX = Math.round(pt.x * 10) / 10;
        out[piledIndices[n]].targetY = Math.round(pt.y * 10) / 10;
    }
    return out;
}

/**
 * Konvertiert Mauskoordinaten (clientX, clientY) in Prozent-Koordinaten relativ
 * zu einem Container-Rechteck. Ergebnis liegt nicht zwingend in [0,100] —
 * Caller entscheiden selbst, ob sie clampen wollen (alte Inline-Implementierung
 * in ErkiApp clampte ebenfalls nicht, das Verhalten bleibt identisch).
 */
export function clientToPercent(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
    return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
    };
}

/**
 * Greedy-Graph-Coloring: jeder Station wird die niedrigste Farbe (0..3) zugewiesen,
 * die kein "Nachbar" (innerhalb threshold % Distanz) bereits benutzt.
 *
 * Wichtige Eigenschaft: deterministisch und reihenfolgebasiert — Station[i] sieht
 * nur Stationen 0..i-1 als Nachbarn, identisch zur Originalimplementierung in
 * ErkiApp.handleDistributeColors. Ergebnis ist eine neue Station[] mit eventuell
 * geänderten colorVariant-Werten; Original-Array wird nicht mutiert.
 */
export function distributeColors(stations: Station[], threshold = 20): Station[] {
    const out = stations.map(s => ({ ...s }));
    for (let i = 0; i < out.length; i++) {
        const usedByNeighbors = new Set<number>();
        for (let j = 0; j < i; j++) {
            const dx = out[i].targetX - out[j].targetX;
            const dy = out[i].targetY - out[j].targetY;
            if (Math.sqrt(dx * dx + dy * dy) < threshold) {
                usedByNeighbors.add(out[j].colorVariant ?? (j % 4));
            }
        }
        let color = 0;
        let attempts = 0;
        while (usedByNeighbors.has(color) && attempts < 8) {
            color = (color + 1) % 4;
            attempts++;
        }
        out[i].colorVariant = color;
    }
    return out;
}

/**
 * Beim Drag eines Target-Punktes: prüfe, ob die Station nun zu nah an einer
 * Nachbarstation liegt (Distanz < threshold %) und dieselbe Farbe trägt.
 * Falls ja: rotiere die colorVariant der gedraggten Station, bis kein Konflikt
 * mehr besteht (max. 4 Versuche). Liefert eine NEUE Station-Liste zurück oder
 * die Original-Liste, wenn keine Änderung nötig war.
 *
 * Verhalten 1:1 wie ErkiApp.resolveColorConflicts — Fallback-Default ist
 * `index % 4`, identisch zur Render-Logik (Bubble-Color-Fallback).
 */
export function resolveColorConflicts(
    stationId: string,
    currentStations: Station[],
    threshold = 8,
): Station[] {
    const station = currentStations.find(s => s.id === stationId);
    if (!station) return currentStations;

    const otherStations = currentStations.filter(s => s.id !== stationId);
    const stationIndex = currentStations.findIndex(s => s.id === stationId);

    let newColorVariant = station.colorVariant ?? (stationIndex % 4);
    let conflictFound = true;
    let attempts = 0;

    while (conflictFound && attempts < 4) {
        conflictFound = false;
        for (const other of otherStations) {
            const dx = station.targetX - other.targetX;
            const dy = station.targetY - other.targetY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const otherIndex = currentStations.findIndex(s => s.id === other.id);
            const otherColor = other.colorVariant ?? (otherIndex % 4);

            if (distance < threshold && otherColor === newColorVariant) {
                conflictFound = true;
                newColorVariant = (newColorVariant + 1) % 4;
                break;
            }
        }
        attempts++;
    }

    if (station.colorVariant !== newColorVariant) {
        return currentStations.map(s =>
            s.id === stationId ? { ...s, colorVariant: newColorVariant } : s,
        );
    }
    return currentStations;
}

/**
 * Berechnet das aspect-ratio-abhängige containerHeight aus containerWidth.
 * Landscape = 297:210 (DIN A4 quer), Portrait = 210:297 (A4 hoch). Wird sowohl
 * für computeAutoLayout als auch für andere Map-Rechnungen gebraucht.
 */
export function deriveContainerHeight(
    containerWidth: number,
    aspectRatio: 'portrait' | 'landscape',
): number {
    return aspectRatio === 'landscape'
        ? containerWidth * (210 / 297)
        : containerWidth * (297 / 210);
}
