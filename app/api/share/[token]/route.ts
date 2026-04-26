import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: tokenRow, error } = await supabaseAdmin
    .from('share_tokens')
    .select('planning_id')
    .eq('token', token)
    .maybeSingle();

  if (error || !tokenRow) return NextResponse.json({ error: 'Token nicht gefunden' }, { status: 404 });

  const { data: planning, error: planError } = await supabaseAdmin
    .from('plannings')
    .select('id, title, status, updated_at')
    .eq('id', tokenRow.planning_id)
    .single();

  if (planError || !planning) return NextResponse.json({ error: 'Planung nicht gefunden' }, { status: 404 });

  const { count } = await supabaseAdmin
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
