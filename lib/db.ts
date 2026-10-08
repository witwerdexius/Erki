import { supabase } from './supabase';
import { Plan, PlanStatus, Station, LogoOverlay, LabelOverlay, StationTemplate, TaskTemplate, Profile, Community, UserRole, PlanningTask, TaskSection } from './types';

// ── Errors ──────────────────────────────────────────────────────

/**
 * Wird von savePlanning() geworfen, wenn die DB-Zeile in der Zwischenzeit
 * von einem anderen Client geändert wurde (Optimistic-Locking-Konflikt).
 *
 * Der Caller sollte den User informieren, die aktuelle Planung neu laden
 * (loadPlanningFull) und ggf. den Save erneut auslösen.
 */
export class VersionConflictError extends Error {
  constructor(public readonly planId: string, public readonly expectedVersion: number) {
    super(`Planung ${planId} wurde in der Zwischenzeit geändert (erwartete Version ${expectedVersion}).`);
    this.name = 'VersionConflictError';
  }
}

// ── Row converters ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPlan(row: any, stations: Station[]): Plan {
  return {
    id: row.id,
    title: row.title,
    status: row.status as PlanStatus,
    url: row.url ?? undefined,
    backgroundImage: row.background_image ?? undefined,
    masks: row.masks ?? [],
    areas: Array.isArray(row.areas) ? row.areas : [],
    logoOverlay: row.logo_overlay ?? undefined,
    labelOverlay: row.label_overlay ?? undefined,
    bgZoom: row.bg_zoom ?? 1,
    explanationData: row.explanation_data ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    version: typeof row.version === 'number' ? row.version : undefined,
    taskSections: Array.isArray(row.task_sections) ? row.task_sections : undefined,
    stations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToStation(row: any): Station {
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
    helpersRequired: row.helpers_required ?? 1,
    time: row.time ?? undefined,
    areaId: row.area_id ?? null,
  };
}

export function stationToRow(station: Station, planningId: string, sortOrder: number) {
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
    helpers_required: station.helpersRequired ?? 1,
    area_id: station.areaId ?? null,
  };
}

export type StationRow = ReturnType<typeof stationToRow>;

export interface StationChanges {
  /** Neue Stationen (lokal angelegt, nicht in previousPlan) → INSERT. */
  inserts: StationRow[];
  /** Geänderte Stationen → UPDATE nur der geänderten Spalten. */
  updates: { id: string; patch: Partial<StationRow> }[];
  /** Lokal gelöschte Stationen (in previousPlan, nicht mehr in next) → DELETE. */
  deleteIds: string[];
}

/**
 * Field-Level-Diff für Stationen (analog zu diffPlanRow).
 *
 * Schreibt nur, was der lokale Client seit previousPlan selbst geändert hat.
 * Stationen, die ein anderer Client (oder der MCP-Server) parallel angelegt
 * oder geändert hat und die lokal noch nicht angekommen sind, bleiben so
 * unberührt: Sie werden weder überschrieben noch gelöscht.
 */
export function diffStations(prev: Station[], next: Station[], planningId: string): StationChanges {
  const prevById = new Map(prev.map((s, i) => [s.id, { s, i }]));
  const nextIds = new Set(next.map(s => s.id));
  const inserts: StationRow[] = [];
  const updates: { id: string; patch: Partial<StationRow> }[] = [];

  next.forEach((s, i) => {
    const before = prevById.get(s.id);
    const rowNext = stationToRow(s, planningId, i);
    if (!before) {
      inserts.push(rowNext);
      return;
    }
    const rowPrev = stationToRow(before.s, planningId, before.i);
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(rowNext) as (keyof StationRow)[]) {
      if (key === 'id' || key === 'planning_id') continue;
      if (JSON.stringify(rowPrev[key]) !== JSON.stringify(rowNext[key])) patch[key] = rowNext[key];
    }
    if (Object.keys(patch).length > 0) updates.push({ id: s.id, patch: patch as Partial<StationRow> });
  });

  const deleteIds = prev.map(s => s.id).filter(id => !nextIds.has(id));
  return { inserts, updates, deleteIds };
}

// ── Public API ──────────────────────────────────────────────────

