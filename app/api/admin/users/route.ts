import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Nicht authentifiziert – kein Token' }, { status: 401 });
  }

  const team = req.nextUrl.searchParams.get('team');
  const communityId = req.nextUrl.searchParams.get('communityId');
  if (!team) {
    return NextResponse.json({ error: 'team-Parameter fehlt' }, { status: 400 });
  }

  // Verify JWT with anon key client (standard pattern – service role key
  // is only for DB operations, not for verifying user JWTs)
  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await verifyClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: `Nicht authentifiziert – ${authError?.message ?? 'kein User'}` }, { status: 401 });
  }

  // Use service role client for all DB operations (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
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
