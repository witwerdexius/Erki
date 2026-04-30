// v0.7.151
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const full = req.nextUrl.searchParams.get('full') === '1';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let planningId: string = token;

  const { data: shareRow, error: shareError } = await supabase
    .from('share_tokens')
    .select('planning_id')
    .eq('token', token)
    .maybeSingle();

  if (shareError) {
    console.error('[share/token] share_tokens lookup error:', JSON.stringify(shareError));
  }

  if (shareRow) {
    planningId = shareRow.planning_id;
  }

  const planningSelect = full
    ? 'id, title, status, updated_at, background_image, masks, logo_overlay, label_overlay, bg_zoom, source_url'
    : 'id, title, status, updated_at, bg_zoom, source_url';

  const [
    { data: planning, error: planningError },
    { data: stationRows, error: stationsError },
  ] = await Promise.all([
    supabase
      .from('plannings')
      .select(planningSelect)
      .eq('id', planningId)
      .maybeSingle(),
    supabase
      .from('stations')
      .select('id, number, name, description, material, instructions, impulses, setup_by, conducted_by, x, y, target_x, target_y, is_filled, color_variant')
      .eq('planning_id', planningId)
      .order('sort_order'),
  ]);

  if (planningError) {
    console.error('[share/token] plannings lookup error:', JSON.stringify(planningError));
  }
  if (stationsError) {
    console.error('[share/token] stations lookup error:', JSON.stringify(stationsError));
  }

  if (!planning) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const stations = (stationRows ?? []).map(r => ({
    id: r.id,
    number: r.number,
    name: r.name,
    description: r.description,
    material: r.material,
    instructions: r.instructions,
    impulses: r.impulses ?? [],
    setupBy: r.setup_by,
    conductedBy: r.conducted_by,
    x: r.x,
    y: r.y,
    targetX: r.target_x,
    targetY: r.target_y,
    isFilled: r.is_filled,
    colorVariant: r.color_variant,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = planning as any;

  const response: Record<string, unknown> = {
    planningId: p.id,
    title: p.title,
    status: p.status,
    updatedAt: p.updated_at,
    stationCount: stations.length,
    bgZoom: p.bg_zoom ?? 1,
    sourceUrl: p.source_url ?? null,
    stations,
  };

  if (full) {
    response.backgroundImage = p.background_image ?? null;
    response.masks = p.masks ?? [];
    response.logoOverlay = p.logo_overlay ?? null;
    response.labelOverlay = p.label_overlay ?? null;
  }

  return NextResponse.json(response);
}
