// ── BubbleLayoutMath ────────────────────────────────────────────────────────
// Reine, React-/DOM-freie Mathematik fuer das Auto-Layout der Stations-Blasen
// auf dem Lageplan. Verteilt Beschriftungs-Blasen kreuzungsfrei auf dem
// Perimeter des Canvas, basierend auf den Marker-Positionen.
//
// Algorithmus (siehe computeBubbleSlots):
//   1. Centroid der Marker berechnen
//   2. Jeden Marker per Strahl (Centroid -> Marker) auf den Perimeter
//      projizieren -> initiale Slot-Positionen (zyklische Reihenfolge)
//   3. Sortieren nach Perimeter-Parameter s
//   4. Zirkulaere Overlap-Resolution: groesste Luecke finden, von dort ein
//      einziger Forward-Sweep (Perimeter = Ring, kein Aufstauen an Grenzen)
//   5. Sperrzonen (Logo + Titel) -> Slot entlang Perimeter verschieben
//   6. 2D-Overlap-Pruefschleife (benachbarte Kanten nahe einer Ecke)
//   7. Linienpaare (marker -> slot) -> Kreuzungen erkennen, Slots tauschen
//   8. Hard-Clamp auf [bubbleRadius, W-bubbleRadius] x [bubbleRadius, H-bubbleRadius]
//
// Extrahiert aus components/ErkiApp.tsx (Welle 4 - 1/4).

import {
    extractOuterLoops,
    makeArcLoop,
    makeMaskDistance,
    pointAtArc,
    rectSignedDistance,
    type ArcLoop,
} from './offsetContour';

/** Marker-Position im Pixelraum mit eindeutiger Stations-ID. */
export interface Marker {
    id: string;
    /** Marker-X in Pixeln (Bild-Koordinaten). */
    x: number;
    /** Marker-Y in Pixeln (Bild-Koordinaten). */
    y: number;
}

/** Slot-Position im Pixelraum. */
export interface Slot {
    x: number;
    y: number;
}

/**
 * Rechteckige Sperrzone in Prozent (0..100) der Container-Breite/Hoehe.
 * width/height in Prozent der Container-Breite (proportional zur Breite,
 * wie die Quell-Logik im UI).
 */
export interface BlockedZone {
    /** linke obere Ecke X in % */
    x: number;
    /** linke obere Ecke Y in % */
    y: number;
    /** Breite in % der Container-Breite */
    width: number;
    /** Hoehe in % der Container-Breite (wie im UI fuer Logo/Label berechnet) */
    height: number;
    /** Clearance in px added on each side (default: bubbleRadius). Use smaller value for text labels. */
    padding?: number;
}

export interface ComputeBubbleSlotsInput {
    markers: Marker[];
    containerWidth: number;
    containerHeight: number;
    /** Optional: rechteckige Sperrzonen (z.B. Logo, Titel). */
    blockedZones?: BlockedZone[];
    /**
     * Optional: expliziter Bubble-Radius in Pixeln. Wenn undefined,
     * wird er aus der langen Seite abgeleitet (48 * max(W, H) / 800),
     * was dem ErkiApp-Default entspricht.
     */
    bubbleRadius?: number;
}

/** Ergebnis: stationId -> Slot-Position in Pixeln. */
export type LayoutResult = Record<string, Slot>;

/**
 * Wickelt einen Perimeter-Parameter s in [0, perimLen) ein.
 * Exportiert fuer Tests/Hilfe.
 */
export function wrap(s: number, perimLen: number): number {
    if (perimLen <= 0) return 0;
    return ((s % perimLen) + perimLen) % perimLen;
}

interface PerimeterRect {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    Wr: number;
    Hr: number;
    perimLen: number;
}

/**
 * Wandelt einen Perimeter-Parameter s in einen Punkt auf dem Rechteck.
 */
export function sToPoint(s: number, rect: PerimeterRect): Slot {
    const { minX, maxX, minY, maxY, Wr, Hr, perimLen } = rect;
    let t = wrap(s, perimLen);
    if (t < Wr)            return { x: minX + t,    y: minY };
    t -= Wr;
    if (t < Hr)            return { x: maxX,         y: minY + t };
    t -= Hr;
    if (t < Wr)            return { x: maxX - t,     y: maxY };
    t -= Wr;
    return                  { x: minX,               y: maxY - t };
}

/**
 * Strahl von origin in Richtung angle -> Schnittpunkt mit Perimeter-Rechteck,
 * zurueckgegeben als s-Parameter auf dem Perimeter.
 */
export function projectMarkerToPerimeter(
    origin: { x: number; y: number },
    angle: number,
    rect: PerimeterRect,
): number {
    const { minX, maxX, minY, maxY, Wr, Hr } = rect;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let bestT = Infinity;
    let bestPx = origin.x, bestPy = origin.y;
    const tryEdge = (t: number, ex: number, ey: number) => {
        if (t > 1e-9 && t < bestT &&
            ex >= minX - 0.5 && ex <= maxX + 0.5 &&
            ey >= minY - 0.5 && ey <= maxY + 0.5) {
            bestT = t; bestPx = ex; bestPy = ey;
        }
    };
    if (Math.abs(cos) > 1e-9) {
        const tR = (maxX - origin.x) / cos;
        tryEdge(tR, maxX, origin.y + sin * tR);
        const tL = (minX - origin.x) / cos;
        tryEdge(tL, minX, origin.y + sin * tL);
    }
    if (Math.abs(sin) > 1e-9) {
        const tB = (maxY - origin.y) / sin;
        tryEdge(tB, origin.x + cos * tB, maxY);
        const tT = (minY - origin.y) / sin;
        tryEdge(tT, origin.x + cos * tT, minY);
    }
    const px = Math.max(minX, Math.min(maxX, bestPx));
    const py = Math.max(minY, Math.min(maxY, bestPy));
    const dTop = Math.abs(py - minY), dRight = Math.abs(px - maxX);
    const dBot = Math.abs(py - maxY), dLeft  = Math.abs(px - minX);
    const d = Math.min(dTop, dRight, dBot, dLeft);
    if (d === dTop)   return px - minX;
    if (d === dRight) return Wr + (py - minY);
    if (d === dBot)   return Wr + Hr + (maxX - px);
    return                   Wr + Hr + Wr + (maxY - py);
}

/**
 * Pruefe, ob die zwei Linienstuecke ab-bd und cd-bd sich kreuzen.
 * Standard-CCW-Test fuer Segment-Schnitte.
 */
