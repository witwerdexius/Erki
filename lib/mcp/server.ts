import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { McpContext, assertPlanningAccess, assertRowAccess, createSnapshot } from './context';

// ── Hilfen ──────────────────────────────────────────────────────

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function wrap<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return ok(await fn(args));
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === 'object' ? JSON.stringify(e) : String(e);
      return { content: [{ type: 'text', text: `Fehler: ${msg}` }], isError: true };
    }
  };
}

/** Entfernt undefined-Werte und mappt camelCase-Eingaben auf DB-Spalten. */
function mapFields(input: Record<string, unknown>, map: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && map[k]) out[map[k]] = v;
  }
  return out;
}

// Spalten ohne große Data-URLs (background_image, nachdenk_template)
const PLANNING_COLS =
  'id, user_id, title, status, url, source_url, bg_zoom, masks, logo_overlay, label_overlay, explanation_data, task_sections, version, created_at, updated_at';

// ── Schemas ─────────────────────────────────────────────────────

const point = z.object({ x: z.number(), y: z.number() });

const planningFields = {
  title: z.string().optional().describe('Titel der Planung'),
  status: z.enum(['draft', 'active', 'archive']).optional(),
  url: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  bgZoom: z.number().optional().describe('Hintergrund-Zoom, üblich: 0.5, 0.75, 1, 1.25, 1.5, 2'),
  masks: z.array(z.object({ points: z.array(point) })).optional().describe('Masken-Polygone, Koordinaten in % (0–100)'),
  logoOverlay: z.object({ x: z.number(), y: z.number(), size: z.number() }).nullable().optional(),
  labelOverlay: z.object({ x: z.number(), y: z.number(), text: z.string(), fontSize: z.number() }).nullable().optional(),
  explanationData: z
    .object({
      timeBlocks: z.array(z.object({ label: z.string(), description: z.string() })).length(3),
      nextDates: z.array(z.string()),
      churchLogo1Url: z.string().optional(),
      churchLogo2Url: z.string().optional(),
      qrCodeUrl: z.string().optional(),
      feedbackText: z.string().optional(),
    })
    .nullable()
    .optional()
    .describe('Erklärungsseite; wird komplett ersetzt'),
  taskSections: z.array(z.string()).optional().describe('Reihenfolge/Namen der Aufgaben-Abschnitte'),
};
const PLANNING_MAP: Record<string, string> = {
  title: 'title', status: 'status', url: 'url', sourceUrl: 'source_url', bgZoom: 'bg_zoom', masks: 'masks',
  logoOverlay: 'logo_overlay', labelOverlay: 'label_overlay', explanationData: 'explanation_data', taskSections: 'task_sections',
};

const stationFields = {
  number: z.string().optional().describe('Anzeigenummer, z. B. "3"'),
  name: z.string().optional(),
  description: z.string().optional(),
  material: z.string().optional(),
  instructions: z.string().optional(),
  impulses: z.array(z.string()).optional(),
  setupBy: z.string().optional().describe('Aufbau durch'),
  conductedBy: z.string().optional().describe('Durchführung durch'),
  x: z.number().min(0).max(100).optional().describe('Position der Station in % von links'),
  y: z.number().min(0).max(100).optional().describe('Position der Station in % von oben'),
  targetX: z.number().min(0).max(100).optional().describe('Zielpunkt der Verbindungslinie in % von links'),
  targetY: z.number().min(0).max(100).optional().describe('Zielpunkt der Verbindungslinie in % von oben'),
  isFilled: z.boolean().optional(),
  colorVariant: z.number().int().min(0).max(3).optional(),
  helpersRequired: z.number().int().min(0).optional(),
};
const STATION_MAP: Record<string, string> = {
  number: 'number', name: 'name', description: 'description', material: 'material', instructions: 'instructions',
  impulses: 'impulses', setupBy: 'setup_by', conductedBy: 'conducted_by', x: 'x', y: 'y', targetX: 'target_x',
  targetY: 'target_y', isFilled: 'is_filled', colorVariant: 'color_variant', helpersRequired: 'helpers_required',
};

const taskFields = {
  section: z.string().optional().describe('Abschnitt, z. B. aufbau, feierzeit, catering, abbau'),
  name: z.string().optional(),
  helpersRequired: z.number().int().min(0).optional(),
  time: z.string().nullable().optional().describe('Uhrzeit/Zeitraum als Text'),
  volunteers: z.array(z.string()).optional().describe('Namen der eingetragenen Helfer'),
  sortOrder: z.number().int().optional(),
};
const TASK_MAP: Record<string, string> = {
  section: 'section', name: 'name', helpersRequired: 'helpers_required', time: 'time', volunteers: 'volunteers', sortOrder: 'sort_order',
};

