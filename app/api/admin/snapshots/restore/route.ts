import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Nur diese Felder werden beim Wiederherstellen neu eingefügt (ohne DB-Metadaten
// wie created_at, die beim ursprünglichen INSERT automatisch generiert wurden).
const STATION_FIELDS = [
  'id', 'planning_id', 'number', 'name', 'description', 'material',
  'instructions', 'impulses', 'setup_by', 'conducted_by',
  'x', 'y', 'target_x', 'target_y', 'is_filled', 'color_variant', 'sort_order',
] as const;

function makeAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// POST /api/admin/snapshots/restore
export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  const adminClient = makeAdminClient();

  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const snapshotId: string | undefined = body?.snapshotId;
  if (!snapshotId) return NextResponse.json({ error: 'snapshotId fehlt' }, { status: 400 });

  // Ziel-Snapshot laden
  const { data: snapshot, error: snapErr } = await adminClient
    .from('planning_snapshots')
    .select('planning_id, stations_json')
    .eq('id', snapshotId)
    .single();

  if (snapErr || !snapshot) {
    return NextResponse.json({ error: 'Snapshot nicht gefunden' }, { status: 404 });
  }

  const planningId: string = snapshot.planning_id;
  const stationsJson = snapshot.stations_json as Record<string, unknown>[];

  // 1. Aktuellen Zustand sichern (before_restore-Snapshot)
  const { data: currentStations } = await adminClient
    .from('stations')
    .select('*')
    .eq('planning_id', planningId)
    .order('sort_order');

  await adminClient.from('planning_snapshots').insert({
    planning_id: planningId,
    stations_json: currentStations ?? [],
    created_by: user.id,
    trigger_action: 'before_restore',
  });

  // 2. Aktuelle Stationen löschen
  const { error: delErr } = await adminClient
    .from('stations')
    .delete()
    .eq('planning_id', planningId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // 3. Stationen aus Snapshot wiederherstellen
  if (stationsJson.length > 0) {
    const rows = stationsJson.map((s, i) => {
      const row: Record<string, unknown> = {};
      for (const field of STATION_FIELDS) {
        if (field in s) row[field] = s[field];
      }
      row.planning_id = planningId;
      if (row.sort_order === undefined || row.sort_order === null) row.sort_order = i;
      return row;
    });

    const { error: insErr } = await adminClient.from('stations').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 4. updated_at der Planung aktualisieren
  await adminClient
    .from('plannings')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', planningId);

  return NextResponse.json({ success: true, planningId });
}
