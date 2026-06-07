import { describe, it, expect } from 'vitest';
import { diffPlanRow, VersionConflictError } from './db';
import type { Plan } from './types';

// Basis-Plan für Diff-Tests; in den Tests wird per Spread + Override variiert.
const basePlan: Plan = {
  id: 'plan-1',
  title: 'Sternstunden',
  status: 'active',
  url: 'https://example.org',
  stations: [],
  backgroundImage: 'data:image/png;base64,abc',
  masks: [{ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
  logoOverlay: { x: 10, y: 10, size: 20 },
  labelOverlay: { x: 50, y: 50, text: 'ErKi', fontSize: 16 },
  bgZoom: 1.5,
  sourceUrl: 'https://jugendarbeit.online/x',
  version: 7,
};

describe('diffPlanRow', () => {
  it('liefert leeres Patch-Objekt, wenn nichts geändert wurde', () => {
    expect(diffPlanRow(basePlan, basePlan)).toEqual({});
  });

  it('liefert leeres Patch-Objekt bei strukturell identischen Klonen', () => {
    const clone = JSON.parse(JSON.stringify(basePlan)) as Plan;
    expect(diffPlanRow(basePlan, clone)).toEqual({});
  });

  it('erkennt Single-Field-Änderung (title)', () => {
    const next = { ...basePlan, title: 'Neuer Titel' };
    expect(diffPlanRow(basePlan, next)).toEqual({ title: 'Neuer Titel' });
  });

  it('erkennt Single-Field-Änderung (status)', () => {
    const next: Plan = { ...basePlan, status: 'archive' };
    expect(diffPlanRow(basePlan, next)).toEqual({ status: 'archive' });
  });

  it('erkennt mehrere geänderte Felder gleichzeitig', () => {
    const next: Plan = { ...basePlan, title: 'X', status: 'draft', bgZoom: 2 };
    expect(diffPlanRow(basePlan, next)).toEqual({
      title: 'X',
      status: 'draft',
      bg_zoom: 2,
    });
  });

  it('erkennt masks-Reorder als Änderung (JSON.stringify Vergleich)', () => {
    const reordered: Plan = {
      ...basePlan,
      masks: [{ points: [{ x: 3, y: 4 }, { x: 1, y: 2 }] }],
    };
    const patch = diffPlanRow(basePlan, reordered);
    expect(patch.masks).toEqual([{ points: [{ x: 3, y: 4 }, { x: 1, y: 2 }] }]);
    expect(Object.keys(patch)).toEqual(['masks']);
  });

  it('erkennt logo_overlay-Feldänderung', () => {
    const next: Plan = {
      ...basePlan,
      logoOverlay: { x: 99, y: 10, size: 20 },
    };
    expect(diffPlanRow(basePlan, next)).toEqual({
      logo_overlay: { x: 99, y: 10, size: 20 },
    });
  });

  it('erkennt label_overlay-Feldänderung (Text)', () => {
    const next: Plan = {
      ...basePlan,
      labelOverlay: { x: 50, y: 50, text: 'Neu', fontSize: 16 },
    };
    expect(diffPlanRow(basePlan, next)).toEqual({
      label_overlay: { x: 50, y: 50, text: 'Neu', fontSize: 16 },
    });
  });

  it('erkennt bgZoom-numerische Änderung und mappt zu bg_zoom', () => {
    const next: Plan = { ...basePlan, bgZoom: 0.75 };
    expect(diffPlanRow(basePlan, next)).toEqual({ bg_zoom: 0.75 });
  });

  it('erkennt bgZoom undefined → 1 als keine Änderung (Default-Match)', () => {
    const prev: Plan = { ...basePlan, bgZoom: 1 };
    const next: Plan = { ...basePlan, bgZoom: undefined };
    expect(diffPlanRow(prev, next)).toEqual({});
  });

  it('handhabt sourceUrl undefined → undefined als keine Änderung', () => {
    const prev: Plan = { ...basePlan, sourceUrl: undefined };
    const next: Plan = { ...basePlan, sourceUrl: undefined };
    expect(diffPlanRow(prev, next)).toEqual({});
  });

  it('erkennt sourceUrl undefined → "..." als Änderung und mappt zu source_url', () => {
    const prev: Plan = { ...basePlan, sourceUrl: undefined };
    const next: Plan = { ...basePlan, sourceUrl: 'https://neu.de' };
    expect(diffPlanRow(prev, next)).toEqual({ source_url: 'https://neu.de' });
  });

  it('erkennt sourceUrl "..." → undefined als Änderung und liefert null im Patch', () => {
    const prev: Plan = { ...basePlan, sourceUrl: 'https://alt.de' };
    const next: Plan = { ...basePlan, sourceUrl: undefined };
    expect(diffPlanRow(prev, next)).toEqual({ source_url: null });
  });

  it('erkennt url Änderung und mappt zu url-Spalte', () => {
    const next: Plan = { ...basePlan, url: 'https://neu.example' };
    expect(diffPlanRow(basePlan, next)).toEqual({ url: 'https://neu.example' });
  });

  it('erkennt backgroundImage Änderung und mappt zu background_image', () => {
    const next: Plan = { ...basePlan, backgroundImage: 'data:image/png;base64,xyz' };
    expect(diffPlanRow(basePlan, next)).toEqual({
      background_image: 'data:image/png;base64,xyz',
    });
  });

  it('vergleicht masks=undefined und masks=[] als gleich (Default-Behandlung)', () => {
    const prev: Plan = { ...basePlan, masks: undefined };
    const next: Plan = { ...basePlan, masks: [] };
    expect(diffPlanRow(prev, next)).toEqual({});
  });

  it('enthält updated_at NICHT (das fügt buildPlanningUpdatePayload hinzu)', () => {
    const patch = diffPlanRow(basePlan, { ...basePlan, title: 'X' });
    expect(patch.updated_at).toBeUndefined();
  });
});

describe('VersionConflictError', () => {
  it('ist eine Instanz von Error', () => {
    const err = new VersionConflictError('plan-42', 5);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VersionConflictError);
  });

  it('exposiert planId, expectedVersion und name', () => {
    const err = new VersionConflictError('plan-42', 5);
    expect(err.planId).toBe('plan-42');
    expect(err.expectedVersion).toBe(5);
    expect(err.name).toBe('VersionConflictError');
  });

  it('enthält planId und expectedVersion in der message', () => {
    const err = new VersionConflictError('plan-42', 5);
    expect(err.message).toContain('plan-42');
    expect(err.message).toContain('5');
  });
});
