import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const { email, communityId, isAdmin } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email fehlt' }, { status: 400 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const role = isAdmin ? 'admin' : 'user';

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { role, community_id: communityId ?? null },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (communityId && data?.user?.id) {
    await supabaseAdmin
      .from('profiles')
      .upsert({ id: data.user.id, community_id: communityId, role }, { onConflict: 'id' });
  }

  return NextResponse.json({ success: true });
}
