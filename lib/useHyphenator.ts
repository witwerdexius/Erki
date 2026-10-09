'use client';

import { useEffect, useState } from 'react';
import { loadGermanHyphenator, type Hyphenate } from './hyphenation';

/**
 * Liefert die deutsche Silbentrennung, sobald sie geladen ist (sonst null –
 * dann trennt solange der Browser).
 */
export function useHyphenator(): Hyphenate | null {
  const [hyph, setHyph] = useState<{ fn: Hyphenate } | null>(null);
  useEffect(() => {
    let alive = true;
    loadGermanHyphenator()
      .then(fn => { if (alive) setHyph({ fn }); })
      .catch(err => console.warn('[Silbentrennung] konnte nicht geladen werden:', err));
    return () => { alive = false; };
  }, []);
  return hyph?.fn ?? null;
}