export async function loadPlannings(): Promise<Plan[]> {
  // Nur Listenfelder laden — background_image/explanation_data/masks etc. werden hier nicht benötigt
  const { data, error } = await supabase
    .from('plannings')
    .select('id, title, status, updated_at, created_at, stations(count)')
    .order('updated_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map(row => {
    const countArr = row.stations as unknown as { count: number }[] | null;
    return {
      id: row.id,
      title: row.title,
      status: row.status as PlanStatus,
      stations: [],
      stationCount: countArr?.[0]?.count ?? 0,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    };
  });
}

// Loads only lightweight metadata — no background_image, explanation_data, masks, logo_overlay, label_overlay.
// Use for initial open; switch to loadPlanningFull when the map or explanation tab is needed.
export async function loadPlanningMeta(id: string): Promise<Plan> {
  const [{ data: planRow, error: planError }, { data: stationRows, error: stationError }] =
    await Promise.all([
      supabase
        .from('plannings')
        .select('id, title, status, url, bg_zoom, source_url, version, task_sections, areas, created_at, updated_at')
        .eq('id', id)
        .single(),
      supabase.from('stations').select('*').eq('planning_id', id).order('sort_order'),
    ]);
  if (planError) throw planError;
  if (stationError) throw stationError;
  const stations = (stationRows ?? []).map(rowToStation);
  return rowToPlan(planRow, stations);
}

// Loads all fields including background_image, explanation_data, masks, logo_overlay, label_overlay.
export async function loadPlanningFull(id: string): Promise<Plan> {
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

/**
 * Pure helper: berechnet, welche plannings-Spalten zwischen prev und next
 * geändert wurden. Liefert die Patch-Map mit snake_case-Keys.
 *
 * Komplexe Felder (masks-Array, logo_overlay-Objekt, label_overlay-Objekt,
 * explanation_data) werden via JSON.stringify shallow verglichen — pragmatisch,
 * nicht bulletproof: bei unterschiedlicher Key-Reihenfolge sind false-positives
 * möglich, das ist akzeptabel (überflüssiger DB-Write < verlorene Felder).
 */
export function diffPlanRow(prev: Plan, next: Plan): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (prev.title !== next.title) patch.title = next.title;
  if (prev.status !== next.status) patch.status = next.status;
  if ((prev.url ?? null) !== (next.url ?? null)) patch.url = next.url ?? null;
  if ((prev.backgroundImage ?? null) !== (next.backgroundImage ?? null)) {
    patch.background_image = next.backgroundImage ?? null;
  }
  if (JSON.stringify(prev.masks ?? []) !== JSON.stringify(next.masks ?? [])) {
    patch.masks = next.masks ?? [];
  }
  if (JSON.stringify(prev.areas ?? []) !== JSON.stringify(next.areas ?? [])) {
    patch.areas = next.areas ?? [];
  }
  if (JSON.stringify(prev.logoOverlay ?? null) !== JSON.stringify(next.logoOverlay ?? null)) {
    patch.logo_overlay = next.logoOverlay ?? null;
  }
  if (JSON.stringify(prev.labelOverlay ?? null) !== JSON.stringify(next.labelOverlay ?? null)) {
    patch.label_overlay = next.labelOverlay ?? null;
  }
  if ((prev.bgZoom ?? 1) !== (next.bgZoom ?? 1)) patch.bg_zoom = next.bgZoom ?? 1;
  if ((prev.sourceUrl ?? null) !== (next.sourceUrl ?? null)) patch.source_url = next.sourceUrl ?? null;
  if (JSON.stringify(prev.explanationData ?? null) !== JSON.stringify(next.explanationData ?? null)) {
    patch.explanation_data = next.explanationData ?? null;
  }
  if (JSON.stringify(prev.taskSections ?? null) !== JSON.stringify(next.taskSections ?? null)) {
    patch.task_sections = next.taskSections ?? null;
  }
  return patch;
}

/**
 * Build the plannings UPDATE payload.
 *
 * Mit previousPlan: nur geänderte Felder ins Patch-Objekt (Field-Level Diff,
 * vermeidet, dass parallel editierte Spalten überschrieben werden). Ohne
 * previousPlan: Vollupdate aller Spalten (Backward-Compat). `updated_at` ist
 * immer enthalten.
 */
