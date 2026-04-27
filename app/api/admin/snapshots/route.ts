import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function authenticateUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return { user: null, adminClient: null, error: 'Nicht authentifiziert' };
  const adminClient = makeAdminClient();
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return { user: null, adminClient: null, error: 'Nicht authentifiziert' };
  return { user, adminClient, error: null };
}

// GET /api/admin/snapshots?planningId=... — Snapshots einer Planung (nur Admins)
export async function GET(req: NextRequest) {
  const { user, adminClient, error } = await authenticateUser(req);
  if (!user || !adminClient) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  const planningId = new URL(req.url).searchParams.get('planningId');
  if (!planningId) return NextResponse.json({ error: 'planningId fehlt' }, { status: 400 });

  const { data, error: dbError } = await adminClient
    .from('planning_snapshots')
    .select('id, planning_id, created_at, created_by, trigger_action, stations_json')
    .eq('planning_id', planningId)
    .order('created_at', { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ snapshots: data });
}

// POST /api/admin/snapshots — Snapshot des aktuellen Zustands anlegen
// Wird von jedem authentifizierten User ausgelöst (z. B. vor Stations-Löschung).
export async function POST(req: NextRequest) {
  const { user, adminClient, error } = await authenticateUser(req);
  if (!user || !adminClient) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const planningId: string | undefined = body?.planningId;
  const triggerAction: string | undefined = body?.triggerAction;
  if (!planningId || !triggerAction) {
    return NextResponse.json({ error: 'planningId und triggerAction sind erforderlich' }, { status: 400 });
  }

  const { data: stations, error: stErr } = await adminClient
    .from('stations')
    .select('*')
    .eq('planning_id', planningId)
    .order('sort_order');

  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

  const { data: snapshot, error: insErr } = await adminClient
    .from('planning_snapshots')
    .insert({
      planning_id: planningId,
      stations_json: stations ?? [],
      created_by: user.id,
      trigger_action: triggerAction,
    })
    .select('id')
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ snapshot });
}
