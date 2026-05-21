import type { Station } from '@/lib/types';

/**
 * Verschiebt eine Station per Drag-and-Drop von ihrer aktuellen Position
 * vor die Station mit `targetId` und nummeriert anschließend alle Stationen
 * (1-basiert) entsprechend ihrer neuen Reihenfolge.
 *
 * Reine Funktion — Eingabe-Array wird nicht mutiert.
 *
 * Liefert das ursprüngliche Array (nicht-mutierte Referenz) zurück, wenn:
 *  - draggedId === targetId
 *  - eine der IDs nicht gefunden wird
 */
export function reorderStationsByDrop(
    stations: Station[],
    draggedId: string,
    targetId: string,
): Station[] {
    if (draggedId === targetId) return stations;
    const fromIdx = stations.findIndex(s => s.id === draggedId);
    const toIdx = stations.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return stations;
    const next = [...stations];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next.map((s, i) => ({ ...s, number: (i + 1).toString() }));
}

/**
 * Verschiebt die Station mit `id` an die durch das Eingabefeld gewünschte
 * 1-basierte Position (`inputValue`) und renumeriert alle Stationen.
 *
 * Verhalten orientiert sich am ursprünglichen handleRowReorder in ErkiApp:
 *  - Ungültige (NaN) oder < 1 Werte werden ignoriert (→ Eingabe-Array zurück).
 *  - Werte > Länge werden auf das Maximum geclampt.
 *  - Bleibt die Position gleich, werden Nummern dennoch normalisiert.
 *
 * Reine Funktion — Eingabe-Array wird nicht mutiert.
 */
export function reorderStationsByNumberInput(
    stations: Station[],
    id: string,
    inputValue: string,
): Station[] {
    const fromIdx = stations.findIndex(s => s.id === id);
    if (fromIdx === -1) return stations;
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < 1) return stations;
    const toIdx = Math.min(parsed - 1, stations.length - 1);
    if (toIdx === fromIdx) {
        // Keine Bewegung, aber Nummern normalisieren (alte Logik 1:1 übernommen).
        return stations.map((s, i) => ({ ...s, number: (i + 1).toString() }));
    }
    const next = [...stations];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next.map((s, i) => ({ ...s, number: (i + 1).toString() }));
}

/**
 * Liefert das nächste freie 1-basierte Nummern-String für eine neue Station,
 * basierend auf der höchsten existierenden numerischen Nummer.
 *
 * Reine Funktion. Identisch zur Inline-Logik in addStation/handleApplyTemplate.
 */
export function nextStationNumber(stations: Station[]): string {
    const maxNum = Math.max(0, ...stations.map(s => parseInt(s.number) || 0));
    return (maxNum + 1).toString();
}