function buildPlanningUpdatePayload(plan: Plan, previousPlan: Plan | undefined): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  if (previousPlan) {
    const patch = diffPlanRow(previousPlan, plan);
    patch.updated_at = nowIso;
    return patch;
  }
  // Backward-Compat: Vollupdate wie zuvor
  return {
    title: plan.title,
    status: plan.status,
    url: plan.url ?? null,
    background_image: plan.backgroundImage ?? null,
    masks: plan.masks ?? [],
    areas: plan.areas ?? [],
    logo_overlay: plan.logoOverlay ?? null,
    label_overlay: plan.labelOverlay ?? null,
    bg_zoom: plan.bgZoom ?? 1,
    source_url: plan.sourceUrl ?? null,
    explanation_data: plan.explanationData ?? null,
    task_sections: plan.taskSections ?? null,
    updated_at: nowIso,
  };
}

export async function savePlanning(plan: Plan, previousPlan?: Plan): Promise<number | null> {
  if (!plan || !plan.id) return null;
  console.log('[savePlanning] starte für:', plan.id, '|', plan.title, '| status:', plan.status, '| Stationen:', plan.stations.length);

  // Optimistic Locking: wenn plan.version gesetzt, wird die UPDATE-WHERE-
  // Klausel auf diese Version eingegrenzt. Wenn die DB-Zeile inzwischen
  // eine höhere Version hat (Konkurrent hat geschrieben), matcht der UPDATE
  // keine Zeile und wir werfen VersionConflictError.
  const expectedVersion: number | null = typeof plan.version === 'number' ? plan.version : null;

  // Sicherstellen dass alle IDs gültige UUIDs sind (alte .rki-Importe können Non-UUIDs enthalten)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const stations = plan.stations.map(s => ({
    ...s,
    id: UUID_RE.test(s.id) ? s.id : crypto.randomUUID(),
  }));

  // plannings UPDATE: bei previousPlan nur Diff-Felder (verhindert Überschreiben
  // parallel editierter Spalten), sonst Vollupdate (Backward-Compat).
  const updatePayload = buildPlanningUpdatePayload(plan, previousPlan);
  let planUpdateBuilder = supabase
    .from('plannings')
    .update(updatePayload)
    .eq('id', plan.id);
  if (expectedVersion !== null) {
    planUpdateBuilder = planUpdateBuilder.eq('version', expectedVersion);
  }
  // .select('id,version') liefert nach dem UPDATE die neue Version zurück (die
  // DB-Trigger bump_plannings_version() inkrementiert sie), damit der Client
  // immer gegen die aktuelle Version speichert und keinen False-Positive
  // VersionConflictError auslöst.
  const { data: planUpdateData, error: planError } = await planUpdateBuilder.select('id,version');
  if (planError) {
    console.error('[savePlanning] plannings UPDATE Fehler:', planError);
    console.error('[savePlanning] plannings UPDATE Fehler detail:', JSON.stringify(planError));
    throw planError;
  }
  // Wenn expectedVersion gesetzt war und kein Row matcht → Konflikt.
  // Geprüft BEVOR Stationen geschrieben werden, damit ein veralteter Client nichts anfasst.
  if (expectedVersion !== null && Array.isArray(planUpdateData) && planUpdateData.length === 0) {
    console.warn('[savePlanning] VersionConflictError: erwartete Version', expectedVersion, 'für', plan.id);
    throw new VersionConflictError(plan.id, expectedVersion);
  }
  const newVersion: number | null =
    Array.isArray(planUpdateData) && planUpdateData.length > 0
      ? (planUpdateData[0] as { version: number }).version
      : null;

  if (previousPlan) {
    // Field-Level-Diff: nur eigene Änderungen schreiben. Stationen, die nur in der
    // DB existieren (z. B. parallel per Realtime/MCP angelegt), werden NICHT gelöscht,
    // und unveränderte Stationen werden nicht mit lokalem (evtl. veraltetem) Stand überschrieben.
    const { inserts, updates, deleteIds } = diffStations(previousPlan.stations, stations, plan.id);
    const validDeleteIds = deleteIds.filter(id => UUID_RE.test(id));

    if (inserts.length > 0) {
      const { error } = await supabase.from('stations').upsert(inserts, { onConflict: 'id' });
      if (error) {
        console.error('[savePlanning] stations INSERT Fehler:', error);
        throw error;
      }
    }
    const updateResults = await Promise.all(
      updates.map(u => supabase.from('stations').update(u.patch).eq('id', u.id)),
    );
    const updateError = updateResults.find(r => r.error)?.error;
    if (updateError) {
      console.error('[savePlanning] stations UPDATE Fehler:', updateError);
      throw updateError;
    }
    if (validDeleteIds.length > 0) {
      const { error } = await supabase.from('stations').delete().in('id', validDeleteIds);
      if (error) {
        console.error('[savePlanning] stations DELETE Fehler:', error);
        throw error;
      }
    }
    console.log('[savePlanning] Stationen-Diff:', inserts.length, 'neu,', updates.length, 'geändert,', validDeleteIds.length, 'gelöscht | neue Version:', newVersion);
  } else {
    // Backward-Compat ohne Baseline: alle Stationen upserten, in der DB fehlende löschen.
    const { data: existingRows, error: fetchError } = await supabase
      .from('stations')
      .select('id')
      .eq('planning_id', plan.id);
    if (fetchError) {
      console.error('[savePlanning] stations ID-Fetch Fehler:', fetchError);
      throw fetchError;
    }
    const newIds = new Set(stations.map(s => s.id));
    const idsToDelete = (existingRows ?? [])
      .map((r: { id: string }) => r.id)
      .filter(id => !newIds.has(id));
    const rows = stations.map((s, i) => stationToRow(s, plan.id, i));
    if (rows.length > 0) {
      const { error } = await supabase.from('stations').upsert(rows, { onConflict: 'id' });
      if (error) {
        console.error('[savePlanning] stations UPSERT Fehler:', error);
        throw error;
      }
    }
    if (idsToDelete.length > 0) {
      const { error } = await supabase.from('stations').delete().in('id', idsToDelete);
      if (error) {
        console.error('[savePlanning] stations DELETE Fehler:', error);
        throw error;
      }
    }
    console.log('[savePlanning] Vollspeicherung ohne Baseline:', rows.length, 'Stationen | neue Version:', newVersion);
  }

  console.log('[savePlanning] komplett abgeschlossen');
  return newVersion;
}