export function segmentsCross(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number,
): boolean {
    const ccw = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
        (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const d1 = ccw(ax, ay, bx, by, cx, cy);
    const d2 = ccw(ax, ay, bx, by, dx, dy);
    const d3 = ccw(cx, cy, dx, dy, ax, ay);
    const d4 = ccw(cx, cy, dx, dy, bx, by);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
}

/**
 * Berechnet kreuzungsfreie Slot-Positionen fuer alle Marker.
 * Reine Funktion: bei identischem Input ist der Output deterministisch.
 *
 * Bei leerem Marker-Array oder Container-Groesse 0 wird ein leeres Ergebnis
 * geliefert (kein Wurf, kein NaN, keine Endlos-Schleife).
 */
export function computeBubbleSlots(input: ComputeBubbleSlotsInput): LayoutResult {
    const { markers, containerWidth, containerHeight, blockedZones } = input;
    const N = markers.length;
    const result: LayoutResult = {};
    if (N === 0 || containerWidth <= 0 || containerHeight <= 0) return result;

    const mapScale = Math.max(containerWidth, containerHeight) / 800;
    const bubbleRadius = input.bubbleRadius ?? 48 * mapScale;
    const R = bubbleRadius + 10;

    const minX = R, maxX = containerWidth - R;
    const minY = R, maxY = containerHeight - R;
    if (maxX <= minX || maxY <= minY) {
        // Canvas zu klein: Fallback - Marker selbst als Slot zurueckgeben (kein NaN).
        for (const m of markers) result[m.id] = { x: m.x, y: m.y };
        return result;
    }
    const Wr = maxX - minX, Hr = maxY - minY;
    const perimLen = 2 * (Wr + Hr);
    const rect: PerimeterRect = { minX, maxX, minY, maxY, Wr, Hr, perimLen };

    // ── Schritt 1: Centroid ─────────────────────────────────────────────────
    const centroid = {
        x: markers.reduce((sum, m) => sum + m.x, 0) / N,
        y: markers.reduce((sum, m) => sum + m.y, 0) / N,
    };

    // ── Schritt 2: Projektion -> initiale Slot-Position pro Marker ─────────
    const items = markers.map(m => {
        const angle = Math.atan2(m.y - centroid.y, m.x - centroid.x);
        const s = projectMarkerToPerimeter(centroid, angle, rect);
        return { id: m.id, s };
    });

    // ── Schritt 3: Sortieren nach s (= zyklische Reihenfolge auf Perimeter) ─
    items.sort((a, b) => a.s - b.s);

    // ── Schritt 4: Zirkulaere Overlap-Resolution ────────────────────────────
    let minDist = 2 * bubbleRadius + 5;
    if (N * minDist > perimLen) minDist = perimLen / N; // Notfall: zusammenstauchen

    // Groesste zirkulaere Luecke finden -> Ketten-Startpunkt
    let biggestGapIdx = 0;
    let biggestGap = -1;
    for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        let gap = items[next].s - items[i].s;
        if (gap <= 0) gap += perimLen;
        if (gap > biggestGap) { biggestGap = gap; biggestGapIdx = (i + 1) % N; }
    }

    // Forward-Sweep ab biggestGapIdx (einmal rum, zirkulaer)
    for (let k = 1; k < N; k++) {
        const cur  = (biggestGapIdx + k) % N;
        const prev = (biggestGapIdx + k - 1) % N;
        let gap = items[cur].s - items[prev].s;
        if (gap < 0) gap += perimLen;
        if (gap < minDist) {
            items[cur].s = wrap(items[prev].s + minDist, perimLen);
        }
    }

    // ── Schritt 5: Sperrzonen ───────────────────────────────────────────────
    const isBlocked = (px: number, py: number): boolean => {
        if (!blockedZones || blockedZones.length === 0) return false;
        for (const zone of blockedZones) {
            const lx = (zone.x / 100) * containerWidth;
            const ly = (zone.y / 100) * containerHeight;
            const lw = (zone.width / 100) * containerWidth;
            const lh = (zone.height / 100) * containerWidth; // bewusst containerWidth (analog UI)
            const pad = zone.padding ?? bubbleRadius;
            if (px >= lx - pad && px <= lx + lw + pad &&
                py >= ly - pad && py <= ly + lh + pad) return true;
        }
        return false;
    };
    // ── Schritte 5–7: Iterative Schleife bis Konvergenz ─────────────────────
    const minDist2D = 2 * bubbleRadius + 5;
    const markerById: Record<string, { x: number; y: number }> = {};
    for (const m of markers) markerById[m.id] = { x: m.x, y: m.y };

    for (let round = 0; round < 15; round++) {
        let anyChange = false;

        // Schritt 5: Sperrzonen — bidirektionale Suche
        for (const item of items) {
            const startPt = sToPoint(item.s, rect);
            if (!isBlocked(startPt.x, startPt.y)) continue;

            let fwdS = item.s;
            let bwdS = item.s;
            let fwdFree = false;
            let bwdFree = false;
            const step = minDist * 0.5;

            for (let attempt = 0; attempt < 120; attempt++) {
                if (!fwdFree) {
                    fwdS = wrap(fwdS + step, perimLen);
                    const pt = sToPoint(fwdS, rect);
                    if (!isBlocked(pt.x, pt.y)) fwdFree = true;
                }
                if (!bwdFree) {
                    bwdS = wrap(bwdS - step, perimLen);
                    const pt = sToPoint(bwdS, rect);
                    if (!isBlocked(pt.x, pt.y)) bwdFree = true;
                }
                if (fwdFree && bwdFree) break;
            }

            if (fwdFree && bwdFree) {
                const fwdDist = wrap(fwdS - item.s, perimLen);
                const bwdDist = wrap(item.s - bwdS, perimLen);
                item.s = fwdDist <= bwdDist ? fwdS : bwdS;
            } else if (fwdFree) {
                item.s = fwdS;
            } else if (bwdFree) {
                item.s = bwdS;
            }
            anyChange = true;
        }

        // Schritt 6: 2D-Overlap
        for (let i = 0; i < N; i++) {
            const ptI = sToPoint(items[i].s, rect);
            for (let j = i + 1; j < N; j++) {
                const ptJ = sToPoint(items[j].s, rect);
                const dx = ptI.x - ptJ.x, dy = ptI.y - ptJ.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist2D) {
                    items[j].s = wrap(items[j].s + (minDist2D - dist), perimLen);
                    anyChange = true;
                }
            }
        }

        // Schritt 7: Kreuzungen
        for (let i = 0; i < N; i++) {
            const mi = markerById[items[i].id];
            const si = sToPoint(items[i].s, rect);
            for (let j = i + 1; j < N; j++) {
                const mj = markerById[items[j].id];
                const sj = sToPoint(items[j].s, rect);
                if (segmentsCross(mi.x, mi.y, si.x, si.y, mj.x, mj.y, sj.x, sj.y)) {
                    const tmp = items[i].s;
                    items[i].s = items[j].s;
                    items[j].s = tmp;
                    anyChange = true;
                }
            }
        }

        if (!anyChange) break;
    }

    // ── Schritt 8: Hard-Clamp + Zuordnung ───────────────────────────────────
    for (const item of items) {
        const pt = sToPoint(item.s, rect);
        result[item.id] = {
            x: Math.max(bubbleRadius, Math.min(containerWidth - bubbleRadius, pt.x)),
            y: Math.max(bubbleRadius, Math.min(containerHeight - bubbleRadius, pt.y)),
        };
    }

    return result;
}

// ── Radial Segment Layout ────────────────────────────────────────────────────
// Neuer Algorithmus: Teilt den Raum in radiale Segmente vom Container-Mittelpunkt.
// Für jedes Segment wird ein Strahl nach außen geschossen bis zum ersten gültigen
// Punkt (außerhalb des Masken-Polygons, außerhalb Logo/Titel, innerhalb Container).
// Blasen werden den Segmenten nach Winkel-Ähnlichkeit zugeordnet (minimiert Kreuzungen).

