import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const authHeader = req.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  const { data: tokenRow, error: tokenError } = await supabaseAdmin
    .from('share_tokens')
    .select('planning_id')
    .eq('token', token)
    .maybeSingle();

  if (tokenError || !tokenRow) return NextResponse.json({ error: 'Token nicht gefunden' }, { status: 404 });

  const { error: insertError } = await supabaseAdmin
    .from('planning_collaborators')
    .upsert(
      { planning_id: tokenRow.planning_id, user_id: user.id, role: 'editor' },
      { onConflict: 'planning_id,user_id' },
    );

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ planningId: tokenRow.planning_id });
}
