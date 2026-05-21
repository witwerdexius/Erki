/**
 * Naming-Konvention für Supabase Realtime Channels pro Planung.
 *
 * ⚠️ Drei separate Channels pro Planung — bewusst NICHT zusammengeführt.
 * Hintergrund: Supabase gibt für identische Channel-Namen dieselbe Singleton-
 * Instanz zurück. Sobald ein Hook .subscribe() aufruft, schlägt jedes spätere
 * .on(...) auf denselben Channel mit "cannot add callbacks after subscribe()"
 * fehl. Ein Channel pro Concern (sync / presence / broadcast) löst das, ohne
 * eine Channel-Registry zu brauchen.
 *
 * Cross-Client Konsistenz: Alle Clients auf derselben Planung MÜSSEN denselben
 * Namen pro Concern nutzen, sonst sehen sie sich gegenseitig nicht (Presence-
 * State und Broadcasts sind channel-lokal).
 *
 * Connection-Budget: Bei 200 concurrent Realtime-Verbindungen (Free-Tier) und
 * 3 Channels pro aktive Planung sind ~66 simultane Editoren möglich — für
 * den Anwendungsfall (Vorbereitungstreffen einer Kirchengemeinde) reichlich.
 */
export interface PlanningChannelNames {
  /** Postgres CDC für plannings + stations updates (gemerged auf 1 Channel). */
  readonly sync: string;
  /** Presence: wer ist gerade online auf dieser Planung. */
  readonly presence: string;
  /** Broadcast: kurzlebige Editor-Hints ("Anna bearbeitet Station X"). */
  readonly broadcast: string;
}

export function planningChannelNames(planId: string): PlanningChannelNames {
  return {
    sync: `planning:${planId}:sync`,
    presence: `planning:${planId}:presence`,
    broadcast: `planning:${planId}:broadcast`,
  };
}