// ── Server ──────────────────────────────────────────────────────

export function buildMcpServer(ctx: McpContext): McpServer {
  const { db } = ctx;
  const server = new McpServer({ name: 'erki', version: '1.0.0' });

  server.registerTool(
    'planungen_auflisten',
    { description: 'Listet alle zugänglichen ErKi-Planungen (ohne Stationen).', inputSchema: {} },
    wrap(async () => {
      const { data, error } = await db
        .from('plannings')
        .select('id, user_id, title, status, version, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const visible = [];
      for (const p of data ?? []) {
        try {
          await assertPlanningAccess(ctx, p.id);
          visible.push(p);
        } catch { /* nicht zugänglich */ }
      }
      return visible;
    }),
  );

  server.registerTool(
    'planung_lesen',
    {
      description:
        'Liest eine Planung vollständig: Metadaten, Stationen (sortiert) und Helferaufgaben. Hintergrundbild und PDF-Vorlage werden nicht übertragen, nur ob sie vorhanden sind.',
      inputSchema: { planungId: z.string().uuid() },
    },
    wrap(async ({ planungId }: { planungId: string }) => {
      await assertPlanningAccess(ctx, planungId);
      const [plan, bg, stations, tasks] = await Promise.all([
        db.from('plannings').select(PLANNING_COLS).eq('id', planungId).single(),
        db.from('plannings').select('has_bg:background_image').eq('id', planungId).single(),
        db.from('stations').select('*').eq('planning_id', planungId).order('sort_order'),
        db.from('planning_tasks').select('*').eq('planning_id', planungId).order('section').order('sort_order').order('created_at'),
      ]);
      for (const r of [plan, stations, tasks]) if (r.error) throw r.error;
      return {
        planung: { ...plan.data, hasBackgroundImage: !!bg.data?.has_bg },
        stationen: stations.data,
        aufgaben: tasks.data,
      };
    }),
  );

  server.registerTool(
    'planung_anlegen',
    { description: 'Legt eine neue, leere Planung an.', inputSchema: { title: z.string() } },
    wrap(async ({ title }: { title: string }) => {
      const { data, error } = await db
        .from('plannings')
        .insert({ title, user_id: ctx.userId })
        .select(PLANNING_COLS)
        .single();
      if (error) throw error;
      return data;
    }),
  );

  server.registerTool(
    'planung_aendern',
    {
      description:
        'Ändert Metadaten einer Planung. Nur übergebene Felder werden geändert. erwarteteVersion (aus planung_lesen) verhindert das Überschreiben paralleler Änderungen.',
      inputSchema: { planungId: z.string().uuid(), erwarteteVersion: z.number().int().optional(), ...planningFields },
    },
    wrap(async (args: Record<string, unknown> & { planungId: string; erwarteteVersion?: number }) => {
      await assertPlanningAccess(ctx, args.planungId);
      const update = mapFields(args, PLANNING_MAP);
      if (Object.keys(update).length === 0) throw new Error('Keine Felder zum Ändern übergeben');
      update.updated_at = new Date().toISOString();
      let q = db.from('plannings').update(update).eq('id', args.planungId);
      if (typeof args.erwarteteVersion === 'number') q = q.eq('version', args.erwarteteVersion);
      const { data, error } = await q.select('id, version');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(`Versionskonflikt: Planung wurde inzwischen geändert (erwartet ${args.erwarteteVersion}). Bitte neu lesen.`);
      }
      return { ok: true, neueVersion: data[0].version };
    }),
  );

  server.registerTool(
    'station_anlegen',
    {
      description: 'Legt eine Station am Ende der Planung an. Ohne number wird die nächste freie Nummer vergeben.',
      inputSchema: { planungId: z.string().uuid(), ...stationFields },
    },
    wrap(async (args: Record<string, unknown> & { planungId: string }) => {
      await assertPlanningAccess(ctx, args.planungId);
      const { data: existing, error } = await db
        .from('stations')
        .select('number, sort_order')
        .eq('planning_id', args.planungId);
      if (error) throw error;
      const maxSort = Math.max(-1, ...(existing ?? []).map(s => s.sort_order ?? 0));
      const maxNum = Math.max(0, ...(existing ?? []).map(s => parseInt(s.number, 10)).filter(n => !isNaN(n)));
      const row = {
        planning_id: args.planungId,
        sort_order: maxSort + 1,
        number: String(maxNum + 1),
        ...mapFields(args, STATION_MAP),
      };
      const { data, error: insErr } = await db.from('stations').insert(row).select('*').single();
      if (insErr) throw insErr;
      return data;
    }),
  );

  server.registerTool(
    'station_aendern',
    {
      description: 'Ändert eine Station. Nur übergebene Felder werden geändert.',
      inputSchema: { stationId: z.string().uuid(), ...stationFields },
    },
    wrap(async (args: Record<string, unknown> & { stationId: string }) => {
      await assertRowAccess(ctx, 'stations', args.stationId);
      const update = mapFields(args, STATION_MAP);
      if (Object.keys(update).length === 0) throw new Error('Keine Felder zum Ändern übergeben');
      const { data, error } = await db.from('stations').update(update).eq('id', args.stationId).select('*').single();
      if (error) throw error;
      return data;
    }),
  );

  server.registerTool(
    'station_loeschen',
    {
      description: 'Löscht eine Station. Vorher wird automatisch ein Snapshot aller Stationen angelegt.',
      inputSchema: { stationId: z.string().uuid() },
    },
    wrap(async ({ stationId }: { stationId: string }) => {
      const planungId = await assertRowAccess(ctx, 'stations', stationId);
      await createSnapshot(ctx, planungId, 'mcp:station_loeschen');
      const { error } = await db.from('stations').delete().eq('id', stationId);
      if (error) throw error;
      return { ok: true, geloescht: stationId };
    }),
  );

  server.registerTool(
    'stationen_sortieren',
    {
      description: 'Setzt die Reihenfolge der Stationen. stationIds muss alle Stationen der Planung enthalten.',
      inputSchema: { planungId: z.string().uuid(), stationIds: z.array(z.string().uuid()) },
    },
    wrap(async ({ planungId, stationIds }: { planungId: string; stationIds: string[] }) => {
      await assertPlanningAccess(ctx, planungId);
      const { data: existing, error } = await db.from('stations').select('id').eq('planning_id', planungId);
      if (error) throw error;
      const ids = new Set((existing ?? []).map(s => s.id));
      if (ids.size !== stationIds.length || !stationIds.every(id => ids.has(id))) {
        throw new Error('stationIds muss genau alle Stationen dieser Planung enthalten');
      }
      for (let i = 0; i < stationIds.length; i++) {
        const { error: e } = await db.from('stations').update({ sort_order: i }).eq('id', stationIds[i]);
        if (e) throw e;
      }
      return { ok: true };
    }),
  );

  server.registerTool(
    'aufgabe_anlegen',
    {
      description: 'Legt eine Helferaufgabe an.',
      inputSchema: { planungId: z.string().uuid(), ...taskFields, section: z.string(), name: z.string() },
    },
    wrap(async (args: Record<string, unknown> & { planungId: string }) => {
      await assertPlanningAccess(ctx, args.planungId);
      const row = { planning_id: args.planungId, helpers_required: 1, sort_order: 0, ...mapFields(args, TASK_MAP) };
      const { data, error } = await db.from('planning_tasks').insert(row).select('*').single();
      if (error) throw error;
      return data;
    }),
  );

  server.registerTool(
    'aufgabe_aendern',
    {
      description: 'Ändert eine Helferaufgabe. Nur übergebene Felder werden geändert.',
      inputSchema: { aufgabeId: z.string().uuid(), ...taskFields },
    },
    wrap(async (args: Record<string, unknown> & { aufgabeId: string }) => {
      await assertRowAccess(ctx, 'planning_tasks', args.aufgabeId);
      const update = mapFields(args, TASK_MAP);
      if (Object.keys(update).length === 0) throw new Error('Keine Felder zum Ändern übergeben');
      const { data, error } = await db.from('planning_tasks').update(update).eq('id', args.aufgabeId).select('*').single();
      if (error) throw error;
      return data;
    }),
  );

  server.registerTool(
    'aufgabe_loeschen',
    { description: 'Löscht eine Helferaufgabe.', inputSchema: { aufgabeId: z.string().uuid() } },
    wrap(async ({ aufgabeId }: { aufgabeId: string }) => {
      await assertRowAccess(ctx, 'planning_tasks', aufgabeId);
      const { error } = await db.from('planning_tasks').delete().eq('id', aufgabeId);
      if (error) throw error;
      return { ok: true, geloescht: aufgabeId };
    }),
  );

  return server;
}
