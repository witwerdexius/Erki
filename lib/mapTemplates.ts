// ── Lageplan-Vorlagen ────────────────────────────────────────────────────────
// Reine Hilfsfunktionen (ohne DB/React): Vorlage aus einer Planung erzeugen
// und eine Vorlage auf eine Planung anwenden.

import type { MapTemplate, Plan } from './types';

/** Teil einer Planung, der in einer Lageplan-Vorlage gespeichert wird. */
export type MapTemplateContent = Pick<
  MapTemplate,
  'backgroundImage' | 'bgZoom' | 'masks' | 'areas' | 'logoOverlay' | 'labelOverlay'
>;

/** Lageplan-Inhalt einer Planung für eine Vorlage (tiefe Kopie). */
export function mapTemplateContentFromPlan(plan: Plan): MapTemplateContent {
  return JSON.parse(JSON.stringify({
    backgroundImage: plan.backgroundImage ?? null,
    bgZoom: plan.bgZoom ?? 1,
    masks: plan.masks ?? [],
    areas: plan.areas ?? [],
    logoOverlay: plan.logoOverlay ?? null,
    labelOverlay: plan.labelOverlay ?? null,
  })) as MapTemplateContent;
}

/**
 * Updates, die eine Vorlage auf eine Planung anwenden.
 * Ersetzt den kompletten Lageplan. Stationen bleiben, nur ihre manuelle
 * Bereichszuordnung wird zurückgesetzt (→ automatisch nach Marker-Position),
 * weil die Bereiche der Vorlage andere IDs haben.
 */
export function applyMapTemplate(plan: Plan, tpl: MapTemplateContent): Partial<Plan> {
  const copy = JSON.parse(JSON.stringify(tpl)) as MapTemplateContent;
  return {
    backgroundImage: copy.backgroundImage ?? undefined,
    bgZoom: copy.bgZoom ?? 1,
    masks: copy.masks ?? [],
    areas: copy.areas ?? [],
    logoOverlay: copy.logoOverlay ?? undefined,
    labelOverlay: copy.labelOverlay ?? undefined,
    stations: plan.stations.map(s => (s.areaId ? { ...s, areaId: null } : s)),
  };
}

/** Hat die Planung schon einen Lageplan, der beim Laden überschrieben würde? */
export function planHasMapContent(plan: Plan): boolean {
  return !!plan.backgroundImage
    || (plan.masks?.length ?? 0) > 0
    || (plan.areas?.length ?? 0) > 0
    || !!plan.logoOverlay
    || !!plan.labelOverlay;
}
