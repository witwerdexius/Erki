// ── offsetContour ───────────────────────────────────────────────────────────
// Reine Geometrie fuer den "echten" Polygon-Offset der Stations-Anordnung.
//
// Idee: Statt Polygonkanten zu verschieben (bricht bei konkaven Formen),
// wird ein Abstandsfeld ueber die Seite gelegt und daraus per Marching
// Squares die Linie gleichen Abstands gezogen. Das funktioniert fuer
// beliebige (auch konkave und mehrere) Masken ohne Selbstueberschneidungen:
//   - Aussenecken werden rund
//   - Einbuchtungen schmaler als 2*Abstand werden ueberbrueckt
//   - breitere Einbuchtungen werden umlaufen
//
// Keine Abhaengigkeiten, keine DOM-/React-Bezuege.

export interface Pt {
    x: number;
    y: number;
}

/** Abstand Punkt -> Strecke AB. */
export function pointSegmentDistance(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
): number {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t, cy = ay + dy * t;
    return Math.hypot(px - cx, py - cy);
}

/** Ray-Casting Point-in-Polygon (lokal, um Zirkelimporte zu vermeiden). */
export function pointInPoly(px: number, py: number, poly: Pt[]): boolean {
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

/**
 * Abstand eines Punktes zur Vereinigung aller Masken.
 * 0 innerhalb einer Maske, sonst kuerzester Abstand zu einer Maskenkante.
 */
export function makeMaskDistance(polys: Pt[][]): (x: number, y: number) => number {
    const valid = polys.filter(p => p.length >= 3);
    return (x: number, y: number) => {
        let best = Infinity;
        for (const poly of valid) {
            if (pointInPoly(x, y, poly)) return 0;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const d = pointSegmentDistance(x, y, poly[j].x, poly[j].y, poly[i].x, poly[i].y);
                if (d < best) best = d;
            }
        }
        return best;
    };
}

/** Vorzeichenbehafteter Abstand zu einem achsparallelen Rechteck (negativ = innen). */
export function rectSignedDistance(
    x: number, y: number,
    x0: number, y0: number, x1: number, y1: number,
): number {
    const dx = Math.max(x0 - x, x - x1);
    const dy = Math.max(y0 - y, y - y1);
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    const inside = Math.min(Math.max(dx, dy), 0);
    return outside + inside;
}

/**
 * Zieht per Marching Squares die AEUSSEREN Randlinien der Region F <= 0.
 * Voraussetzung: F > 0 am Rand des Rasters [0,W] x [0,H] (dann sind alle
 * Linien geschlossen). Loecher der Region (z. B. ein von Masken umschlossener
 * Innenhof) werden verworfen.
 *
 * @param cell Rasterweite in px (kleiner = genauer, langsamer)
 */
