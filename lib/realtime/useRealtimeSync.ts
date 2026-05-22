import { useEffect, type MutableRefObject } from 'react';
import { supabase } from '@/lib/supabase';
import type { Plan, PlanStatus, Station } from '@/lib/types';
import { planningChannelNames } from './channelNames';

/**
 * Felder, die in Realtime-Payloads als "schwer" gelten und nur bei aktivem
 * Lageplan- oder Erklärungsseite-Tab geladen werden sollen — sonst entsteht
 * unnötiger Memory-/Netz-Cost auf dem Tabellen-Tab.
 */
type HeavyPlanFields = Pick<
  Plan,
  'backgroundImage' | 'masks' | 'logoOverlay' | 'labelOverlay' | 'explanationData'
>;

export interface UseRealtimeSyncOptions {
  /** Planning-ID — wird in Channel-Filter `id=eq.${planId}` und `planning_id=eq.${planId}` benutzt. */
  planId: string;
  /** Empfängt den nächsten Plan, wenn ein anderer Client `plannings` oder `stations` ändert. */
  onExternalUpdate: (plan: Plan) => void;
  /** Stets aktueller Snapshot des lokalen Plans. Ref, damit der Channel-Callback nicht stale liest. */
  latestPlanRef: MutableRefObject<Plan | null>;
  /**
   * Zeigt an, ob schwere Felder (background_image, masks, …) aus dem Realtime-Payload geladen
   * werden sollen. Ref statt boolean, damit der Channel-Callback frisches Tab-State sieht,
   * auch wenn der User mitten in der Subscription wechselt.
   */
  isOnHeavyTabRef: MutableRefObject<boolean>;
  /** Subscription überspringen wenn `false` (z. B. bevor Plan geladen ist). Default: `true`. */
  enabled?: boolean;
}

// ── Pure helpers (separat exportiert für Unit-Tests) ──────────────────────

/**
 * Wandelt eine Supabase-Postgres-Row aus der `stations`-Tabelle in den App-typ
 * `Station` um (snake_case → camelCase + Default für nullbares `impulses`).
 */
export function rowToStation(row: Record<string, unknown>): Station {
  return {
    id: row.id as string,
    number: row.number as string,
    name: row.name as string,
    description: row.description as string,
    material: row.material as string,
    instructions: row.instructions as string,
    impulses: (row.impulses as string[] | null | undefined) ?? [],
    setupBy: row.setup_by as string,
    conductedBy: row.conducted_by as string,
    x: row.x as number,
    y: row.y as number,
    targetX: row.target_x as number,
    targetY: row.target_y as number,
    isFilled: row.is_filled as boolean | undefined,
    colorVariant: row.color_variant as number | undefined,
    helpersRequired: (row.helpers_required as number | null | undefined) ?? 1,
  };
}

/**
 * Echo-Erkennung: vergleicht alle Felder einer Station feldweise.
 *
 * Hintergrund: Wenn der User selbst eine Station speichert, kommt das eigene
 * UPDATE über den Realtime-Channel zurück. Ohne Echo-Skip würde
 * `onExternalUpdate` getriggert und ein erneuter Save ausgelöst — ein Loop.
 *
 * `impulses` ist ein Array, deshalb JSON-Vergleich. Reicht hier, weil Reihenfolge
 * im Datenmodell stabil ist (kein Set).
 */
export function isStationEcho(existing: Station, incoming: Station): boolean {
  return (
    existing.number === incoming.number &&
    existing.name === incoming.name &&
    existing.description === incoming.description &&
    existing.material === incoming.material &&
    existing.instructions === incoming.instructions &&
    JSON.stringify(existing.impulses) === JSON.stringify(incoming.impulses) &&
    existing.setupBy === incoming.setupBy &&
    existing.conductedBy === incoming.conductedBy &&
    existing.x === incoming.x &&
    existing.y === incoming.y &&
    existing.targetX === incoming.targetX &&
    existing.targetY === incoming.targetY &&
    existing.isFilled === incoming.isFilled &&
    existing.colorVariant === incoming.colorVariant &&
    (existing.helpersRequired ?? 1) === (incoming.helpersRequired ?? 1)
  );
}

/**
 * Merget einen UPDATE-Payload aus der `plannings`-Tabelle in den aktuellen Plan.
 * Schwere Bildfelder werden nur übernommen, wenn `isOnHeavyTab` true ist —
 * sonst behalten wir die bestehenden Werte (oder bleiben undefined auf
 * leichten Tabs, was ok ist, weil sie dort nicht gerendert werden).
 */
