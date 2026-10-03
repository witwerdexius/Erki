import { supabase } from './supabase';
import { loadPlanningFull, loadPlanningTasks } from './db';
import type { Plan, PlanningTask } from './types';

/**
 * Format-Version der .rki-Datei.
 * 1 = alter Export (nur Plan-State, je nach Tab ohne Bild/Masken, ohne Aufgaben)
 * 2 = vollständig: alle Planungsfelder aus der DB inkl. PDF-Vorlage + Helferaufgaben
 */
export const BACKUP_FORMAT = 2;

export type BackupPlan = Plan & {
  backupFormat: number;
  tasks: PlanningTask[];
};

/** Lädt die Planungen vollständig aus der DB (unabhängig vom UI-State). */
export async function buildBackup(planIds: string[]): Promise<BackupPlan[]> {
  const result: BackupPlan[] = [];
  for (const id of planIds) {
    const [full, tasks, { data: extra, error }] = await Promise.all([
      loadPlanningFull(id),
      loadPlanningTasks(id),
      supabase.from('plannings').select('nachdenk_template').eq('id', id).single(),
    ]);
    if (error) throw error;
    result.push({
      ...full,
      nachdenk_template: (extra?.nachdenk_template as string | null) ?? undefined,
      tasks,
      backupFormat: BACKUP_FORMAT,
    });
  }
  return result;
}

export function downloadBackup(plans: BackupPlan[], filename: string): void {
  const blob = new Blob([JSON.stringify(plans)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Prüft, ob eine Backup-Datei vollständig ist (Format 2) oder ein alter Export. */
export function isCompleteBackup(plan: unknown): boolean {
  return typeof plan === 'object' && plan !== null && (plan as { backupFormat?: number }).backupFormat === BACKUP_FORMAT;
}