export async function deletePlanning(id: string): Promise<void> {
  const { error } = await supabase.from('plannings').delete().eq('id', id);
  if (error) throw error;
}

export async function updatePlanningStatus(id: string, status: PlanStatus): Promise<number | null> {
  const { data, error } = await supabase
    .from('plannings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,version');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0
    ? (data[0] as { version: number }).version
    : null;
}

/**
 * Import a .rki array of plans, creating new DB entries for each.
 *
 * Übernimmt alle Planungsfelder, Stationen und (ab Backup-Format 2) die
 * Helferaufgaben. Schlägt ein Teilschritt fehl, wird die halb angelegte
 * Planung wieder entfernt, damit keine unvollständigen Kopien zurückbleiben.
 */
export async function importPlannings(
  plans: (Plan & { tasks?: PlanningTask[] })[],
  userId: string,
): Promise<void> {
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
        areas: plan.areas ?? [],
        logo_overlay: plan.logoOverlay ?? null,
        label_overlay: plan.labelOverlay ?? null,
        bg_zoom: plan.bgZoom ?? 1,
        source_url: plan.sourceUrl ?? null,
        explanation_data: plan.explanationData ?? null,
        nachdenk_template: plan.nachdenk_template ?? null,
        ...(plan.taskSections ? { task_sections: plan.taskSections } : {}),
      })
      .select()
      .single();
    if (error) throw error;

    try {
      if (plan.stations.length > 0) {
        // Neue UUIDs vergeben – .rki-Dateien können alte Non-UUID-IDs enthalten
        const stationsWithUUIDs = plan.stations.map(s => ({ ...s, id: crypto.randomUUID() }));
        const rows = stationsWithUUIDs.map((s, i) => stationToRow(s, data.id, i));
        const { error: stationsError } = await supabase.from('stations').insert(rows);
        if (stationsError) throw stationsError;
      }

      if (Array.isArray(plan.tasks) && plan.tasks.length > 0) {
        const taskRows = plan.tasks.map(t => ({
          planning_id: data.id,
          section: t.section,
          name: t.name,
          helpers_required: t.helpersRequired ?? 1,
          sort_order: t.sortOrder ?? 0,
          volunteers: t.volunteers ?? [],
          time: t.time ?? null,
        }));
        const { error: tasksError } = await supabase.from('planning_tasks').insert(taskRows);
        if (tasksError) throw tasksError;
      }
    } catch (e) {
      // Aufräumen: halb importierte Planung entfernen
      await supabase.from('planning_tasks').delete().eq('planning_id', data.id);
      await supabase.from('stations').delete().eq('planning_id', data.id);
      await supabase.from('plannings').delete().eq('id', data.id);
      throw e;
    }
  }
}

