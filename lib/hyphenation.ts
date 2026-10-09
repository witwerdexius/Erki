// ── Deutsche Silbentrennung (einheitlich fuer Editor, geteilte Ansicht, PDF) ──
// Browser trennen mit dem Woerterbuch des Betriebssystems (iPad/Safari z. B.
// "Ha-fenknei-pe"); das PDF mit TeX-Mustern. Damit ueberall gleich getrennt
// wird, setzen Editor und geteilte Ansicht weiche Trennzeichen (U+00AD) aus
// denselben TeX-Mustern und schalten die Browser-Trennung ab (hyphens: manual).

export type Hyphenate = (word: string) => string;

export const SOFT_HYPHEN = '­';

let loader: Promise<Hyphenate> | null = null;

/** Laedt die deutschen Trennmuster einmalig (Code-Splitting, ~730 KB unkomprimiert). */
export function loadGermanHyphenator(): Promise<Hyphenate> {
  if (!loader) {
    loader = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import('hyphen')) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pat = (await import('hyphen/patterns/de-1996')) as any;
      const create = mod.default ?? mod;
      return create(pat.default ?? pat) as Hyphenate;
    })().catch(err => {
      loader = null; // naechster Versuch moeglich
      throw err;
    });
  }
  return loader;
}

/**
 * Fuegt weiche Trennzeichen in einen Namen ein. Getrennt wird je Wort und je
 * Bindestrich-Teil (feste Bindestriche bleiben eigene Umbruchstellen), in
 * Original-Schreibweise (Muster sind kleingeschrieben; Grossschreibung macht CSS).
 */
export function softHyphenate(name: string, hyphenate: Hyphenate): string {
  return name
    .split(/(\s+)/)
    .map(token => (/^\s+$/.test(token) || token === ''
      ? token
      : token.split(/(?<=-)/).map(part => hyphenate(part)).join('')))
    .join('');
}
