import { supabase } from './supabase';
import { Plan, PlanStatus, Station } from './types';

// ── Row converters ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPlan(row: any, stations: Station[]): Plan {
  return {
    id: row.id,
    title: row.title,
    status: row.status as PlanStatus,
    url: row.url ?? undefined,
    backgroundImage: row.background_image ?? undefined,
    masks: row.masks ?? [],
    stations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStation(row: any): Station {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    description: row.description,
    material: row.material,
    instructions: row.instructions,
    impulses: row.impulses ?? [],
    setupBy: row.setup_by,
    conductedBy: row.conducted_by,
    x: row.x,
    y: row.y,
    targetX: row.target_x,
    targetY: row.target_y,
    isFilled: row.is_filled,
    colorVariant: row.color_variant,
  };
}

function stationToRow(station: Station, planningId: string, sortOrder: number) {
  return {
    id: station.id,
    planning_id: planningId,
    number: station.number,
    name: station.name,
    description: station.description,
    material: station.material,
    instructions: station.instructions,
    impulses: station.impulses,
    setup_by: station.setupBy,
    conducted_by: station.conductedBy,
    x: station.x,
    y: station.y,
    target_x: station.targetX,
    target_y: station.targetY,
    is_filled: station.isFilled ?? false,
    color_variant: station.colorVariant ?? 0,
    sort_order: sortOrder,
  };
}

// ── Public API ──────────────────────────────────────────────────

export async function loadPlannings(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plannings')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => rowToPlan(row, []));
}

export async function loadPlanning(id: string): Promise<Plan> {
  const [{ data: planRow, error: planError }, { data: stationRows, error: stationError }] =
    await Promise.all([
      supabase.from('plannings').select('*').eq('id', id).single(),
      supabase.from('stations').select('*').eq('planning_id', id).order('sort_order'),
    ]);
  if (planError) throw planError;
  if (stationError) throw stationError;
  const stations = (stationRows ?? []).map(rowToStation);
  return rowToPlan(planRow, stations);
}

export async function createPlanning(title: string, userId: string): Promise<Plan> {
  const { data, error } = await supabase
    .from('plannings')
    .insert({ title, user_id: userId, status: 'draft' })
    .select()
    .single();
  if (error) throw error;
  return rowToPlan(data, []);
}

export async function savePlanning(plan: Plan): Promise<void> {
  console.log('[savePlanning] starte für:', plan.id, '|', plan.title, '| status:', plan.status, '| Stationen:', plan.stations.length);

  const { error: planError } = await supabase
    .from('plannings')
    .update({
      title: plan.title,
      status: plan.status,
      url: plan.url ?? null,
      background_image: plan.backgroundImage ?? null,
      masks: plan.masks ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id);
  if (planError) {
    console.error('[savePlanning] plannings UPDATE Fehler:', planError);
    throw planError;
  }
  console.log('[savePlanning] plannings UPDATE ok');

  // Replace stations: delete all, then re-insert
  const { error: deleteError } = await supabase
    .from('stations')
    .delete()
    .eq('planning_id', plan.id);
  if (deleteError) {
    console.error('[savePlanning] stations DELETE Fehler:', deleteError);
    throw deleteError;
  }
  console.log('[savePlanning] stations DELETE ok');

  if (plan.stations.length > 0) {
    // Sicherstellen dass alle IDs gültige UUIDs sind (alte .rki-Importe können Non-UUIDs enthalten)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const stations = plan.stations.map(s => ({
      ...s,
      id: UUID_RE.test(s.id) ? s.id : crypto.randomUUID(),
    }));
    const rows = stations.map((s, i) => stationToRow(s, plan.id, i));
    const { error: insertError } = await supabase.from('stations').insert(rows);
    if (insertError) {
      console.error('[savePlanning] stations INSERT Fehler:', insertError);
      throw insertError;
    }
    console.log('[savePlanning] stations INSERT ok (' + rows.length + ' Zeilen)');
  }

  console.log('[savePlanning] komplett abgeschlossen');
}

export async function deletePlanning(id: string): Promise<void> {
  const { error } = await supabase.from('plannings').delete().eq('id', id);
  if (error) throw error;
}

export async function updatePlanningStatus(id: string, status: PlanStatus): Promise<void> {
  const { error } = await supabase
    .from('plannings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Import a .rki array of plans, creating new DB entries for each. */
export async function importPlannings(plans: Plan[], userId: string): Promise<void> {
  for (const plan of plans) {
    const { data, error } = await supabase
      .from('plannings')
      .insert({
        title: plan.title,
        user_id: userId,
        status: plan.status ?? 'draft',
        url: plan.url ?? null,
        background_image: plan.backgroundImage ?? null,
        masks: plan.masks ?? [],
      })
      .select()
      .single();
    if (error) throw error;

    if (plan.stations.length > 0) {
      // Neue UUIDs vergeben – .rki-Dateien können alte Non-UUID-IDs enthalten
      const stationsWithUUIDs = plan.stations.map(s => ({ ...s, id: crypto.randomUUID() }));
      const rows = stationsWithUUIDs.map((s, i) => stationToRow(s, data.id, i));
      const { error: stationsError } = await supabase.from('stations').insert(rows);
      if (stationsError) throw stationsError;
    }
  }
}
