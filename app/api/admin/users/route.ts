import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  }

  const { team, communityId } = await req.json();
  if (!team || typeof team !== 'string') {
    return NextResponse.json({ error: 'team fehlt' }, { status: 400 });
  }

  // Authenticated client: sets Authorization header on all PostgREST requests
  // so auth.uid() is available in RLS policies
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  }

  // RLS: "id = auth.uid()" erlaubt immer das eigene Profil
  const { data: callerProfile } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  // RLS: neue Policy "Admins read all team profiles" erlaubt den Rest
  const [teamResult, noTeamResult] = await Promise.all([
    client.from('profiles').select('*').eq('team', team).order('created_at'),
    communityId
      ? client
          .from('profiles')
          .select('*')
          .is('team', null)
          .eq('community_id', communityId)
          .order('created_at')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (teamResult.error) {
    return NextResponse.json({ error: teamResult.error.message }, { status: 500 });
  }
  if (noTeamResult.error) {
    return NextResponse.json({ error: noTeamResult.error.message }, { status: 500 });
  }

  const users = [...(teamResult.data ?? []), ...(noTeamResult.data ?? [])];
  return NextResponse.json({ users });
}