/** Masken-Polygon — Punkte in % des Containers (0..100), vor Zoom gespeichert. */
export interface MaskPolygon {
    points: { x: number; y: number }[];
}

export interface ComputeRadialSlotsInput {
    markers: Marker[];
    containerWidth: number;
    containerHeight: number;
    /** Masken-Polygone aus activePlan.masks (Punkte in %, vor Zoom). */
    masks?: MaskPolygon[];
    /** CSS-Scale-Faktor des Hintergrundbildes (activePlan.bgZoom, default 1). */
    bgZoom?: number;
    /** Sperrzonen für Logo/Titel in % (wie bei computeBubbleSlots). */
    blockedZones?: BlockedZone[];
    bubbleRadius?: number;
    /** Feineinstellung des Offset-Ring-Layouts (px). Defaults relativ zum Radius. */
    layout?: OffsetRingOptions;
}

/**
 * Parameter des Offset-Ring-Layouts (aus lageplan-algo-test.html uebernommen).
 * Alle Werte in px; Defaults skalieren mit dem Blasen-Radius r
 * (Mockup-Werte bei r = 67: Luecke 5, Offset -30, Hex 1.0, Spreizung 40).
 */
export interface OffsetRingOptions {
    /** Luecke zwischen benachbarten Blasen in Reihe 1. Default 0.075 r. */
    gap?: number;
    /** Abstand Blasen-RAND zur Maske; negativ = Blase ragt in die Maske. Default -0.45 r. */
    offset?: number;
    /** Abstand Reihe 2 zu ihren Reihe-1-Nachbarn als Faktor von (2r + gap). Default 1.0. */
    hexFactor?: number;
    /** Zusaetzliche Spreizung der Reihe-1-Paare mit Reihe-2-Blase dahinter. Default 0.6 r. */
    spread?: number;
}

/**
 * Ray-Casting Point-in-Polygon Test.
 * poly: Array von {x, y} in Pixeln.
 */