// ── Templates ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToTemplate(row: any): StationTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    material: row.material,
    instructions: row.instructions,
    impulses: row.impulses ?? [],
    setupBy: row.setup_by,
    conductedBy: row.conducted_by,
    createdAt: row.created_at,
  };
}

export async function loadTemplates(): Promise<StationTemplate[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(rowToTemplate);
}

export async function createTemplate(
  t: Omit<StationTemplate, 'id' | 'createdAt'>,
  userId: string,
): Promise<StationTemplate> {
  const { data, error } = await supabase
    .from('templates')
    .insert({
      user_id: userId,
      name: t.name,
      description: t.description,
      material: t.material,
      instructions: t.instructions,
      impulses: t.impulses,
      setup_by: t.setupBy,
      conducted_by: t.conductedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToTemplate(data);
}

export async function updateTemplate(
  id: string,
  updates: Partial<Omit<StationTemplate, 'id' | 'createdAt'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.name       !== undefined) row.name         = updates.name;
  if (updates.description !== undefined) row.description  = updates.description;
  if (updates.material   !== undefined) row.material     = updates.material;
  if (updates.instructions !== undefined) row.instructions = updates.instructions;
  if (updates.impulses   !== undefined) row.impulses     = updates.impulses;
  if (updates.setupBy    !== undefined) row.setup_by     = updates.setupBy;
  if (updates.conductedBy !== undefined) row.conducted_by = updates.conductedBy;
  const { error } = await supabase.from('templates').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}

// ── Task Templates ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTaskTemplate(row: any): TaskTemplate {
  return {
    id: row.id,
    name: row.name,
    helpersRequired: row.helpers_required,
    time: row.time ?? undefined,
    createdAt: row.created_at,
  };
}

export async function loadTaskTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(rowToTaskTemplate);
}

export async function createTaskTemplate(
  t: Omit<TaskTemplate, 'id' | 'createdAt'>,
  userId: string,
): Promise<TaskTemplate> {
  const { data, error } = await supabase
    .from('task_templates')
    .insert({
      user_id: userId,
      name: t.name,
      helpers_required: t.helpersRequired,
      time: t.time ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToTaskTemplate(data);
}

export async function updateTaskTemplate(
  id: string,
  updates: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.name             !== undefined) row.name             = updates.name;
  if (updates.helpersRequired  !== undefined) row.helpers_required = updates.helpersRequired;
  if (updates.time             !== undefined) row.time             = updates.time ?? null;
  const { error } = await supabase.from('task_templates').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteTaskTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('task_templates').delete().eq('id', id);
  if (error) throw error;
}

// ── Profiles & Communities ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToProfile(row: any): Profile {
  return {
    id: row.id,
    communityId: row.community_id,
    role: (row.role as UserRole) ?? 'user',
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
    team: row.team ?? undefined,
    createdAt: row.created_at,
  };
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.warn('[loadProfile] Kein Profil gefunden für userId:', userId, '– Prüfe RLS-Policies und ob die profiles-Zeile existiert.');
    return null;
  }
  return rowToProfile(data);
}

export async function loadCommunity(communityId: string): Promise<Community | null> {
  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .eq('id', communityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, createdAt: data.created_at };
}

export async function loadCommunityUsers(communityId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToProfile);
}

