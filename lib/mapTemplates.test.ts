import { describe, it, expect } from 'vitest';
import { applyMapTemplate, mapTemplateContentFromPlan, planHasMapContent } from './mapTemplates';
import type { Plan, Station } from './types';

const st = (id: string, areaId?: string | null): Station => ({
  id, number: id, name: id, description: '', material: '', instructions: '', impulses: [],
  setupBy: '', conductedBy: '', x: 10, y: 10, targetX: 20, targetY: 20, areaId,
});

const plan: Plan = {
  id: 'p', title: 'T', status: 'draft',
  stations: [st('a', 'area-1'), st('b', null), st('c', '__none__')],
  backgroundImage: 'https://x/bild.png', bgZoom: 0.9,
  masks: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }] }],
  areas: [{ id: 'area-1', name: 'Saal', points: [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }] }],
  logoOverlay: { x: 60, y: 80, size: 30 },
  labelOverlay: { x: 40, y: 3, text: 'LAGEPLAN', fontSize: 41 },
};

describe('mapTemplateContentFromPlan', () => {
  it('übernimmt alle Lageplan-Felder als Kopie', () => {
    const c = mapTemplateContentFromPlan(plan);
    expect(c).toEqual({
      backgroundImage: plan.backgroundImage, bgZoom: 0.9, masks: plan.masks, areas: plan.areas,
      logoOverlay: plan.logoOverlay, labelOverlay: plan.labelOverlay,
    });
    expect(c.areas).not.toBe(plan.areas);
  });

  it('setzt Defaults bei leerem Lageplan', () => {
    const c = mapTemplateContentFromPlan({ id: 'p', title: 'T', status: 'draft', stations: [] });
    expect(c).toEqual({ backgroundImage: null, bgZoom: 1, masks: [], areas: [], logoOverlay: null, labelOverlay: null });
  });
});

describe('applyMapTemplate', () => {
  const tpl = {
    backgroundImage: 'https://x/neu.png', bgZoom: 1.25, masks: [],
    areas: [{ id: 'neu', name: 'Saal', points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }] }],
    logoOverlay: null, labelOverlay: null,
  };

  it('ersetzt den kompletten Lageplan', () => {
    const u = applyMapTemplate(plan, tpl);
    expect(u.backgroundImage).toBe('https://x/neu.png');
    expect(u.bgZoom).toBe(1.25);
    expect(u.masks).toEqual([]);
    expect(u.areas).toEqual(tpl.areas);
    expect(u.logoOverlay).toBeUndefined();
    expect(u.labelOverlay).toBeUndefined();
  });

  it('setzt alle festen Bereichszuordnungen auf automatisch zurück', () => {
    const u = applyMapTemplate(plan, tpl);
    expect(u.stations!.map(s => s.areaId ?? null)).toEqual([null, null, null]);
  });

  it('lässt Stationen sonst unverändert', () => {
    const u = applyMapTemplate(plan, tpl);
    expect(u.stations!.map(s => [s.id, s.targetX, s.targetY])).toEqual(plan.stations.map(s => [s.id, s.targetX, s.targetY]));
    expect(u.stations![1]).toBe(plan.stations[1]);
  });
});

describe('planHasMapContent', () => {
  it('erkennt leeren und gefüllten Lageplan', () => {
    expect(planHasMapContent(plan)).toBe(true);
    expect(planHasMapContent({ id: 'p', title: 'T', status: 'draft', stations: [] })).toBe(false);
    expect(planHasMapContent({ id: 'p', title: 'T', status: 'draft', stations: [], areas: [plan.areas![0]] })).toBe(true);
  });
});