export function pointInPolygon(
    px: number, py: number,
    poly: { x: number; y: number }[],
): boolean {
    const n = poly.length;
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if ((yi > py) !== (yj > py) &&
            px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Berechnet Slot-Positionen über radiale Segmente.
 *
 * Funktionsweise:
 *  1. Masken-Polygone werden mit bgZoom auf visuelle % transformiert und in Pixel umgerechnet.
 *  2. Vom Container-Mittelpunkt werden M Strahlen (360°/M Schritt) nach außen abgetastet.
 *  3. Jeder Strahl liefert den ersten Punkt der: außerhalb ALLER Masken-Polygone,
 *     außerhalb aller Sperrzonen und innerhalb des Container-Randes liegt.
 *  4. M wird erhöht bis ≥ N gültige Segmente vorliegen.
 *  5. N gleichmäßig verteilte Segmente werden ausgewählt und nach Winkel sortiert.
 *  6. Marker werden nach Winkel (relativ zum Mittelpunkt) sortiert und 1:1 zugeordnet.
 *  7. Bubble-Überlapp wird durch Verschieben entlang des Strahls aufgelöst.
 *
 * Fallback: Wenn keine Masken vorhanden sind, wird computeBubbleSlots verwendet.
 */
export function computeRadialSlots(input: ComputeRadialSlotsInput): LayoutResult {
    const { markers, containerWidth, containerHeight, blockedZones } = input;
    const N = markers.length;
    const result: LayoutResult = {};
    if (N === 0 || containerWidth <= 0 || containerHeight <= 0) return result;

    // Wenn keine Masken: Fallback auf Perimeter-Algorithmus
    if (!input.masks || input.masks.length === 0) {
        return computeBubbleSlots({ markers, containerWidth, containerHeight, blockedZones });
    }

    const bgZoom = input.bgZoom ?? 1;
    const mapScale = Math.max(containerWidth, containerHeight) / 800;
    const bubbleRadius = input.bubbleRadius ?? 48 * mapScale;

    // Masken-Polygone: stored % -> visual % (mit Zoom) -> Pixel
    // visual_x_pct = 50 + (stored_x - 50) * bgZoom
    const maskPolysPx: { x: number; y: number }[][] = input.masks.map(mask =>
        mask.points.map(p => ({
            x: (50 + (p.x - 50) * bgZoom) / 100 * containerWidth,
            y: (50 + (p.y - 50) * bgZoom) / 100 * containerHeight,
        }))
    );

    const isInMask = (px: number, py: number): boolean =>
        maskPolysPx.some(poly => pointInPolygon(px, py, poly));

    const isInBlockedZone = (px: number, py: number): boolean => {
        if (!blockedZones || blockedZones.length === 0) return false;
        for (const zone of blockedZones) {
            const lx = (zone.x / 100) * containerWidth;
            const ly = (zone.y / 100) * containerHeight;
            const lw = (zone.width / 100) * containerWidth;
            const lh = (zone.height / 100) * containerWidth;
            const pad = zone.padding ?? bubbleRadius;
            if (px >= lx - pad && px <= lx + lw + pad &&
                py >= ly - pad && py <= ly + lh + pad) return true;
        }
        return false;
    };

    const isForbidden = (px: number, py: number): boolean =>
        isInMask(px, py) || isInBlockedZone(px, py);

    const isInBounds = (px: number, py: number): boolean =>
        px >= bubbleRadius && px <= containerWidth - bubbleRadius &&
        py >= bubbleRadius && py <= containerHeight - bubbleRadius;

    // Container-Mittelpunkt
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;

    // Strahl von Mittelpunkt in Richtung angle: ersten gültigen Punkt finden.
    const scanRay = (angle: number): Slot | null => {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const maxDist = Math.sqrt(
            containerWidth * containerWidth + containerHeight * containerHeight
        );
        const stepPx = Math.max(3, bubbleRadius * 0.25);

        for (let dist = 1; dist <= maxDist; dist += stepPx) {
            const px = cx + cosA * dist;
            const py = cy + sinA * dist;
            if (!isInBounds(px, py)) continue;
            if (!isForbidden(px, py)) {
                return { x: px, y: py };
            }
        }
        return null;
    };

    // M erhöhen bis ≥ N gültige Segmente
    let M = N;
    let validSegs: { angle: number; slot: Slot }[] = [];
    while (M <= N * 16) {
        validSegs = [];
        for (let i = 0; i < M; i++) {
            const angle = (2 * Math.PI * i) / M;
            const slot = scanRay(angle);
            if (slot) validSegs.push({ angle, slot });
        }
        if (validSegs.length >= N) break;
        M = Math.ceil(M * 1.3);
    }

    if (validSegs.length === 0) {
        for (const m of markers) result[m.id] = { x: cx, y: cy };
        return result;
    }

    // N gleichmäßig verteilte Segmente aus validSegs wählen
    const chosen: { angle: number; slot: Slot }[] = [];
    const stride = validSegs.length / N;
    for (let i = 0; i < N; i++) {
        chosen.push(validSegs[Math.floor(i * stride)]);
    }
    chosen.sort((a, b) => a.angle - b.angle);

    // Marker nach Winkel (vom Mittelpunkt) sortieren
    const sortedMarkers = markers
        .map(m => ({ ...m, angle: Math.atan2(m.y - cy, m.x - cx) }))
        .sort((a, b) => a.angle - b.angle);

    // 1:1 Zuordnung nach Winkel-Reihenfolge → minimiert Kreuzungen
    const assignments: {
        id: string; slot: Slot; segAngle: number;
    }[] = sortedMarkers.map((m, i) => ({
        id: m.id,
        slot: { ...chosen[i].slot },
        segAngle: chosen[i].angle,
    }));

    // Überlapp-Auflösung: allgemeine 2D-Abstoßung (nicht nur entlang des Strahls)
    const minDist2 = 2 * bubbleRadius + 4;
    for (let round = 0; round < 40; round++) {
        let anyChange = false;
        for (let i = 0; i < assignments.length; i++) {
            for (let j = i + 1; j < assignments.length; j++) {
                const a = assignments[i];
                const b = assignments[j];
                const dx = a.slot.x - b.slot.x;
                const dy = a.slot.y - b.slot.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist >= minDist2 || dist < 0.1) continue;
                const push = (minDist2 - dist) / 2 + 1;
                // Abstoßungsrichtung: von b nach a (und umgekehrt)
                const nx = dx / dist;
                const ny = dy / dist;
                // a nach außen schieben
                const newAx = a.slot.x + nx * push;
                const newAy = a.slot.y + ny * push;
                if (isInBounds(newAx, newAy) && !isForbidden(newAx, newAy)) {
                    assignments[i].slot = { x: newAx, y: newAy };
                    anyChange = true;
                }
                // b in Gegenrichtung schieben
                const newBx = b.slot.x - nx * push;
                const newBy = b.slot.y - ny * push;
                if (isInBounds(newBx, newBy) && !isForbidden(newBx, newBy)) {
                    assignments[j].slot = { x: newBx, y: newBy };
                    anyChange = true;
                }
            }
        }
        if (!anyChange) break;
    }

    for (const a of assignments) {
        result[a.id] = {
            x: Math.max(bubbleRadius, Math.min(containerWidth - bubbleRadius, a.slot.x)),
            y: Math.max(bubbleRadius, Math.min(containerHeight - bubbleRadius, a.slot.y)),
        };
    }
    return result;
}

// ── Polygon-Perimeter Layout ─────────────────────────────────────────────────
// Platziert Blasen entlang des Masken-Polygon-Randes, knapp außerhalb.
// Geht einmal rund herum, platziert Kandidaten im Abstand 2*bubbleRadius+gap.
// Wenn zu wenig Plätze: Abstand reduzieren (Platz-Analyse), dann zweite Runde
// weiter außen. Logo/Titel-Sperrzonen werden ausgespart.

/**
 * ALTER Algorithmus (bis v0.9.x): Slots entlang des Masken-Polygon-Randes,
 * radial vom Schwerpunkt versetzt, Sektor-Auswahl, 2D-Abstossung.
 * Dient nur noch als Rueckfall, wenn der Offset-Ring (computePolygonPerimeterSlots)
 * nicht genug ueberlappungsfreie Plaetze findet.
 */
export function computePolygonPerimeterSlotsLegacy(input: ComputeRadialSlotsInput): LayoutResult {
    const { markers, containerWidth, containerHeight, blockedZones } = input;
    const N = markers.length;
    const result: LayoutResult = {};
    if (N === 0 || containerWidth <= 0 || containerHeight <= 0) return result;

    if (!input.masks || input.masks.length === 0) {
        return computeBubbleSlots({ markers, containerWidth, containerHeight, blockedZones });
    }

    const bgZoom = input.bgZoom ?? 1;
    const mapScale = Math.max(containerWidth, containerHeight) / 800;
    const bubbleRadius = input.bubbleRadius ?? 48 * mapScale;

    // Masken-Polygon -> Pixel (mit Zoom-Transformation)
    const maskPolysPx: { x: number; y: number }[][] = input.masks.map(mask =>
        mask.points.map(p => ({
            x: (50 + (p.x - 50) * bgZoom) / 100 * containerWidth,
            y: (50 + (p.y - 50) * bgZoom) / 100 * containerHeight,
        }))
    );

    const isInMask = (px: number, py: number): boolean =>
        maskPolysPx.some(poly => pointInPolygon(px, py, poly));

    const isInBlockedZone = (px: number, py: number): boolean => {
        if (!blockedZones || blockedZones.length === 0) return false;
        for (const zone of blockedZones) {
            const lx = (zone.x / 100) * containerWidth;
            const ly = (zone.y / 100) * containerHeight;
            const lw = (zone.width / 100) * containerWidth;
            const lh = (zone.height / 100) * containerWidth;
            const pad = zone.padding ?? bubbleRadius;
            if (px >= lx - pad && px <= lx + lw + pad &&
                py >= ly - pad && py <= ly + lh + pad) return true;
        }
        return false;
    };

    const isInBounds = (px: number, py: number): boolean =>
        px >= bubbleRadius && px <= containerWidth - bubbleRadius &&
        py >= bubbleRadius && py <= containerHeight - bubbleRadius;

    // Erstes Polygon als Hauptreferenz
    const poly = maskPolysPx[0];
    const polyN = poly.length;

    // Polygon-Schwerpunkt (für Außenrichtung)
    const centroid = {
        x: poly.reduce((s, p) => s + p.x, 0) / polyN,
        y: poly.reduce((s, p) => s + p.y, 0) / polyN,
    };

    // Perimeter-Länge berechnen
    let perimeterLength = 0;
    for (let i = 0; i < polyN; i++) {
        const p0 = poly[i];
        const p1 = poly[(i + 1) % polyN];
        perimeterLength += Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
    }

    // Gleichmäßig entlang des Polygon-Randes wandern (konstante Bogenlänge)
    const walkPerimeter = (numSteps: number): { x: number; y: number; nx: number; ny: number }[] => {
        const stepLen = perimeterLength / numSteps;
        const points: { x: number; y: number; nx: number; ny: number }[] = [];
        let remaining = 0;
        for (let i = 0; i < polyN; i++) {
            const p0 = poly[i];
            const p1 = poly[(i + 1) % polyN];
            const ex = p1.x - p0.x, ey = p1.y - p0.y;
            const edgeLen = Math.sqrt(ex * ex + ey * ey);
            if (edgeLen < 0.1) continue;
            let d = remaining;
            while (d <= edgeLen) {
                const t = d / edgeLen;
                const wx = p0.x + ex * t;
                const wy = p0.y + ey * t;
                // Außenrichtung: vom Schwerpunkt zum Punkt (funktioniert für stern-förmige Polygone)
                const dxO = wx - centroid.x;
                const dyO = wy - centroid.y;
                const dLen = Math.sqrt(dxO * dxO + dyO * dyO);
                points.push({
                    x: wx, y: wy,
                    nx: dLen > 0.01 ? dxO / dLen : 0,
                    ny: dLen > 0.01 ? dyO / dLen : 0,
                });
                d += stepLen;
            }
            remaining = d - edgeLen;
        }
        return points;
    };

    // ── Phase 1: Row-1 candidates (fixed arc-length step, uniform perimeter spacing) ──
    const step1 = 2 * bubbleRadius + 6;
    const offset1 = bubbleRadius + 10;
    const margin = bubbleRadius + 4;
    const numRow1 = Math.max(N * 2, Math.floor(perimeterLength / step1));
    const walkPts = walkPerimeter(numRow1);

    const row1: Slot[] = [];
    for (const wp of walkPts) {
        const cx = wp.x + wp.nx * offset1;
        const cy = wp.y + wp.ny * offset1;
        if (cx >= margin && cx <= containerWidth - margin &&
            cy >= margin && cy <= containerHeight - margin &&
            !isInMask(cx, cy) && !isInBlockedZone(cx, cy)) {
            row1.push({ x: cx, y: cy });
        }
    }

    // ── Phase 2: Row-2 candidates (hexagonal stagger between consecutive row-1 pairs) ──
    const offset2 = bubbleRadius * Math.sqrt(3);
    const minRow2Gap = 2 * bubbleRadius + 4;
    const row2: Slot[] = [];
    const row2Keys = new Set<string>();

    for (let i = 0; i < row1.length; i++) {
        const A = row1[i];
        const B = row1[(i + 1) % row1.length];
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;
        const dxO = mx - centroid.x, dyO = my - centroid.y;
        const dLen = Math.sqrt(dxO * dxO + dyO * dyO);
        if (dLen < 0.01) continue;
        const r2x = mx + (dxO / dLen) * offset2;
        const r2y = my + (dyO / dLen) * offset2;
        if (r2x < margin || r2x > containerWidth - margin ||
            r2y < margin || r2y > containerHeight - margin) continue;
        if (isInMask(r2x, r2y) || isInBlockedZone(r2x, r2y)) continue;
        if (Math.hypot(r2x - A.x, r2y - A.y) < minRow2Gap ||
            Math.hypot(r2x - B.x, r2y - B.y) < minRow2Gap) continue;
        const key = `${Math.round(r2x)},${Math.round(r2y)}`;
        if (!row2Keys.has(key)) {
            row2.push({ x: r2x, y: r2y });
            row2Keys.add(key);
        }
    }

    // ── Phase 3: Sector-based selection from combined candidate pool ──────────────
    const allCandidates: Slot[] = [...row1, ...row2];
    const baseOffset = offset1;

    // Ray-Fallback: Strahl vom Schwerpunkt → Polygon-Schnittpunkt + Offset nach außen.
    // Gibt null zurück wenn das Ergebnis in einer Sperrzone oder Maske liegt.
    const rayFallback = (angle: number): Slot | null => {
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        let bestT = Infinity;
        let hitX = centroid.x + cosA * baseOffset;
        let hitY = centroid.y + sinA * baseOffset;
        for (let i = 0; i < polyN; i++) {
            const p0 = poly[i], p1 = poly[(i + 1) % polyN];
            const ex = p1.x - p0.x, ey = p1.y - p0.y;
            const denom = cosA * ey - sinA * ex;
            if (Math.abs(denom) < 1e-9) continue;
            const t = ((p0.x - centroid.x) * ey - (p0.y - centroid.y) * ex) / denom;
            const u = ((p0.x - centroid.x) * sinA - (p0.y - centroid.y) * cosA) / denom;
            if (t > 1 && u >= 0 && u <= 1 && t < bestT) {
                bestT = t;
                hitX = centroid.x + cosA * t;
                hitY = centroid.y + sinA * t;
            }
        }
        const rx = Math.max(bubbleRadius, Math.min(containerWidth - bubbleRadius, hitX + cosA * baseOffset));
        const ry = Math.max(bubbleRadius, Math.min(containerHeight - bubbleRadius, hitY + sinA * baseOffset));
        if (isInBlockedZone(rx, ry) || isInMask(rx, ry)) return null;
        return { x: rx, y: ry };
    };

    // N equal sectors around centroid → one slot per sector
    const sectorAngle = (2 * Math.PI) / N;
    const sectorBuckets: Slot[][] = Array.from({ length: N }, () => []);
    for (const c of allCandidates) {
        let a = Math.atan2(c.y - centroid.y, c.x - centroid.x);
        if (a < 0) a += 2 * Math.PI;
        sectorBuckets[Math.floor(a / sectorAngle) % N].push(c);
    }

    const sectorChosen: (Slot | null)[] = Array.from({ length: N }, (_, i) => {
        const bisector = (i + 0.5) * sectorAngle;
        const bucket = sectorBuckets[i];
        if (bucket.length === 0) return rayFallback(bisector);
        return bucket.reduce((best, c) => {
            let ca = Math.atan2(c.y - centroid.y, c.x - centroid.x);
            if (ca < 0) ca += 2 * Math.PI;
            let diff = Math.abs(ca - bisector);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            let ba = Math.atan2(best.y - centroid.y, best.x - centroid.x);
            if (ba < 0) ba += 2 * Math.PI;
            let bdiff = Math.abs(ba - bisector);
            if (bdiff > Math.PI) bdiff = 2 * Math.PI - bdiff;
            return diff < bdiff ? c : best;
        });
    });

    const chosen: Slot[] = sectorChosen.filter((s): s is Slot => s !== null);
    if (chosen.length === 0) {
        for (const m of markers) result[m.id] = { x: containerWidth / 2, y: containerHeight / 2 };
        return result;
    }
    if (chosen.length < N) {
        const usedKeys = new Set(chosen.map(s => `${Math.round(s.x)},${Math.round(s.y)}`));
        const extras = allCandidates
            .filter(c => !usedKeys.has(`${Math.round(c.x)},${Math.round(c.y)}`))
            .sort((a, b) =>
                Math.atan2(a.y - centroid.y, a.x - centroid.x) -
                Math.atan2(b.y - centroid.y, b.x - centroid.x)
            );
        let ei = 0;
        while (chosen.length < N && ei < extras.length) chosen.push(extras[ei++]);
        while (chosen.length < N) chosen.push(chosen[chosen.length - 1]);
    }

    chosen.sort((a, b) =>
        Math.atan2(a.y - centroid.y, a.x - centroid.x) -
        Math.atan2(b.y - centroid.y, b.x - centroid.x)
    );

    // Marker nach Winkel sortieren → 1:1 Zuordnung minimiert Kreuzungen
    const sortedMarkers = markers
        .map(m => ({ ...m, angle: Math.atan2(m.y - centroid.y, m.x - centroid.x) }))
        .sort((a, b) => a.angle - b.angle);

    const assignments: { id: string; slot: Slot }[] = sortedMarkers.map((m, i) => ({
        id: m.id,
        slot: { ...chosen[i] },
    }));

    // Track row-2 slots before repulsion moves them
    const isRow2Slot: boolean[] = assignments.map(a =>
        row2Keys.has(`${Math.round(a.slot.x)},${Math.round(a.slot.y)}`)
    );

    // Crossing reduction: bubble-sort swap until stable (max 20 passes)
    for (let pass = 0; pass < 20; pass++) {
        let swapped = false;
        for (let i = 0; i < N; i++) {
            const mi = sortedMarkers[i];
            for (let j = i + 1; j < N; j++) {
                const mj = sortedMarkers[j];
                if (segmentsCross(
                    mi.x, mi.y, assignments[i].slot.x, assignments[i].slot.y,
                    mj.x, mj.y, assignments[j].slot.x, assignments[j].slot.y,
                )) {
                    const tmp = assignments[i].slot;
                    assignments[i].slot = assignments[j].slot;
                    assignments[j].slot = tmp;
                    const tmpR2 = isRow2Slot[i];
                    isRow2Slot[i] = isRow2Slot[j];
                    isRow2Slot[j] = tmpR2;
                    swapped = true;
                }
            }
        }
        if (!swapped) break;
    }

    // 2D repulsion (150 rounds, minDist = 2r + 8)
    const minDist2 = 2 * bubbleRadius + 8;
    for (let round = 0; round < 150; round++) {
        let anyChange = false;
        for (let i = 0; i < assignments.length; i++) {
            for (let j = i + 1; j < assignments.length; j++) {
                const a = assignments[i];
                const b = assignments[j];
                const dx = a.slot.x - b.slot.x;
                const dy = a.slot.y - b.slot.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist >= minDist2 || dist < 0.1) continue;
                const push = (minDist2 - dist) / 2 + 1;
                const nx2 = dx / dist, ny2 = dy / dist;
                const newAx = a.slot.x + nx2 * push;
                const newAy = a.slot.y + ny2 * push;
                if (isInBounds(newAx, newAy) && !isInMask(newAx, newAy) && !isInBlockedZone(newAx, newAy)) {
                    assignments[i].slot = { x: newAx, y: newAy };
                    anyChange = true;
                }
                const newBx = b.slot.x - nx2 * push;
                const newBy = b.slot.y - ny2 * push;
                if (isInBounds(newBx, newBy) && !isInMask(newBx, newBy) && !isInBlockedZone(newBx, newBy)) {
                    assignments[j].slot = { x: newBx, y: newBy };
                    anyChange = true;
                }
            }
        }
        if (!anyChange) break;
    }

    // Tangential spread (30 passes, multiplier 0.8)
    for (let round = 0; round < 30; round++) {
        let anySpread = false;
        for (let i = 0; i < assignments.length; i++) {
            for (let j = i + 1; j < assignments.length; j++) {
                const ai = assignments[i].slot;
                const aj = assignments[j].slot;
                const dx = ai.x - aj.x;
                const dy = ai.y - aj.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist >= minDist2 || dist < 0.1) continue;
                const angleI = Math.atan2(ai.y - centroid.y, ai.x - centroid.x);
                const angleJ = Math.atan2(aj.y - centroid.y, aj.x - centroid.x);
                let angDiff = angleI - angleJ;
                while (angDiff > Math.PI) angDiff -= 2 * Math.PI;
                while (angDiff < -Math.PI) angDiff += 2 * Math.PI;
                const tangPush = (minDist2 - dist) / 2 * 0.8;
                const sign = angDiff >= 0 ? 1 : -1;
                const tiX = -Math.sin(angleI), tiY = Math.cos(angleI);
                const newIx = ai.x + sign * tiX * tangPush;
                const newIy = ai.y + sign * tiY * tangPush;
                if (isInBounds(newIx, newIy) && !isInMask(newIx, newIy) && !isInBlockedZone(newIx, newIy)) {
                    assignments[i].slot = { x: newIx, y: newIy };
                    anySpread = true;
                }
                const tjX = -Math.sin(angleJ), tjY = Math.cos(angleJ);
                const newJx = aj.x - sign * tjX * tangPush;
                const newJy = aj.y - sign * tjY * tangPush;
                if (isInBounds(newJx, newJy) && !isInMask(newJx, newJy) && !isInBlockedZone(newJx, newJy)) {
                    assignments[j].slot = { x: newJx, y: newJy };
                    anySpread = true;
                }
            }
        }
        if (!anySpread) break;
    }

    // ── Phase 4: Row-2 line-gap nudge ────────────────────────────────────────────
    // For each row-2 chosen slot, nudge its two nearest row-1 chosen neighbors
    // 4px apart tangentially so connector lines can pass between them.
    const nudgeGap = 4;
    for (let i = 0; i < assignments.length; i++) {
        if (!isRow2Slot[i]) continue;
        const r2Angle = Math.atan2(assignments[i].slot.y - centroid.y, assignments[i].slot.x - centroid.x);
        const neighbors: { nbrIdx: number; angDist: number }[] = [];
        for (let ni = 0; ni < assignments.length; ni++) {
            if (ni === i || isRow2Slot[ni]) continue;
            const ab = Math.atan2(assignments[ni].slot.y - centroid.y, assignments[ni].slot.x - centroid.x);
            let d = Math.abs(ab - r2Angle);
            if (d > Math.PI) d = 2 * Math.PI - d;
            neighbors.push({ nbrIdx: ni, angDist: d });
        }
        neighbors.sort((a, b) => a.angDist - b.angDist);
        for (const { nbrIdx } of neighbors.slice(0, 2)) {
            const nbr = assignments[nbrIdx].slot;
            const bAngle = Math.atan2(nbr.y - centroid.y, nbr.x - centroid.x);
            let angDiff = bAngle - r2Angle;
            while (angDiff > Math.PI) angDiff -= 2 * Math.PI;
            while (angDiff < -Math.PI) angDiff += 2 * Math.PI;
            const sign = angDiff >= 0 ? 1 : -1;
            const tbX = -Math.sin(bAngle), tbY = Math.cos(bAngle);
            const newBx = nbr.x + sign * tbX * nudgeGap;
            const newBy = nbr.y + sign * tbY * nudgeGap;
            if (isInBounds(newBx, newBy) && !isInMask(newBx, newBy) && !isInBlockedZone(newBx, newBy)) {
                assignments[nbrIdx].slot = { x: newBx, y: newBy };
            }
        }
    }

    // Clamp to safe margin
    for (const a of assignments) {
        a.slot.x = Math.max(margin, Math.min(containerWidth - margin, a.slot.x));
        a.slot.y = Math.max(margin, Math.min(containerHeight - margin, a.slot.y));
    }

    for (const a of assignments) {
        result[a.id] = {
            x: Math.max(margin, Math.min(containerWidth - margin, a.slot.x)),
            y: Math.max(margin, Math.min(containerHeight - margin, a.slot.y)),
        };
    }
    return result;
}

