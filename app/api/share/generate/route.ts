import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// v0.7.104
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { planning_id } = body

    if (!planning_id) {
      return NextResponse.json({ error: 'planning_id is required' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    // Try to get user ID (optional — created_by is now nullable)
    let userId: string | null = null
    try {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id ?? null
      } else {
        const cookieStore = cookies()
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const anonClient = createClient(supabaseUrl, anonKey, {
          auth: {
            persistSession: false,
            detectSessionInUrl: false,
          },
          global: {
            headers: {
              cookie: cookieStore.toString(),
            }
          }
        })
        const { data: { session } } = await anonClient.auth.getSession()
        userId = session?.user?.id ?? null
      }
    } catch (e) {
      console.log('Could not extract user session:', e)
    }

    const token = crypto.randomUUID()

    const insertData: Record<string, unknown> = {
      token,
      planning_id,
    }
    if (userId) {
      insertData.created_by = userId
    }

    const { error } = await supabase
      .from('share_tokens')
      .insert(insertData)

    if (error) {
      console.error('Share token insert error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get('x-forwarded-host')
        ? `https://${request.headers.get('x-forwarded-host')}`
        : `https://${request.headers.get('host')}`)

    return NextResponse.json({ url: `${base}/share/${token}` })
  } catch (err) {
    console.error('Share generate error:', JSON.stringify(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
