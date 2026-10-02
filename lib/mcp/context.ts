import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Kontext für den MCP-Server: Service-Role-Client plus die User-ID, in deren
 * Namen die KI arbeitet (ERKI_MCP_USER_ID). Weil der Service-Role-Client RLS
 * umgeht, prüft assertPlanningAccess() den Zugriff explizit.
 */
export type McpContext = { db: SupabaseClient; userId: string };

export function createMcpContext(): McpContext {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.ERKI_MCP_USER_ID;
  if (!url || !key || !userId) {
    throw new Error('MCP falsch konfiguriert: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY oder ERKI_MCP_USER_ID fehlt');
  }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return { db, userId };
}

/**
 * Vereinfachte Entsprechung von can_access_planning():
 * Eigentümer, Collaborator, gleiche Community wie der Eigentümer oder Admin.
 */
export async function assertPlanningAccess(ctx: McpContext, planningId: string): Promise<void> {
  const { db, userId } = ctx;
  const { data: plan, error } = await db
    .from('plannings')
    .select('id, user_id')
    .eq('id', planningId)
    .maybeSingle();
  if (error) throw error;
  if (!plan) throw new Error(`Planung ${planningId} nicht gefunden`);
  if (plan.user_id === userId) return;

  const { data: collab } = await db
    .from('planning_collaborators')
    .select('id')
    .eq('planning_id', planningId)
    .eq('user_id', userId)
    .maybeSingle();
  if (collab) return;

  const { data: profiles } = await db
    .from('profiles')
    .select('id, role, community_id')
    .in('id', [userId, plan.user_id]);
  const me = profiles?.find(p => p.id === userId);
  const owner = profiles?.find(p => p.id === plan.user_id);
  if (me?.role === 'admin') return;
  if (me?.community_id && owner?.community_id === me.community_id) return;

  throw new Error(`Kein Zugriff auf Planung ${planningId}`);
}

/** Liefert planning_id einer Zeile (stations / planning_tasks) und prüft Zugriff. */
export async function assertRowAccess(
  ctx: McpContext,
  table: 'stations' | 'planning_tasks',
  id: string,
): Promise<string> {
  const { data, error } = await ctx.db.from(table).select('planning_id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${table === 'stations' ? 'Station' : 'Aufgabe'} ${id} nicht gefunden`);
  await assertPlanningAccess(ctx, data.planning_id);
  return data.planning_id;
}

/** Snapshot aller Stationen vor destruktiven Aktionen (wie die App). */
export async function createSnapshot(ctx: McpContext, planningId: string, triggerAction: string): Promise<void> {
  const { data: stations, error } = await ctx.db
    .from('stations')
    .select('*')
    .eq('planning_id', planningId)
    .order('sort_order');
  if (error) throw error;
  const { error: insErr } = await ctx.db.from('planning_snapshots').insert({
    planning_id: planningId,
    stations_json: stations ?? [],
    created_by: ctx.userId,
    trigger_action: triggerAction,
  });
  if (insErr) throw insErr;
}
