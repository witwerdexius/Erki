import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const { planning_id } = await req.json();
  if (!planning_id) return NextResponse.json({ error: 'planning_id fehlt' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from('share_tokens')
    .insert({ token, planning_id, expires_at: expiresAt });

  if (insertError) {
    console.error('[share/generate] DB insert error:', JSON.stringify(insertError));
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  return NextResponse.json({ url: `${base}/share/${token}` });
}
