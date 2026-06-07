/**
 * Pure Helpers für Presence-Indikator-UI.
 *
 * Werden von `MapView` und `StationsTable` genutzt, um aus dem Roh-`online`-Array
 * (potentiell mehrere Einträge pro userId, weil derselbe User in mehreren Tabs
 * offen sein kann) eine eindeutige User-Liste fürs Rendering abzuleiten.
 */

export interface PresenceUserLike {
  userId: string;
  displayName: string;
}

/**
 * Dedupliziert eine Presence-Liste auf einen Eintrag pro `userId`.
 * Reihenfolge stabil (erstes Vorkommen gewinnt). Reine Funktion.
 *
 * Hintergrund: Supabase-Presence kann denselben User mehrfach listen, wenn
 * er die Planung in mehreren Tabs offen hat. Für die UI wollen wir aber
 * nur einen Avatar pro Person zeigen.
 */
export function dedupeOnlineUsers<T extends PresenceUserLike>(entries: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const e of entries) {
    if (!e.userId || seen.has(e.userId)) continue;
    seen.add(e.userId);
    result.push(e);
  }
  return result;
}

/**
 * Liefert die Initialen eines Anzeigenamens (max. 2 Zeichen, uppercase).
 * Robust gegen leere Strings, Sonderzeichen und Mehrwort-Namen.
 *
 * "Anna Schmidt" → "AS"
 * "anna" → "A"
 * "" → "?"
 * "  " → "?"
 */
export function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase() || '?';
}

/**
 * Deterministische Farbe für einen User (basiert auf userId-Hash).
 * Wird für die Avatar-Bubble verwendet — gleicher User bekommt immer dieselbe
 * Farbe, ohne dass wir Server-State brauchen.
 *
 * Palette passt zur App-Aesthetik (Türkis, Lila, Mint, Pink, Orange, Hellblau).
 */
const PRESENCE_COLORS = [
  '#6bbfd4', // Türkis
  '#9b8ec4', // Lila
  '#7bc9a0', // Mint
  '#e07aaa', // Pink
  '#e8a86b', // Orange
  '#8eb4d4', // Hellblau
];

export function getPresenceColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PRESENCE_COLORS.length;
  return PRESENCE_COLORS[idx];
}
