// Reine Map-Hilfsfunktionen, herausgelöst aus ErkiApp / MapView (Welle 4 — 3/4).
// Keine React- oder DOM-Abhängigkeiten — getestet in lib/mapInteractions.test.ts.

import type { Station } from '@/lib/types';

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
