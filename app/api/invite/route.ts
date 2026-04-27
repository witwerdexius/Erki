import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const { email, communityId, isAdmin } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email fehlt' }, { status: 400 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { community_id: communityId ?? null },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data?.user?.id) {
    const profileUpdate: Record<string, unknown> = {
      id: data.user.id,
      role: isAdmin ? 'admin' : 'user',
    };
    if (communityId) profileUpdate.community_id = communityId;
    await supabaseAdmin
      .from('profiles')
      .upsert(profileUpdate, { onConflict: 'id' });
  }

  return NextResponse.json({ success: true });
}
