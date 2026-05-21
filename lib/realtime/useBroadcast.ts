import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface UseBroadcastOptions<T> {
  /** Channel-Name, z.B. `planning:${planId}:broadcast`. */
  channelName: string;
  /** Event-Name, z.B. `'editing'` oder `'cursor'`. */
  event: string;
  /** Handler für eingehende Broadcast-Nachrichten. */
  onMessage?: (payload: T) => void;
  /** Wenn `false`, wird kein Channel geöffnet. Default: `true`. */
  enabled?: boolean;
}

export interface UseBroadcastResult<T> {
  /** Sendet einen Payload an alle anderen Clients auf dem Channel. */
  send: (payload: T) => Promise<void>;
  /** `true` sobald der Channel `SUBSCRIBED` ist. */
  isConnected: boolean;
}

/**
 * Pub/Sub-Nachrichten ohne DB-Roundtrip via Supabase Realtime Broadcast.
 *
 * Wrappt `channel.on('broadcast', { event }, handler)` und exposed eine stabile
 * `send`-Funktion, die `channel.send({ type: 'broadcast', event, payload })` aufruft.
 *
 * Wann nutzen: ephemere Signale wie "Anna editiert gerade Station 3" oder
 * Cursor-Positionen, die nicht in die DB sollen.
 *
 * Trade-off: Dieser Hook öffnet einen eigenen Channel — wenn `usePresence` mit
 * dem gleichen `channelName` läuft, entstehen zwei WebSocket-Subscriptions.
 * Supabase toleriert das. Falls die Anzahl gleichzeitiger Channels später zum
 * Problem wird, kann eine kleine Channel-Registry beide Hooks an denselben
 * Channel binden.
 */
export function useBroadcast<T>(
  options: UseBroadcastOptions<T>
): UseBroadcastResult<T> {
  const { channelName, event, onMessage, enabled = true } = options;

  // Ref auf den Channel, damit die `send`-Closure immer auf den aktuellen Channel zeigt
  // (und stabil bleibt — `useCallback` bekommt nur den Ref als Dep, nicht den Channel selbst).
  type RealtimeChannelLike = ReturnType<typeof supabase.channel>;
  const channelRef = useRef<RealtimeChannelLike | null>(null);

  // Ref auf den onMessage-Callback, damit Handler-Identitätswechsel keinen
  // Re-Subscribe auslösen.
  const onMessageRef = useRef<UseBroadcastOptions<T>['onMessage']>(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    channel.on('broadcast', { event }, (message) => {
      const handler = onMessageRef.current;
      if (!handler) return;
      // Supabase typisiert das Wrapper-Objekt als `{ payload?: any }`; wir erwarten T.
      const payload = (message as { payload?: T }).payload;
      if (payload === undefined) return;
      handler(payload);
    });

    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED');
    });

    return () => {
      channelRef.current = null;
      setIsConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [channelName, event, enabled]);

  const send = useCallback(
    async (payload: T): Promise<void> => {
      const channel = channelRef.current;
      if (!channel) return;
      await channel.send({ type: 'broadcast', event, payload });
    },
    [event]
  );

  // Wenn der Hook deaktiviert ist, immer disconnected exposen — `send` bleibt eine
  // No-Op (channelRef.current === null), ist aber Typ-stabil aufrufbar.
  if (!enabled) {
    return { send, isConnected: false };
  }
  return { send, isConnected };
}
