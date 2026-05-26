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
     * wird er aus containerWidth abgeleitet (48 * containerWidth / 800),
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

    const mapScale = containerWidth / 800;
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
    const mapScale = containerWidth / 800;
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
 * Berechnet Slots entlang des Masken-Polygon-Randes.
 * Benötigt mindestens eine Maske — sonst Fallback auf computeBubbleSlots.
 */
export function computePolygonPerimeterSlots(input: ComputeRadialSlotsInput): LayoutResult {
    const { markers, containerWidth, containerHeight, blockedZones } = input;
    const N = markers.length;
    const result: LayoutResult = {};
    if (N === 0 || containerWidth <= 0 || containerHeight <= 0) return result;

    if (!input.masks || input.masks.length === 0) {
        return computeBubbleSlots({ markers, containerWidth, containerHeight, blockedZones });
    }

    const bgZoom = input.bgZoom ?? 1;
    const mapScale = containerWidth / 800;
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

    // Kandidaten-Slots: Polygon-Rand + Offset nach außen
    const generateCandidates = (offset: number, numSteps: number): Slot[] => {
        const walkedPoints = walkPerimeter(numSteps);
        const candidates: Slot[] = [];
        for (const wp of walkedPoints) {
            const cx = wp.x + wp.nx * offset;
            const cy = wp.y + wp.ny * offset;
            if (isInBounds(cx, cy) && !isInMask(cx, cy) && !isInBlockedZone(cx, cy)) {
                candidates.push({ x: cx, y: cy });
            }
        }
        return candidates;
    };

    // Kandidaten-Pool: dichte Abtastung des Polygon-Randes
    const gap = 8;
    const baseOffset = bubbleRadius + gap;
    const densePts = Math.max(N * 8, Math.ceil(perimeterLength / (bubbleRadius * 0.5)));
    let allCandidates: Slot[] = generateCandidates(baseOffset, densePts);
    if (allCandidates.length < N) {
        allCandidates = generateCandidates(baseOffset, densePts * 3);
    }

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

    // Sektor-basierte Auswahl: N gleichmäßige Winkelsektoren um den Schwerpunkt.
    // Garantiert einen Slot pro Sektor, unabhängig von der Perimeter-Längenverteilung.
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
        // Kandidat closest to sector bisector angle (bucket already excludes blocked positions)
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

    // Blocked sectors yield null — filter them out, then supplement from remaining candidates
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

    // Crossing reduction: bubble-sort swap until no crossing pair remains (max 20 passes)
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
                    swapped = true;
                }
            }
        }
        if (!swapped) break;
    }

    // 2D-Abstoßung: Blasen schieben sich gegenseitig weg
    const minDist2 = 2 * bubbleRadius + 12;
    for (let round = 0; round < 80; round++) {
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

    // Clamp to safe margin after repulsion
    const margin = bubbleRadius + 4;
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
