import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { callerId, team, communityId } = await req.json();
  if (!callerId || typeof callerId !== 'string') {
    return NextResponse.json({ error: 'callerId fehlt' }, { status: 400 });
  }
  if (!team || typeof team !== 'string') {
    return NextResponse.json({ error: 'team fehlt' }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  const [teamResult, noTeamResult] = await Promise.all([
    adminClient
      .from('profiles')
      .select('*')
      .eq('team', team)
      .order('created_at'),
    communityId
      ? adminClient
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
