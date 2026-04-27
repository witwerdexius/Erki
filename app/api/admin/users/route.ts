import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  }

  const team = req.nextUrl.searchParams.get('team');
  if (!team) {
    return NextResponse.json({ error: 'team-Parameter fehlt' }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  }

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  const { data, error } = await adminClient
    .from('profiles')
    .select('*')
    .eq('team', team)
    .order('created_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
