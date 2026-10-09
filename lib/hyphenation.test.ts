import { describe, it, expect } from 'vitest';
import { loadGermanHyphenator, softHyphenate, SOFT_HYPHEN } from './hyphenation';
import { wrapStationName } from './pdfExport';

const show = (s: string) => s.split(SOFT_HYPHEN).join('·');

describe('softHyphenate', () => {
  it('setzt weiche Trennzeichen wie das PDF (TeX-Muster)', async () => {
    const h = await loadGermanHyphenator();
    expect(show(softHyphenate('Hafenkneipe', h))).toBe('Ha·fen·knei·pe');
    expect(show(softHyphenate('Kleinkindbereich', h))).toBe('Klein·kind·be·reich');
  });
  it('feste Bindestriche und Leerzeichen bleiben erhalten, je Teil getrennt', async () => {
    const h = await loadGermanHyphenator();
    expect(show(softHyphenate('Segens-Station', h))).toBe('Se·gens-Sta·ti·on');
    expect(show(softHyphenate('Kaffee & Gespräche', h))).toBe('Kaf·fee & Ge·sprä·che');
    expect(softHyphenate('Jesus  sorgt', h).replace(new RegExp(SOFT_HYPHEN, 'g'), '')).toBe('Jesus  sorgt');
  });
  it('Text ohne Trennzeichen ist unverändert', async () => {
    const h = await loadGermanHyphenator();
    for (const n of ['Fischer-Action-Parcours', 'Der Fisch als Erkennungszeichen', 'Äpfel schälen und teilen']) {
      expect(softHyphenate(n, h).split(SOFT_HYPHEN).join('')).toBe(n);
    }
  });
  it('Loader liefert immer dieselbe Instanz', async () => {
    expect(await loadGermanHyphenator()).toBe(await loadGermanHyphenator());
  });
  it('Hafenkneipe bricht (wie im PDF) zu HAFEN- / KNEIPE', async () => {
    const h = await loadGermanHyphenator();
    expect(wrapStationName('Hafenkneipe', h, 8, s => s.length)).toEqual(['HAFEN-', 'KNEIPE']);
  });
});