export function extractOuterLoops(
    F: (x: number, y: number) => number,
    W: number,
    H: number,
    cell: number,
): Pt[][] {
    const nx = Math.max(2, Math.ceil(W / cell) + 1);
    const ny = Math.max(2, Math.ceil(H / cell) + 1);
    const hx = W / (nx - 1), hy = H / (ny - 1);

    const v = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            let val = F(i * hx, j * hy);
            if (val === 0) val = -1e-9; // exakte Nullen vermeiden
            v[j * nx + i] = val;
        }
    }
    const val = (i: number, j: number) => v[j * nx + i];

    // Kanten-IDs: horizontale Kante (i,j)-(i+1,j) = j*nx+i,
    // vertikale Kante (i,j)-(i,j+1) = HOFF + j*nx+i
    const HOFF = nx * ny;
    const crossPt = new Map<number, Pt>();
    const edgePoint = (id: number): Pt => {
        const cached = crossPt.get(id);
        if (cached) return cached;
        let ax: number, ay: number, bx: number, by: number, va: number, vb: number;
        if (id < HOFF) {
            const i = id % nx, j = Math.floor(id / nx);
            ax = i * hx; ay = j * hy; bx = (i + 1) * hx; by = ay;
            va = val(i, j); vb = val(i + 1, j);
        } else {
            const k = id - HOFF;
            const i = k % nx, j = Math.floor(k / nx);
            ax = i * hx; ay = j * hy; bx = ax; by = (j + 1) * hy;
            va = val(i, j); vb = val(i, j + 1);
        }
        const t = va / (va - vb);
        const p = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
        crossPt.set(id, p);
        return p;
    };

    const adj = new Map<number, number[]>();
    const link = (a: number, b: number) => {
        (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
        (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    };

    for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
            const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
            const ia = a <= 0, ib = b <= 0, ic = c <= 0, id = d <= 0;
            const top = j * nx + i;
            const bottom = (j + 1) * nx + i;
            const left = HOFF + j * nx + i;
            const right = HOFF + j * nx + i + 1;
            const edges: number[] = [];
            if (ia !== ib) edges.push(top);
            if (ib !== ic) edges.push(right);
            if (ic !== id) edges.push(bottom);
            if (id !== ia) edges.push(left);
            if (edges.length === 2) {
                link(edges[0], edges[1]);
            } else if (edges.length === 4) {
                // Sattelpunkt: Mittelwert entscheidet, welche Ecken verbunden sind
                const centerInside = (a + b + c + d) / 4 <= 0;
                if (centerInside === ia) {
                    // a & c verbunden -> b und d abtrennen
                    link(top, right);
                    link(bottom, left);
                } else {
                    link(top, left);
                    link(right, bottom);
                }
            }
        }
    }

    // Kanten zu geschlossenen Linien verketten
    const visited = new Set<number>();
    const loops: Pt[][] = [];
    for (const start of adj.keys()) {
        if (visited.has(start)) continue;
        const ids: number[] = [start];
        visited.add(start);
        let prev = -1;
        let cur = start;
        for (;;) {
            const nbrs = adj.get(cur)!;
            let next = -1;
            for (const n of nbrs) {
                if (n !== prev && !visited.has(n)) { next = n; break; }
            }
            if (next === -1) break;
            visited.add(next);
            ids.push(next);
            prev = cur;
            cur = next;
        }
        if (ids.length >= 3) loops.push(ids.map(edgePoint));
    }

    // Nur aeussere Raender behalten: direkt innerhalb der Linie muss F <= 0 sein
    const eps = Math.min(hx, hy) * 0.25;
    return loops.filter(loop => {
        for (let k = 0; k < loop.length; k++) {
            const p = loop[k], q = loop[(k + 1) % loop.length];
            const dx = q.x - p.x, dy = q.y - p.y;
            const len = Math.hypot(dx, dy);
            if (len < 1e-6) continue;
            const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
            const nxv = -dy / len, nyv = dx / len;
            const p1 = { x: mx + nxv * eps, y: my + nyv * eps };
            const p2 = { x: mx - nxv * eps, y: my - nyv * eps };
            const probe = pointInPoly(p1.x, p1.y, loop) ? p1 : pointInPoly(p2.x, p2.y, loop) ? p2 : null;
            if (!probe) continue;
            return F(probe.x, probe.y) <= 0;
        }
        return false;
    });
}

/** Geschlossene Linie mit kumulierten Bogenlaengen fuer Punkt-bei-Bogenlaenge. */
export interface ArcLoop {
    pts: Pt[];
    /** cum[i] = Bogenlaenge bis pts[i]; cum[n] = Gesamtlaenge */
    cum: number[];
    length: number;
}

export function makeArcLoop(pts: Pt[]): ArcLoop {
    const cum = [0];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    return { pts, cum, length: cum[pts.length] };
}

/** Punkt auf der geschlossenen Linie bei Bogenlaenge s (wird eingewickelt). */
export function pointAtArc(loop: ArcLoop, s: number): Pt {
    const L = loop.length;
    if (L <= 0) return { ...loop.pts[0] };
    s = ((s % L) + L) % L;
    // binaere Suche nach Segment
    let lo = 0, hi = loop.pts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (loop.cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    const a = loop.pts[lo], b = loop.pts[(lo + 1) % loop.pts.length];
    const seg = loop.cum[lo + 1] - loop.cum[lo];
    const t = seg > 1e-9 ? (s - loop.cum[lo]) / seg : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
