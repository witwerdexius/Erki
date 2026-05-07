import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Erfolgsfall: authentifizierter Anon-Client (RLS aktiv) plus User-ID.
export type AdminContext = { client: SupabaseClient; userId: string };

// Fehlerfall: vorbereitete NextResponse, die der Route-Handler direkt zurückgeben kann.
export type AdminError = { error: NextResponse };

/**
 * Stellt sicher, dass der Aufrufer authentifiziert und ein Admin ist.
 *
 * - 401, wenn kein `Authorization: Bearer <token>`-Header vorhanden ist
 * - 401, wenn `client.auth.getUser(token)` fehlschlägt
 * - 403, wenn `profiles.role !== 'admin'`
 * - sonst: { client, userId } mit einem authentifizierten Anon-Client
 *   (Authorization-Header gesetzt → `auth.uid()` in RLS-Policies verfügbar)
 *
 * Wir geben den Fehler bewusst als Wert zurück (statt zu werfen), damit
 * der Response-Flow im Route-Handler typisiert bleibt.
 */
export async function requireAdmin(
  req: NextRequest,
): Promise<AdminContext | AdminError> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }),
    };
  }

  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  if (!token) {
    return {
      error: NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 }),
    };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 }),
    };
  }

  const { data: callerProfile } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (callerProfile?.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 }),
    };
  }

  return { client, userId: user.id };
}
