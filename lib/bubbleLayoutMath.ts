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
            if (px >= lx - bubbleRadius && px <= lx + lw + bubbleRadius &&
                py >= ly - bubbleRadius && py <= ly + lh + bubbleRadius) return true;
        }
        return false;
    };
    for (const item of items) {
        let pt = sToPoint(item.s, rect);
        for (let attempt = 0; attempt < 120 && isBlocked(pt.x, pt.y); attempt++) {
            item.s = wrap(item.s + minDist * 0.5, perimLen);
            pt = sToPoint(item.s, rect);
        }
    }

    // ── Schritt 6: 2D-Overlap-Pruefschleife ─────────────────────────────────
    const minDist2D = 2 * bubbleRadius + 5;
    for (let iter = 0; iter < 20; iter++) {
        let anyMoved = false;
        for (let i = 0; i < N; i++) {
            const ptI = sToPoint(items[i].s, rect);
            for (let j = i + 1; j < N; j++) {
                const ptJ = sToPoint(items[j].s, rect);
                const dx = ptI.x - ptJ.x, dy = ptI.y - ptJ.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist2D) {
                    items[j].s = wrap(items[j].s + (minDist2D - dist), perimLen);
                    anyMoved = true;
                }
            }
        }
        if (!anyMoved) break;
    }

    // ── Schritt 7: Kreuzungs-Pruefschleife ──────────────────────────────────
    const markerById: Record<string, { x: number; y: number }> = {};
    for (const m of markers) markerById[m.id] = { x: m.x, y: m.y };

    for (let iter = 0; iter < 50; iter++) {
        let swapped = false;
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
                    swapped = true;
                }
            }
        }
        if (!swapped) break;
    }

    // ── Schritt 7b: Sperrzonen nach Kreuzungsauflösung nochmal prüfen ────────
    if (blockedZones && blockedZones.length > 0) {
        for (let pass = 0; pass < 3; pass++) {
            let anyMoved = false;
            for (const item of items) {
                let pt = sToPoint(item.s, rect);
                for (let attempt = 0; attempt < 120 && isBlocked(pt.x, pt.y); attempt++) {
                    item.s = wrap(item.s + minDist * 0.5, perimLen);
                    pt = sToPoint(item.s, rect);
                    anyMoved = true;
                }
            }
            if (!anyMoved) break;
        }
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
