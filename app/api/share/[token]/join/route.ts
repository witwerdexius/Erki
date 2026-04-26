import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const authHeader = req.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  const db = createClient(SUPABASE_URL, SERVICE_KEY ?? ANON_KEY);

  const { data: { user }, error: authError } = await db.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  // Resolve token → planning_id (same fallback as GET route)
  let planningId: string = token;

  const { data: tokenRow } = await db
    .from('share_tokens')
    .select('planning_id')
    .eq('token', token)
    .maybeSingle();

  if (tokenRow?.planning_id) {
    planningId = tokenRow.planning_id;
  }

  const { error: insertError } = await db
    .from('planning_collaborators')
    .upsert(
      { planning_id: planningId, user_id: user.id, role: 'editor' },
      { onConflict: 'planning_id,user_id' },
    );

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ planningId });
}
