import { supabase } from './supabase';
import { Plan, PlanStatus, Station, LogoOverlay, LabelOverlay, StationTemplate, Profile, Community, UserRole } from './types';

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
    logoOverlay: row.logo_overlay ?? undefined,
    labelOverlay: row.label_overlay ?? undefined,
    bgZoom: row.bg_zoom ?? 1,
    explanationData: row.explanation_data ?? undefined,
    sourceUrl: row.source_url ?? undefined,
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
  if (!plan || !plan.id) return;
  console.log('[savePlanning] starte für:', plan.id, '|', plan.title, '| status:', plan.status, '| Stationen:', plan.stations.length);

  // Sicherstellen dass alle IDs gültige UUIDs sind (alte .rki-Importe können Non-UUIDs enthalten)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const stations = plan.stations.map(s => ({
    ...s,
    id: UUID_RE.test(s.id) ? s.id : crypto.randomUUID(),
  }));

  // Aktuelle Station-IDs aus DB laden, um entfernte Stationen gezielt zu löschen
  const { data: existingRows, error: fetchError } = await supabase
    .from('stations')
    .select('id')
    .eq('planning_id', plan.id);
  if (fetchError) {
    console.error('[savePlanning] stations ID-Fetch Fehler:', fetchError);
    throw fetchError;
  }
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id));
  const newIds = new Set(stations.map(s => s.id));
  const idsToDelete = [...existingIds].filter(id => !newIds.has(id));

  // plannings UPDATE und stations UPSERT parallel ausführen
  const rows = stations.map((s, i) => stationToRow(s, plan.id, i));
  const planUpdate = supabase
    .from('plannings')
    .update({
      title: plan.title,
      status: plan.status,
      url: plan.url ?? null,
      background_image: plan.backgroundImage ?? null,
      masks: plan.masks ?? [],
      logo_overlay: plan.logoOverlay ?? null,
      label_overlay: plan.labelOverlay ?? null,
      bg_zoom: plan.bgZoom ?? 1,
      source_url: plan.sourceUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id);
  const stationsUpsert = rows.length > 0
    ? supabase.from('stations').upsert(rows, { onConflict: 'id' })
    : Promise.resolve({ error: null });

  const [{ error: planError }, { error: upsertError }] = await Promise.all([planUpdate, stationsUpsert]);
  if (planError) {
    console.error('[savePlanning] plannings UPDATE Fehler:', planError);
    console.error('[savePlanning] plannings UPDATE Fehler detail:', JSON.stringify(planError));
    throw planError;
  }
  if (upsertError) {
    console.error('[savePlanning] stations UPSERT Fehler:', upsertError);
    throw upsertError;
  }
  console.log('[savePlanning] plannings UPDATE + stations UPSERT ok (' + rows.length + ' Zeilen)');

  // Entfernte Stationen gezielt löschen (nicht mehr im neuen Array vorhanden)
  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('stations')
      .delete()
      .in('id', idsToDelete);
    if (deleteError) {
      console.error('[savePlanning] stations DELETE Fehler:', deleteError);
      throw deleteError;
    }
    console.log('[savePlanning] entfernte Stationen gelöscht:', idsToDelete.length);
  }

  // explanation_data separat updaten (kann bei großen Base64-Bildern timeoutten)
  try {
    const { error: explError } = await supabase
      .from('plannings')
      .update({ explanation_data: plan.explanationData ?? null })
      .eq('id', plan.id);
    if (explError) throw explError;
    console.log('[savePlanning] explanation_data UPDATE ok');
  } catch (e) {
    console.error('[savePlanning] explanation_data UPDATE Fehler (ignoriert):', e);
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
        logo_overlay: plan.logoOverlay ?? null,
        label_overlay: plan.labelOverlay ?? null,
        bg_zoom: plan.bgZoom ?? 1,
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

// ── Templates ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTemplate(row: any): StationTemplate {
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

// ── Profiles & Communities ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProfile(row: any): Profile {
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
