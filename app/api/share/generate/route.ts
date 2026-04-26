import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  const { planningId } = await req.json();
  if (!planningId) return NextResponse.json({ error: 'planningId fehlt' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('share_tokens')
    .insert({ planning_id: planningId, created_by: user.id })
    .select('token')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ token: data.token });
}