export async function loadTeamUsers(team: string, communityId?: string): Promise<Profile[]> {
  const [teamResult, noTeamResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('team', team).order('created_at'),
    communityId
      ? supabase.from('profiles').select('*').is('team', null).eq('community_id', communityId).order('created_at')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamResult.error) throw teamResult.error;
  if (noTeamResult.error) throw noTeamResult.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = [...(teamResult.data ?? []), ...(noTeamResult.data ?? [])] as any[];
  return rows.map(rowToProfile);
}

export async function updateProfileNameAndTeam(userId: string, name: string, team: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ name, team })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateProfileName(userId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ name })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}

export async function sendInvite(email: string, communityId?: string, isAdmin?: boolean): Promise<void> {
  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, communityId, isAdmin: isAdmin ?? false }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Einladung fehlgeschlagen');
  }
}

// ── Planning Tasks ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTask(row: any): PlanningTask {
  return {
    id: row.id,
    planningId: row.planning_id,
    section: row.section as TaskSection,
    name: row.name,
    helpersRequired: row.helpers_required,
    sortOrder: row.sort_order,
    volunteers: row.volunteers ?? [],
    time: row.time ?? undefined,
    createdAt: row.created_at,
  };
}

export async function loadPlanningTasks(planningId: string): Promise<PlanningTask[]> {
  const { data, error } = await supabase
    .from('planning_tasks')
    .select('*')
    .eq('planning_id', planningId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToTask);
}

/**
 * Ersetzt alle Helferaufgaben einer Planung (für die Backup-Wiederherstellung).
 * Neue Aufgaben werden zuerst eingefügt, erst danach die alten gelöscht,
 * damit bei einem Fehler keine Aufgaben verloren gehen.
 */
export async function replacePlanningTasks(planningId: string, tasks: PlanningTask[]): Promise<PlanningTask[]> {
  const { data: oldRows, error: fetchError } = await supabase
    .from('planning_tasks')
    .select('id')
    .eq('planning_id', planningId);
  if (fetchError) throw fetchError;

  let inserted: PlanningTask[] = [];
  if (tasks.length > 0) {
    const { data, error } = await supabase
      .from('planning_tasks')
      .insert(tasks.map(t => ({
        planning_id: planningId,
        section: t.section,
        name: t.name,
        helpers_required: t.helpersRequired ?? 1,
        sort_order: t.sortOrder ?? 0,
        volunteers: t.volunteers ?? [],
        time: t.time ?? null,
      })))
      .select();
    if (error) throw error;
    inserted = (data ?? []).map(rowToTask);
  }

  const oldIds = (oldRows ?? []).map((r: { id: string }) => r.id);
  if (oldIds.length > 0) {
    const { error } = await supabase.from('planning_tasks').delete().in('id', oldIds);
    if (error) throw error;
  }
  return inserted;
}

export async function createPlanningTask(
  planningId: string,
  section: TaskSection,
  name: string,
  helpersRequired: number,
  time?: string,
): Promise<PlanningTask> {
  const { data, error } = await supabase
    .from('planning_tasks')
    .insert({
      planning_id: planningId,
      section,
      name,
      helpers_required: helpersRequired,
      sort_order: 0,
      ...(time ? { time } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return rowToTask(data);
}

export async function deletePlanningTask(id: string): Promise<void> {
  const { error } = await supabase.from('planning_tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function updatePlanningTask(
  id: string,
  updates: { name: string; helpersRequired: number; time?: string },
): Promise<void> {
  const { error } = await supabase
    .from('planning_tasks')
    .update({ name: updates.name, helpers_required: updates.helpersRequired, time: updates.time ?? null })
    .eq('id', id);
  if (error) throw error;
}

export async function updatePlanningTaskVolunteers(taskId: string, volunteers: string[]): Promise<void> {
  const { error } = await supabase
    .from('planning_tasks')
    .update({ volunteers })
    .eq('id', taskId);
  if (error) throw error;
}

export async function updateStationHelpersRequired(stationId: string, helpersRequired: number): Promise<void> {
  const { error } = await supabase
    .from('stations')
    .update({ helpers_required: helpersRequired })
    .eq('id', stationId);
  if (error) throw error;
}
