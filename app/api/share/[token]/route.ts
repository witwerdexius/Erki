// v0.7.107
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

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

  const [
    { data: planning, error: planningError },
    { data: stationRows, error: stationsError },
  ] = await Promise.all([
    supabase
      .from('plannings')
      .select('id, title, status, updated_at, background_image, masks, logo_overlay, label_overlay, bg_zoom')
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

  return NextResponse.json({
    planningId: planning.id,
    title: planning.title,
    status: planning.status,
    updatedAt: planning.updated_at,
    stationCount: stations.length,
    backgroundImage: planning.background_image ?? null,
    masks: planning.masks ?? [],
    logoOverlay: planning.logo_overlay ?? null,
    labelOverlay: planning.label_overlay ?? null,
    bgZoom: planning.bg_zoom ?? 1,
    stations,
  });
}
