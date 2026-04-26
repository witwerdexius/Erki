// v0.7.105
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: tokenRow, error: tokenError } = await supabase
    .from('share_tokens')
    .select('planning_id, expires_at')
    .eq('token', params.token)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return NextResponse.json({ error: 'Token nicht gefunden' }, { status: 404 });
  }

  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token abgelaufen' }, { status: 410 });
  }

  const { data: planning, error: planningError } = await supabase
    .from('plannings')
    .select('id, title, status, updated_at')
    .eq('id', tokenRow.planning_id)
    .maybeSingle();

  if (planningError || !planning) {
    return NextResponse.json({ error: 'Planung nicht gefunden' }, { status: 404 });
  }

  const { count } = await supabase
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
