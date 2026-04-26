// v0.7.105
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let planningId: string = token;

  const { data: shareRow, error: shareError } = await supabase
    .from('share_tokens')
    .select('planning_id')
    .eq('token', token)
    .maybeSingle();

  if (shareError) {
    console.error('[share/token] share_tokens lookup error:', JSON.stringify(shareError));
  }

  if (shareRow) {
    planningId = shareRow.planning_id;
  }

  const { data: planning, error: planningError } = await supabase
    .from('plannings')
    .select('id, title, status, updated_at')
    .eq('id', planningId)
    .maybeSingle();

  if (planningError) {
    console.error('[share/token] plannings lookup error:', JSON.stringify(planningError));
  }

  if (!planning) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const { count, error: countError } = await supabase
    .from('stations')
    .select('id', { count: 'exact', head: true })
    .eq('planning_id', planningId);

  if (countError) {
    console.error('[share/token] stations count error:', JSON.stringify(countError));
  }

  return NextResponse.json({
    planningId: planning.id,
    title: planning.title,
    status: planning.status,
    updatedAt: planning.updated_at,
    stationCount: count ?? 0,
  });
}
