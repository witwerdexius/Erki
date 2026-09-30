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
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX <= minX || maxY <= minY) return gridInRect(20, 80, 20, 80, count);

    // Shrink polygon toward its centroid by 4% so grid cells land well inside.
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const shrunk = poly.map(p => ({
        x: p.x + 0.04 * (cx - p.x),
        y: p.y + 0.04 * (cy - p.y),
    }));

    const bw = maxX - minX, bh = maxY - minY;
    for (let n = Math.ceil(Math.sqrt(count * 2)); n <= 30; n++) {
        const cols = n;
        const rows = Math.max(1, Math.round(n * bh / Math.max(bw, 0.001)));
        const pts: { x: number; y: number }[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = cols > 1 ? minX + (c + 0.5) * bw / cols : (minX + maxX) / 2;
                const y = rows > 1 ? minY + (r + 0.5) * bh / rows : (minY + maxY) / 2;
                if (pointInPolygon(x, y, shrunk)) pts.push({ x, y });
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
 * Rechnet eine sichtbare Position (in % des Containers) in das ungezoomte
 * Koordinatensystem des Hintergrunds zurueck. Hintergrund und Masken werden
 * per CSS `scale(bgZoom)` um die Mitte skaliert; gespeichert werden Masken
 * aber ungezoomt: sichtbar = 50 + (gespeichert - 50) * bgZoom.
 */
export function visualToStoredPercent(
    pos: { x: number; y: number },
    bgZoom: number,
): { x: number; y: number } {
    const z = bgZoom > 0 ? bgZoom : 1;
    return {
        x: 50 + (pos.x - 50) / z,
        y: 50 + (pos.y - 50) / z,
    };
}

/**
 * Verteilt die 4 Stationsfarben GLEICHMAESSIG und so, dass Nachbarn
 * moeglichst verschiedene Farben haben.
 *
 * Nachbarn: Marker naeher als `threshold` % ODER Blasen naeher als
 * `bubbleThreshold` % (nebeneinanderliegende Kreise sollen sich abheben).
 *
 * Vorgehen (deterministisch):
 *  1. DSatur-Faerbung: zuerst die Station mit den meisten verschieden
 *     gefaerbten Nachbarn; gewaehlt wird unter den konfliktfreien Farben die
 *     bisher SELTENSTE (statt immer der niedrigsten -> frueher viel Tuerkis).
 *  2. Ausgleich: solange eine Farbe mehr als 1 Station haeufiger ist als eine
 *     andere, werden Stationen konfliktfrei umgefaerbt.
 *  3. Feinschliff: Paare tauschen ihre Farben (Anzahlen bleiben), wenn das die
 *     nach Naehe gewichteten Konflikte senkt. Bei sehr dicht liegenden Markern
 *     sind 4 Farben nicht immer konfliktfrei moeglich; dann bleiben die
 *     Konflikte bei moeglichst weit entfernten Paaren.
 * Das Eingabe-Array wird nicht mutiert.
 */
export function distributeColors(
    stations: Station[],
    threshold = 20,
    bubbleThreshold = 22,
    closeThreshold = 8,
): Station[] {
    const out = stations.map(s => ({ ...s }));
    const n = out.length;
    const K = 4;
    if (n === 0) return out;

    const adj: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dm = Math.hypot(out[i].targetX - out[j].targetX, out[i].targetY - out[j].targetY);
            const db = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y);
            if (dm < threshold || db < bubbleThreshold) {
                adj[i].push(j);
                adj[j].push(i);
            }
        }
    }

    const color: number[] = new Array(n).fill(-1);
    const counts: number[] = new Array(K).fill(0);
    const conflicts = (i: number, c: number) => adj[i].filter(j => color[j] === c).length;

    // 1. DSatur mit "seltenste freie Farbe"
    for (let step = 0; step < n; step++) {
        let pick = -1, bestSat = -1, bestDeg = -1;
        for (let i = 0; i < n; i++) {
            if (color[i] !== -1) continue;
            const sat = new Set(adj[i].map(j => color[j]).filter(c => c !== -1)).size;
            if (sat > bestSat || (sat === bestSat && adj[i].length > bestDeg)) {
                pick = i; bestSat = sat; bestDeg = adj[i].length;
            }
        }
        let best = 0, bestKey: [number, number, number] = [Infinity, Infinity, Infinity];
        for (let c = 0; c < K; c++) {
            const key: [number, number, number] = [conflicts(pick, c), counts[c], c];
            if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
                best = c; bestKey = key;
            }
        }
        color[pick] = best;
        counts[best]++;
    }

    // 2. Ausgleich ohne neue Konflikte
    for (let guard = 0; guard < n * K; guard++) {
        const maxC = counts.indexOf(Math.max(...counts));
        const minC = counts.indexOf(Math.min(...counts));
        if (counts[maxC] - counts[minC] <= 1) break;
        let moved = false;
        // bevorzugt direkt von der haeufigsten in die seltenste Farbe
        for (let i = 0; i < n && !moved; i++) {
            if (color[i] !== maxC) continue;
            if (conflicts(i, minC) <= conflicts(i, maxC)) {
                color[i] = minC; counts[maxC]--; counts[minC]++; moved = true;
            }
        }
        // sonst ueber eine Zwischenfarbe (haeufigste -> irgendeine seltenere)
        for (let i = 0; i < n && !moved; i++) {
            if (color[i] !== maxC) continue;
            for (let c = 0; c < K; c++) {
                if (c === maxC || counts[c] >= counts[maxC] - 1) continue;
                if (conflicts(i, c) <= conflicts(i, maxC)) {
                    color[i] = c; counts[maxC]--; counts[c]++; moved = true; break;
                }
            }
        }
        if (!moved) break;
    }

    // 3. Feinschliff: paarweise Farben tauschen (Anzahlen bleiben gleich), wenn
    //    das die gewichteten Konflikte senkt. Naehere Nachbarn wiegen schwerer.
    //    Stufe 1 (stark): Marker < closeThreshold (wie beim Ziehen) oder Blasen
    //    beruehren sich (< bubbleThreshold). Stufe 2 (schwach): Marker < threshold.
    const weight = (i: number, j: number) => {
        const dm = Math.hypot(out[i].targetX - out[j].targetX, out[i].targetY - out[j].targetY);
        const db = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y);
        const close = dm < closeThreshold || db < bubbleThreshold ? 100 : 0;
        return close + Math.max(0, 1 - dm / threshold);
    };
    const w: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : weight(i, j))));
    const costOf = (i: number, c: number, skip: number) => {
        let sum = 0;
        for (let j = 0; j < n; j++) if (j !== i && j !== skip && color[j] === c) sum += w[i][j];
        return sum;
    };
    for (let pass = 0; pass < 50; pass++) {
        let improved = false;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const ci = color[i], cj = color[j];
                if (ci === cj) continue;
                const before = costOf(i, ci, j) + costOf(j, cj, i);
                const after = costOf(i, cj, j) + costOf(j, ci, i);
                if (after < before - 1e-9) {
                    color[i] = cj; color[j] = ci; improved = true;
                }
            }
        }
        if (!improved) break;
    }

    for (let i = 0; i < n; i++) out[i].colorVariant = color[i];
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

