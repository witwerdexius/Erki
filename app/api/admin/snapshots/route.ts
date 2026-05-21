import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/api/auth';
import {
  SnapshotCreateBodySchema,
  SnapshotListQuerySchema,
} from '@/lib/api/validation';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Lightweight Auth-Helper für POST: jeder authentifizierte User darf einen
// Snapshot anlegen (z. B. vor Stations-Löschung).  GET ist Admin-only und
// nutzt requireAdmin().
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
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = SnapshotListQuerySchema.safeParse({
    planningId: url.searchParams.get('planningId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { planningId } = parsed.data;

  const adminClient = makeAdminClient();
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

  const raw = await req.json().catch(() => null);
  const parsed = SnapshotCreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { planningId, triggerAction } = parsed.data;

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