// ── Offset-Ring Layout (aktuell) ─────────────────────────────────────────────
// Portierung von lageplan-algo-test.html, erweitert um echten Offset:
//   1. Abstandsfeld zur Vereinigung aller Masken -> Linie mit Abstand d = r + offset
//      (Marching Squares). Auf dem Seitenrand (Abstand r) wird die Linie
//      abgeschnitten, Blasen laufen dort am Rand entlang.
//   2. Reihe 1: entlang jeder Linie im festen Luftlinien-Abstand 2r + gap,
//      nur Plaetze ausserhalb von Masken/Sperrzonen und >= 2r von allen anderen.
//   3. Reihe 2: hinter einem Reihe-1-Paar im Abstand hexFactor*(2r+gap) zu
//      beiden, senkrecht zur Verbindung, auf der maskenfernen Seite.
//   4. Reihe-1-Paare mit Reihe-2-Blase dahinter werden um `spread` entlang der
//      Linie gespreizt (nur tangential), danach Reihe 2 neu.
//   5. Zuordnung Marker -> Plaetze: zyklisch-monotone DP (kurze Linien, keine
//      Kreuzungen durch Reihenfolge), danach Kreuzungs-Tausch.
// Ueberlappungsfreiheit entsteht durch die Konstruktion; es gibt keine
// nachtraegliche Abstossung. Reicht der Platz nicht, kommen weitere Ringe nach aussen hinzu (erst mit,
// dann ohne Luecke/Spreizung); erst dann Rueckfall auf
// computePolygonPerimeterSlotsLegacy. Kein Mittelpunkt liegt naeher als
// r + offset an der Maske (auch nicht am Seitenrand).

