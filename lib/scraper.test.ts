import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeJugendarbeit } from './scraper';

// Smoke-Test: synthetisches HTML statt echtem HTTP-Call (fetch wird gestubt).
const HTML_COLON = `<html><body>
  <h1>Test-Plan</h1><h2>Aktiv-Zeit</h2>
  <h4>Station 1: Bastelstation</h4>
  <p>Material: Schere, Papier</p>
  <p>Stationsbeschreibung: Hier wird gebastelt.</p>
  <p>Gesprächsimpulse:</p>
  <ul><li>Was hat dir gefallen?</li><li>Was war schwer?</li></ul>
</body></html>`;

// Heading ohne Doppelpunkt (Gedankenstrich) – jugendarbeit.online-Variante
const HTML_DASH = `<html><body>
  <h1>Dash-Plan</h1>
  <h5><strong>Station 1 – Laufspiel</strong></h5>
  <p>Stationsbeschreibung: Lauft los!</p>
</body></html>`;

afterEach(() => vi.unstubAllGlobals());

describe('scrapeJugendarbeit (smoke)', () => {
  it('parsed Titel und Station aus synthetischem HTML (Doppelpunkt)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(HTML_COLON, { status: 200 })));
    const result = await scrapeJugendarbeit('https://example.invalid/');
    expect(result.title).toBe('Test-Plan');
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].name).toBe('Bastelstation');
    expect(result.stations[0].material).toBe('Schere, Papier');
    expect(result.stations[0].impulses).toEqual(['Was hat dir gefallen?', 'Was war schwer?']);
  });

  it('parsed Station mit Gedankenstrich statt Doppelpunkt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(HTML_DASH, { status: 200 })));
    const result = await scrapeJugendarbeit('https://example.invalid/');
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].name).toBe('Laufspiel');
    expect(result.stations[0].number).toBe('1');
  });
});
