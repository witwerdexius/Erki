import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );

  let planningId: string = token;

  const { data: shareRow } = await supabase
    .from('share_tokens')
    .select('planning_id, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (shareRow) {
    if (shareRow.expires_at && new Date(shareRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link abgelaufen' }, { status: 410 });
    }
    planningId = shareRow.planning_id;
  }

  const { data: planning, error } = await supabase
    .from('plannings')
    .select('*')
    .eq('id', planningId)
    .maybeSingle();

  if (error) {
    console.error('[share/token] plannings lookup error:', JSON.stringify(error));
  }

  if (!planning) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  return NextResponse.json({ planning });
}