export function mergeExternalPlanUpdate(
  current: Plan,
  row: Record<string, unknown>,
  isOnHeavyTab: boolean,
): Plan {
  const heavy: Partial<HeavyPlanFields> = isOnHeavyTab
    ? {
        backgroundImage: (row.background_image as string | undefined) ?? undefined,
        masks: (row.masks as Plan['masks']) ?? [],
        logoOverlay: (row.logo_overlay as Plan['logoOverlay']) ?? undefined,
        labelOverlay: (row.label_overlay as Plan['labelOverlay']) ?? undefined,
        explanationData: (row.explanation_data as Plan['explanationData']) ?? undefined,
      }
    : {};
  return {
    ...current,
    title: (row.title as string | undefined) ?? current.title,
    status: ((row.status as PlanStatus | undefined) ?? current.status) as PlanStatus,
    url: (row.url as string | undefined) ?? current.url,
    bgZoom: (row.bg_zoom as number | undefined) ?? current.bgZoom,
    sourceUrl: (row.source_url as string | undefined) ?? current.sourceUrl,
    updatedAt: (row.updated_at as string | undefined) ?? current.updatedAt,
    // version aus DB-Payload übernehmen: verhindert false-positive
    // VersionConflictError, wenn die DB-Version durch einen Trigger
    // (z.B. planning_tasks → plannings bump) erhöht wurde, ohne dass
    // ein anderer Client den Plan tatsächlich bearbeitet hat.
    version: (row.version as number | undefined) ?? current.version,
    ...heavy,
  };
}

/**
 * Wendet ein Stations-Realtime-Event auf den aktuellen Plan an.
 * Liefert den nächsten Plan ODER `null`, wenn das Event ignoriert werden soll
 * (Echo, unbekannte ID bei UPDATE, doppeltes INSERT, …).
 */
export function applyStationEvent(
  current: Plan,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: { newRow?: Record<string, unknown>; oldRow?: Record<string, unknown> },
): Plan | null {
  if (eventType === 'DELETE') {
    const deletedId = payload.oldRow?.id as string | undefined;
    if (!deletedId) return null;
    if (!current.stations.some(s => s.id === deletedId)) return null;
    return { ...current, stations: current.stations.filter(s => s.id !== deletedId) };
  }
  if (!payload.newRow) return null;
  const incoming = rowToStation(payload.newRow);
  const existing = current.stations.find(s => s.id === incoming.id);
  if (eventType === 'UPDATE') {
    if (!existing) return null;
    if (isStationEcho(existing, incoming)) return null;
    return { ...current, stations: current.stations.map(s => s.id === incoming.id ? incoming : s) };
  }
  // INSERT
  if (existing) return null;
  return { ...current, stations: [...current.stations, incoming] };
}

// ── React-Hook ────────────────────────────────────────────────────────────

/**
 * Abonniert den Supabase-Realtime-Channel `planning:${planId}:sync` und
 * registriert zwei postgres_changes-Listener (plannings UPDATE + stations *).
 *
 * Ruft `onExternalUpdate(nextPlan)` mit dem gemergten Plan auf, sobald ein anderer
 * Client etwas geändert hat. Echo-Skip + Lazy-Loading-Logik bleiben gegenüber
 * der ehemaligen Inline-Implementierung in `ErkiApp.tsx` 1:1 erhalten.
 *
 * Cleanup: der Channel wird bei Unmount oder `planId`-Wechsel via
 * `supabase.removeChannel` geschlossen — sonst Channel-Leak.
 */
export function useRealtimeSync(options: UseRealtimeSyncOptions): void {
  const { planId, onExternalUpdate, latestPlanRef, isOnHeavyTabRef, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    const channelNames = planningChannelNames(planId);

    // Beide postgres_changes-Listener auf EINEM Channel (planning:<id>:sync).
    // Channel-Naming via planningChannelNames; getrennt von Presence/Broadcast,
    // damit die drei Hooks (useRealtimeSync / usePresence / useBroadcast) sich
    // nicht denselben Singleton-Channel teilen — sonst .on()-after-.subscribe()
    // Race. plannings und stations dürfen aber denselben Channel nutzen, weil
    // beide hier aus einem Hook registriert werden — fluent vor .subscribe().
    //
    // Echo-Skip in applyStationEvent (kritisch — siehe Kommentar in isStationEcho).
    const channel = supabase
      .channel(channelNames.sync)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'plannings',
        filter: `id=eq.${planId}`,
      }, (payload) => {
        const current = latestPlanRef.current;
        if (!current) return;
        const row = payload.new as Record<string, unknown>;
        const next = mergeExternalPlanUpdate(current, row, isOnHeavyTabRef.current);
        onExternalUpdate(next);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'stations',
        filter: `planning_id=eq.${planId}`,
      }, (payload) => {
        const current = latestPlanRef.current;
        if (!current) return;
        const next = applyStationEvent(
          current,
          payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          {
            newRow: payload.new as Record<string, unknown> | undefined,
            oldRow: payload.old as Record<string, unknown> | undefined,
          },
        );
        if (next) onExternalUpdate(next);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // Refs (`latestPlanRef`, `isOnHeavyTabRef`) sind stabil und werden bewusst
    // nicht in die Deps aufgenommen — sie sollen das Re-Subscribe NICHT triggern.
    // `onExternalUpdate` ist im Caller idR ein neuer Closure pro Render; in der
    // Inline-Variante war auch nur `[plan.id]` Dep, deshalb hier identisch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, enabled]);
}
