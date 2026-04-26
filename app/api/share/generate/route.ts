import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { planning_id } = body as { planning_id?: string };

  const origin = req.headers.get('origin') ?? req.nextUrl.origin;

  if (!planning_id) {
    return NextResponse.json({ error: 'planning_id fehlt' }, { status: 400 });
  }

  const fallbackUrl = `${origin}/share/${planning_id}`;

  // Bearer token aus dem Authorization-Header
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    console.error('[share/generate] Kein Bearer token — Fallback');
    return NextResponse.json({ url: fallbackUrl });
  }

  // Token mit Anon-Key verifizieren (kein SERVICE_ROLE_KEY nötig)
  const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !user) {
    console.error('[share/generate] Auth fehlgeschlagen:', authError?.message);
    return NextResponse.json({ url: fallbackUrl });
  }

  // Ohne SERVICE_KEY → direkt Fallback
  if (!SERVICE_KEY) {
    console.warn('[share/generate] SUPABASE_SERVICE_ROLE_KEY nicht gesetzt — Fallback-URL');
    return NextResponse.json({ url: fallbackUrl });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  const shareToken = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin
    .from('share_tokens')
    .insert({ token: shareToken, planning_id, user_id: user.id });

  if (insertError) {
    console.error('[share/generate] DB insert fehlgeschlagen:', insertError.message, '— Fallback-URL');
    return NextResponse.json({ url: fallbackUrl });
  }

  return NextResponse.json({ url: `${origin}/share/${shareToken}` });
}
