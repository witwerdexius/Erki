import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { PlanningTask, TaskSection } from '@/lib/types';

function rowToTask(row: Record<string, unknown>): PlanningTask {
  return {
    id: row.id as string,
    planningId: row.planning_id as string,
    section: row.section as TaskSection,
    name: row.name as string,
    helpersRequired: row.helpers_required as number,
    sortOrder: row.sort_order as number,
    volunteers: (row.volunteers as string[] | null) ?? [],
    time: (row.time as string | null) ?? undefined,
    createdAt: row.created_at as string | undefined,
  };
}

export interface UsePlanningTasksSyncOptions {
  planId: string;
  onInsert: (task: PlanningTask) => void;
  onUpdate: (task: PlanningTask) => void;
  onDelete: (taskId: string) => void;
  enabled?: boolean;
}

/**
 * Abonniert Realtime-Events auf `planning_tasks` für eine Planung.
 * INSERT → onInsert, UPDATE → onUpdate, DELETE → onDelete.
 *
 * Separater Channel `planning:<id>:tasks`, damit kein Konflikt mit dem
 * bestehenden sync-Channel (postgres_changes + subscribe race).
 */
export function usePlanningTasksSync(options: UsePlanningTasksSyncOptions): void {
  const { planId, onInsert, onUpdate, onDelete, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`planning:${planId}:tasks`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'planning_tasks',
        filter: `planning_id=eq.${planId}`,
      }, (payload) => {
        onInsert(rowToTask(payload.new as Record<string, unknown>));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'planning_tasks',
        filter: `planning_id=eq.${planId}`,
      }, (payload) => {
        onUpdate(rowToTask(payload.new as Record<string, unknown>));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'planning_tasks',
        filter: `planning_id=eq.${planId}`,
      }, (payload) => {
        const deletedId = (payload.old as Record<string, unknown>).id as string | undefined;
        if (deletedId) onDelete(deletedId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // Callbacks sind absichtlich nicht in den Deps — sie ändern sich bei jedem
    // Render, würden aber ein Re-Subscribe auf den Channel triggern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, enabled]);
}
