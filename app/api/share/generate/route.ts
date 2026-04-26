import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { planning_id } = body as { planning_id?: string };

  if (!planning_id) {
    return NextResponse.json({ error: 'planning_id fehlt' }, { status: 400 });
  }

  // Auth: Bearer token aus dem Authorization-Header
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  }

  // Token mit dem Anon-Client verifizieren (kein Cookie nötig)
  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültiger oder abgelaufener Token' }, { status: 401 });
  }

  const origin = req.headers.get('origin') ?? req.nextUrl.origin;

  // Share-Token in der DB anlegen (best-effort – Tabelle muss existieren)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const shareToken = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin
    .from('share_tokens')
    .insert({ token: shareToken, planning_id, user_id: user.id });

  if (insertError) {
    // Tabelle existiert noch nicht → Fallback auf planning_id als URL-Parameter
    console.error('[share/generate] DB insert fehlgeschlagen:', insertError.message);
    return NextResponse.json({ url: `${origin}/share/${planning_id}` });
  }

  return NextResponse.json({ url: `${origin}/share/${shareToken}` });
}