/**
 * Skalierungsfaktor fuer Blasen, Marker, Linien und Titel.
 * Bezugsgroesse ist die LANGE Seite des Plans (Referenz: 800 px), damit alle
 * Elemente im Hoch- und Querformat physisch gleich gross sind
 * (vorher: Breite -> im Hochformat ~1,41x kleiner).
 */
export function computeMapScale(containerWidth: number, containerHeight: number): number {
    const longSide = Math.max(containerWidth, containerHeight);
    return longSide > 0 ? longSide / 800 : 1;
}

/** Stationsfarben (Tuerkis, Lila, Mint, Pink) — wie Blasen und Marker. */
export const STATION_COLOR_HEX = ['#6bbfd4', '#9b8ec4', '#7bc9a0', '#e07aaa'] as const;

/** Farbe einer Station: explizite colorVariant, sonst Index-basiert (wie Blasen/Marker). */
export function stationColorHex(colorVariant: number | null | undefined, index: number): string {
    const i = colorVariant ?? index;
    const n = STATION_COLOR_HEX.length;
    return STATION_COLOR_HEX[((i % n) + n) % n];
}

/**
 * Blattgroesse (A4) in px, eingepasst in den verfuegbaren Bereich.
 * Ersetzt die reine CSS-Loesung (aspect-ratio + h-full), die iOS-Safari
 * nicht zuverlaessig umsetzt (Blatt wurde dort zu hoch -> Maske, Bild und
 * Kreise verschoben).
 *  - Querformat: volle Breite (max. maxLandscapeWidth), Hoehe folgt.
 *  - Hochformat: volle Hoehe (max. maxPortraitHeight), bei zu wenig Breite
 *    wird ueber die Breite begrenzt.
 */
export function fitPageSize(
    availW: number,
    availH: number,
    aspectRatio: 'portrait' | 'landscape',
    maxLandscapeWidth: number,
    maxPortraitHeight: number,
): { width: number; height: number } {
    if (availW <= 0) return { width: 0, height: 0 };
    if (aspectRatio === 'landscape') {
        const width = Math.min(availW, maxLandscapeWidth);
        return { width, height: width * (210 / 297) };
    }
    let height = Math.min(availH > 0 ? availH : Infinity, maxPortraitHeight);
    let width = height * (210 / 297);
    if (!Number.isFinite(width) || width > availW) {
        width = availW;
        height = width * (297 / 210);
    }
    return { width, height };
}
