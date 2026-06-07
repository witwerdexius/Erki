import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/api/auth';
import { SetRoleBodySchema } from '@/lib/api/validation';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  const { userId: callerId } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = SetRoleBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { userId, role } = parsed.data;

  if (userId === callerId) {
    return NextResponse.json({ error: 'Eigene Rolle kann nicht geändert werden' }, { status: 400 });
  }

  // Schreiben über Service-Role-Client, damit RLS umgangen werden kann.
  // Authentifizierung & Admin-Check erfolgen bereits über requireAdmin().
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await adminClient
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
