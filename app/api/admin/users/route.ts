import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/auth';
import { AdminUsersBodySchema } from '@/lib/api/validation';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  const { client } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = AdminUsersBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { team, communityId } = parsed.data;

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
