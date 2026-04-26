import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Service key bypasses RLS; fall back to anon key if not configured
  const db = createClient(SUPABASE_URL, SERVICE_KEY ?? ANON_KEY);

  // Try share_tokens table first; fall back to treating token as direct planning_id
  // (covers: share_tokens table missing, insert failed, or fallback URL was used)
  let planningId: string = token;

  const { data: tokenRow } = await db
    .from('share_tokens')
    .select('planning_id')
    .eq('token', token)
    .maybeSingle();

  if (tokenRow?.planning_id) {
    planningId = tokenRow.planning_id;
  } else {
    console.warn(`[share/${token}] Kein share_tokens-Eintrag — behandle token als planning_id`);
  }

  const { data: planning, error: planError } = await db
    .from('plannings')
    .select('id, title, status, updated_at')
    .eq('id', planningId)
    .maybeSingle();

  if (planError || !planning) {
    console.error(`[share/${token}] Planung nicht gefunden (planning_id=${planningId}):`, planError?.message);
    return NextResponse.json({ error: 'Planung nicht gefunden' }, { status: 404 });
  }

  const { count } = await db
    .from('stations')
    .select('id', { count: 'exact', head: true })
    .eq('planning_id', planning.id);

  return NextResponse.json({
    planningId: planning.id,
    title: planning.title,
    status: planning.status,
    updatedAt: planning.updated_at,
    stationCount: count ?? 0,
  });
}
