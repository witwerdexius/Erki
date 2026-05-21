import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Eintrag aus dem Presence-State eines Channels.
 * Supabase fügt jedem getrackten Payload eine `presence_ref` hinzu.
 */
export type PresenceEntry<T> = T & { presence_ref: string };

export interface UsePresenceOptions<T> {
  /** Channel-Name, z.B. `planning:${planId}:presence`. */
  channelName: string;
  /** Eigener Tracking-Payload, z.B. `{ userId, name, avatar }`. */
  payload: T;
  /** Wenn `false`, wird kein Channel geöffnet (z.B. bevor Auth aufgelöst ist). Default: `true`. */
  enabled?: boolean;
}

export interface UsePresenceResult<T> {
  /** Aktuell anwesende Clients (eigener User inklusive). */
  online: PresenceEntry<T>[];
  /** `true` sobald der Channel `SUBSCRIBED` ist. */
  isConnected: boolean;
}

/**
 * Wandelt den verschachtelten Presence-State (`{ key: Entry[] }`) in eine
 * flache Liste aller Presence-Einträge um. Reine Funktion — separat exportiert
 * für Unit-Tests.
 */
export function flattenPresenceState<T>(
  state: Record<string, PresenceEntry<T>[]>
): PresenceEntry<T>[] {
  const result: PresenceEntry<T>[] = [];
  for (const key of Object.keys(state)) {
    const entries = state[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      result.push(entry);
    }
  }
  return result;
}

/**
 * Tracked, welche Clients gerade auf einem Supabase-Realtime-Channel online sind.
 *
 * Wrappt `channel.on('presence', { event: 'sync' }, ...)` + `channel.track(payload)`.
 * Re-tracked bei Änderungen an `payload` (Vergleich via `JSON.stringify`, da
 * Objekt-Identität in React zu instabil wäre).
 *
 * Wann nutzen: Anzeige von "wer ist online" auf einer geteilten Planung.
 *
 * Trade-off: Dieser Hook öffnet einen eigenen Channel — wenn `useBroadcast` mit
 * dem gleichen `channelName` läuft, entstehen zwei WebSocket-Subscriptions.
 * Supabase toleriert das. Falls die Anzahl gleichzeitiger Channels später zum
 * Problem wird, kann eine kleine Channel-Registry beide Hooks an denselben
 * Channel binden.
 */
export function usePresence<T extends Record<string, unknown>>(
  options: UsePresenceOptions<T>
): UsePresenceResult<T> {
  const { channelName, payload, enabled = true } = options;
  const [online, setOnline] = useState<PresenceEntry<T>[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // JSON-Stringify des Payloads als Dep — pragmatisch, weil sich Objekt-Identität
  // bei jedem Render ändert. Akzeptabel solange Payloads serialisierbar bleiben.
  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(channelName)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceEntry<T>>();
        setOnline(flattenPresenceState<T>(state as Record<string, PresenceEntry<T>[]>));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          // Eigenen Payload melden, damit andere Clients uns sehen.
          void channel.track(payload);
        } else {
          setIsConnected(false);
        }
      });

    return () => {
      // State zurücksetzen, wenn der Channel geschlossen wird (z.B. Channel-Wechsel
      // oder enabled→false). Ohne das würden wir veraltete Online-User zeigen.
      setOnline([]);
      setIsConnected(false);
      void supabase.removeChannel(channel);
    };
    // payloadKey statt payload, weil wir auf Wert-, nicht Identitäts-Änderungen reagieren wollen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled, payloadKey]);

  // Wenn der Hook deaktiviert ist, immer leere Werte exposen — unabhängig vom State.
  if (!enabled) {
    return { online: [], isConnected: false };
  }
  return { online, isConnected };
}
