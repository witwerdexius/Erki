/**
 * Pure Helpers für die Soft-Lock-Anzeige in StationsTable.
 *
 * Eingehende Broadcasts auf dem `editing`-Event werden in eine `editingMap`
 * gefüttert (`stationId → { userId, displayName, ts }`). Die UI zeigt pro
 * Station ein "X bearbeitet"-Badge an, wenn ein anderer User aktiv ist.
 *
 * Stale-Entry-Schutz: Wenn ein User die Seite schließt, ohne `stop` zu senden,
 * würden andere Clients dauerhaft "X bearbeitet" sehen. Lösung: Jeder Eintrag
 * trägt einen Timestamp; Einträge älter als `STALE_MS` werden weggeräumt.
 */

export interface EditingEntry {
  userId: string;
  displayName: string;
  /** Wall-clock-Timestamp (Date.now()) der letzten 'start'-Nachricht. */
  ts: number;
}

export type EditingMap = Record<string, EditingEntry>;

/** Eintrag gilt als stale, wenn er älter ist als 30 s. */
export const STALE_MS = 30_000;

export interface EditingBroadcast {
  stationId: string;
  action: 'start' | 'stop';
  userId?: string;
  displayName?: string;
}

/**
 * Wendet eine eingehende Broadcast-Nachricht auf eine bestehende Map an.
 * Reine Funktion — gibt eine NEUE Map zurück, wenn sich was geändert hat,
 * sonst die alte Referenz (für referentielle Stabilität in React-State).
 *
 * Verhalten:
 * - 'start' ohne userId/displayName → ignorieren (defensiv)
 * - 'start' mit identischen Werten zur bestehenden Entry (gleicher userId,
 *   gleicher displayName) → ts updaten, aber ansonsten Map-Referenz ist neu
 *   (damit Stale-Pruning später wirken kann)
 * - 'stop' ohne bestehenden Entry → no-op (alte Map zurück)
 * - 'stop' mit bestehendem Entry für ANDEREN userId → no-op (User A kann
 *   nicht den Lock von User B aufheben — Schutz vor Race Conditions)
 */
export function applyEditingBroadcast(
  map: EditingMap,
  msg: EditingBroadcast,
  now: number,
): EditingMap {
  const { stationId, action } = msg;
  if (!stationId) return map;

  if (action === 'start') {
    if (!msg.userId || !msg.displayName) return map;
    return {
      ...map,
      [stationId]: { userId: msg.userId, displayName: msg.displayName, ts: now },
    };
  }

  if (action === 'stop') {
    const existing = map[stationId];
    if (!existing) return map;
    // Defensive: Nur der ursprüngliche Editor darf seinen Lock aufheben.
    // Wenn msg.userId fehlt (Legacy-Sender ohne userId in stop), erlauben wir
    // den Stop — sonst würde stop nie wirken.
    if (msg.userId && existing.userId !== msg.userId) return map;
    const next = { ...map };
    delete next[stationId];
    return next;
  }

  return map;
}

/** Task-Pendant zu EditingBroadcast — verwendet taskId statt stationId. */
export interface TaskEditingBroadcast {
  taskId: string;
  action: 'start' | 'stop';
  userId?: string;
  displayName?: string;
}

/**
 * Wie applyEditingBroadcast, aber für Tasks (keyField = taskId).
 * Dieselbe Defensive-Logik: stop kann nur vom ursprünglichen Editor gesendet werden.
 */
export function applyTaskEditingBroadcast(
  map: EditingMap,
  msg: TaskEditingBroadcast,
  now: number,
): EditingMap {
  const { taskId, action } = msg;
  if (!taskId) return map;

  if (action === 'start') {
    if (!msg.userId || !msg.displayName) return map;
    return {
      ...map,
      [taskId]: { userId: msg.userId, displayName: msg.displayName, ts: now },
    };
  }

  if (action === 'stop') {
    const existing = map[taskId];
    if (!existing) return map;
    if (msg.userId && existing.userId !== msg.userId) return map;
    const next = { ...map };
    delete next[taskId];
    return next;
  }

  return map;
}

/**
 * Entfernt alle Einträge, die älter sind als `STALE_MS`.
 * Reine Funktion. Liefert die alte Referenz zurück, wenn nichts entfernt
 * werden muss (vermeidet unnötige React-Re-Renders).
 */
export function pruneStaleEditing(map: EditingMap, now: number): EditingMap {
  const cutoff = now - STALE_MS;
  let removedAny = false;
  const next: EditingMap = {};
  for (const [stationId, entry] of Object.entries(map)) {
    if (entry.ts >= cutoff) {
      next[stationId] = entry;
    } else {
      removedAny = true;
    }
  }
  return removedAny ? next : map;
}