interface RingSlot extends Slot {
    /** 1 = innerste Reihe, 2 = Hex-Reihe dahinter, >= 3 = weitere Ringe aussen */
    row: number;
}

/**
 * Berechnet Slots auf einem Ring mit konstantem Abstand um die Masken.
 * Benötigt mindestens eine Maske — sonst Fallback auf computeBubbleSlots.
 */
export function computePolygonPerimeterSlots(input: ComputeRadialSlotsInput): LayoutResult {
    const { markers, containerWidth: W, containerHeight: H, blockedZones } = input;
    const N = markers.length;
    const result: LayoutResult = {};
    if (N === 0 || W <= 0 || H <= 0) return result;

    const r = input.bubbleRadius ?? 48 * (Math.max(W, H) / 800);

    if (!input.masks || input.masks.length === 0) {
        return computeBubbleSlots({ markers, containerWidth: W, containerHeight: H, blockedZones, bubbleRadius: r });
    }
    if (W <= 2 * r || H <= 2 * r) return computePolygonPerimeterSlotsLegacy(input);

    const opt = input.layout ?? {};
    const gap = opt.gap ?? 0.075 * r;
    const offset = opt.offset ?? -0.45 * r;
    const hexFactor = opt.hexFactor ?? 1.0;
    const spread = opt.spread ?? 0.6 * r;
    const d = Math.max(1, r + offset); // Abstand Blasen-MITTELPUNKT zur Maske

    const bgZoom = input.bgZoom ?? 1;
    const masksPx = input.masks
        .map(mask => mask.points.map(p => ({
            x: (50 + (p.x - 50) * bgZoom) / 100 * W,
            y: (50 + (p.y - 50) * bgZoom) / 100 * H,
        })))
        .filter(poly => poly.length >= 3);
    if (masksPx.length === 0) {
        return computeBubbleSlots({ markers, containerWidth: W, containerHeight: H, blockedZones, bubbleRadius: r });
    }

    const maskDist = makeMaskDistance(masksPx);

    const isInBlockedZone = (x: number, y: number): boolean => {
        if (!blockedZones) return false;
        for (const zone of blockedZones) {
            const lx = (zone.x / 100) * W;
            const ly = (zone.y / 100) * H;
            const lw = (zone.width / 100) * W;
            const lh = (zone.height / 100) * W; // Konvention: Hoehe in % der Breite
            const pad = zone.padding ?? r;
            if (x >= lx - pad && x <= lx + lw + pad && y >= ly - pad && y <= ly + lh + pad) return true;
        }
        return false;
    };
    const tol = 0.5;
    const cell = Math.max(3, r / 8);
    // Mindestabstand Mittelpunkt -> Maske. Wichtig dort, wo die Linie am
    // Seitenrand entlanglaeuft (Maske reicht bis an den Rand): dort waere sonst
    // nur der Mittelpunkt ausserhalb der Maske und die Blase wuerde den Plan
    // (z. B. Beschriftungen) weit mehr als `offset` ueberdecken.
    const minMaskDist = d - cell / 2;
    const isValid = (x: number, y: number) =>
        x >= r - tol && x <= W - r + tol && y >= r - tol && y <= H - r + tol &&
        maskDist(x, y) >= minMaskDist && !isInBlockedZone(x, y);

    // 1. Linie gleichen Abstands, am Seitenrand (Abstand r) abgeschnitten
    const F = (x: number, y: number) =>
        Math.max(maskDist(x, y) - d, rectSignedDistance(x, y, r, r, W - r, H - r));
    const loops: ArcLoop[] = extractOuterLoops(F, W, H, cell)
        .map(makeArcLoop)
        .filter(l => l.length >= 2 * r)
        // deterministische Reihenfolge: laengste Linie zuerst
        .sort((a, b) => b.length - a.length);
    if (loops.length === 0) return computePolygonPerimeterSlotsLegacy(input);

    const minDist = 2 * r - 1e-6;
    const farEnough = (x: number, y: number, others: Slot[], dist: number) =>
        others.every(o => Math.hypot(o.x - x, o.y - y) >= dist);

    const buildSlots = (g: number, sp: number): RingSlot[] => {
        const step = 2 * r + g;
        // 2. Reihe 1 je Linie (mit Bogenlaenge s)
        const r1: { x: number; y: number; s: number }[][] = loops.map(() => []);
        const allR1: Slot[] = [];
        // Schrittweite nach LUFTLINIE (nicht Bogenlaenge): an Ecken ist die Sehne
        // kuerzer als der Bogen -> dort fein weiterschieben statt Platz zu verlieren.
        const fine = step / 24;
        loops.forEach((loop, li) => {
            let prev: { x: number; y: number } | null = null;
            let s = 0;
            while (s < loop.length) {
                const p = pointAtArc(loop, s);
                const okStep = !prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= step - 1e-6;
                if (okStep && isValid(p.x, p.y) && farEnough(p.x, p.y, allR1, minDist)) {
                    r1[li].push({ x: p.x, y: p.y, s });
                    allR1.push(p);
                    prev = p;
                    s += step;
                } else {
                    s += fine;
                }
            }
        });

        // 3. Reihe 2
        const buildRow2 = (rows1: { x: number; y: number; s: number }[][]) => {
            const all1: Slot[] = rows1.flat();
            const out: (Slot & { loop: number; pair: number })[] = [];
            const target = hexFactor * step;
            rows1.forEach((row, li) => {
                const n = row.length;
                if (n < 2) return;
                const pairs = n >= 3 ? n : 1;
                for (let i = 0; i < pairs; i++) {
                    const a = row[i], b = row[(i + 1) % n];
                    const ab = Math.hypot(b.x - a.x, b.y - a.y);
                    if (ab < 1e-6 || ab > 2.2 * step) continue;
                    const half = ab / 2;
                    if (half >= target) continue;
                    const h = Math.sqrt(target * target - half * half);
                    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                    const px = -(b.y - a.y) / ab, py = (b.x - a.x) / ab;
                    const c1 = { x: mx + px * h, y: my + py * h };
                    const c2 = { x: mx - px * h, y: my - py * h };
                    const c = maskDist(c1.x, c1.y) >= maskDist(c2.x, c2.y) ? c1 : c2;
                    if (!isValid(c.x, c.y)) continue;
                    if (!farEnough(c.x, c.y, all1, minDist)) continue;
                    if (!farEnough(c.x, c.y, out, 2 * r + g - 1e-6)) continue;
                    out.push({ ...c, loop: li, pair: i });
                }
            });
            return out;
        };

        let row2 = buildRow2(r1);

        // 4. Spreizung der Reihe-1-Paare mit Reihe-2-Blase dahinter (1D, tangential)
        if (sp > 0 && row2.length > 0) {
            const relaxed = r1.map((row, li) => {
                const n = row.length;
                const loop = loops[li];
                const L = loop.length;
                const hasR2 = new Set(row2.filter(q => q.loop === li).map(q => q.pair));
                if (n < 3 || hasR2.size === 0) return row;
                const spEff = Math.min(sp, (L - n * step) / hasR2.size);
                if (spEff <= 0) return row;
                const s = row.map(p => p.s);
                for (let pass = 0; pass < 200; pass++) {
                    let moved = false;
                    for (let i = 0; i < n; i++) {
                        const j = (i + 1) % n;
                        const gapS = j === 0 ? L - s[i] + s[j] : s[j] - s[i];
                        const need = hasR2.has(i) ? step + spEff : step;
                        if (gapS < need - 0.1) {
                            const push = (need - gapS) / 2;
                            s[i] -= push;
                            s[j] += push;
                            moved = true;
                        }
                    }
                    if (!moved) break;
                }
                return s.map(si => {
                    const p = pointAtArc(loop, si);
                    return { x: p.x, y: p.y, s: ((si % L) + L) % L };
                });
            });
            // Nur uebernehmen, wenn alle Plaetze gueltig und ueberlappungsfrei bleiben
            const flat = relaxed.flat();
            const ok = flat.every((p, i) =>
                isValid(p.x, p.y) &&
                flat.every((q, j) => j === i || Math.hypot(p.x - q.x, p.y - q.y) >= minDist));
            if (ok) {
                for (let li = 0; li < r1.length; li++) r1[li] = relaxed[li];
                row2 = buildRow2(r1);
            }
        }

        return [
            ...r1.flat().map(p => ({ x: p.x, y: p.y, row: 1 as const })),
            ...row2.map(p => ({ x: p.x, y: p.y, row: 2 as const })),
        ];
    };

    // Weitere Ringe nach aussen, wenn Reihe 1 + 2 nicht reichen
    // (Abstand je Ring = Reihenabstand eines Hex-Gitters).
    const addOuterRings = (base: RingSlot[], g: number): RingSlot[] => {
        const out = [...base];
        const step = 2 * r + g;
        const ringGap = hexFactor * step * Math.sqrt(3) / 2;
        for (let k = 1; k <= 8 && out.length < N; k++) {
            const dk = d + k * ringGap;
            const Fk = (x: number, y: number) =>
                Math.max(maskDist(x, y) - dk, rectSignedDistance(x, y, r, r, W - r, H - r));
            const ringLoops = extractOuterLoops(Fk, W, H, cell)
                .map(makeArcLoop)
                .filter(l => l.length >= 2 * r)
                .sort((a, b) => b.length - a.length);
            if (ringLoops.length === 0) break;
            const before = out.length;
            for (const loop of ringLoops) {
                let prev: Slot | null = null;
                let sArc = 0;
                while (sArc < loop.length) {
                    const p = pointAtArc(loop, sArc);
                    const okStep = !prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= step - 1e-6;
                    if (okStep && isValid(p.x, p.y) && farEnough(p.x, p.y, out, minDist)) {
                        out.push({ x: p.x, y: p.y, row: k + 2 });
                        prev = p;
                        sArc += step;
                    } else {
                        sArc += step / 24;
                    }
                }
            }
            if (out.length === before && dk > Math.max(W, H)) break;
        }
        return out;
    };

    let slots = buildSlots(gap, spread);
    if (slots.length < N) slots = addOuterRings(slots, gap);
    if (slots.length < N) slots = addOuterRings(buildSlots(0, 0), 0);
    if (slots.length < N) return computePolygonPerimeterSlotsLegacy(input);

    // 5. Zuordnung: zyklisch-monotone DP ueber Winkel um den Marker-Schwerpunkt
    const cx = markers.reduce((a, m) => a + m.x, 0) / N;
    const cy = markers.reduce((a, m) => a + m.y, 0) / N;
    const ang = (p: Slot) => Math.atan2(p.y - cy, p.x - cx);
    const ms = [...markers].sort((a, b) => ang(a) - ang(b) || a.id.localeCompare(b.id));
    const ss = [...slots].sort((a, b) => ang(a) - ang(b) || a.x - b.x || a.y - b.y);
    const M = ss.length;
    const r2Penalty = r; // je Reihe weiter aussen +r: innere Reihen bevorzugen
    const cost = (i: number, k: number) =>
        Math.hypot(ms[i].x - ss[k].x, ms[i].y - ss[k].y) + (ss[k].row - 1) * r2Penalty;

    let bestTotal = Infinity;
    let bestPick: number[] = [];
    const dp = new Float64Array((N + 1) * (M + 1));
    const take = new Uint8Array((N + 1) * (M + 1));
    const idx = (i: number, k: number) => i * (M + 1) + k;
    for (let rot = 0; rot < M; rot++) {
        dp.fill(Infinity);
        take.fill(0);
        for (let k = 0; k <= M; k++) dp[idx(0, k)] = 0;
        for (let i = 1; i <= N; i++) {
            for (let k = i; k <= M; k++) {
                const skip = dp[idx(i, k - 1)];
                const use = dp[idx(i - 1, k - 1)] + cost(i - 1, (rot + k - 1) % M);
                if (use <= skip) { dp[idx(i, k)] = use; take[idx(i, k)] = 1; }
                else dp[idx(i, k)] = skip;
            }
        }
        const total = dp[idx(N, M)];
        if (total < bestTotal - 1e-9) {
            bestTotal = total;
            const pick: number[] = new Array(N);
            let i = N, k = M;
            while (i > 0) {
                if (take[idx(i, k)]) { pick[i - 1] = (rot + k - 1) % M; i--; }
                k--;
            }
            bestPick = pick;
        }
    }

    const assigned: Slot[] = bestPick.map(k => ({ x: ss[k].x, y: ss[k].y }));

    // Kreuzungs-Tausch (Plaetze bleiben dieselben, nur die Zuordnung aendert sich)
    for (let pass = 0; pass < 20; pass++) {
        let swapped = false;
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                if (segmentsCross(
                    ms[i].x, ms[i].y, assigned[i].x, assigned[i].y,
                    ms[j].x, ms[j].y, assigned[j].x, assigned[j].y,
                )) {
                    const t = assigned[i]; assigned[i] = assigned[j]; assigned[j] = t;
                    swapped = true;
                }
            }
        }
        if (!swapped) break;
    }

    ms.forEach((m, i) => { result[m.id] = assigned[i]; });
    return result;
}
