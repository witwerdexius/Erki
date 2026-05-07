import { describe, it, expect } from 'vitest';
import {
  sanitizeTitle,
  simulateLines,
  pickFontSize,
  computePdfImagePlacement,
} from './pdfExport';

describe('sanitizeTitle', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(sanitizeTitle('Mein Lageplan!', 'fallback')).toBe('mein-lageplan');
  });

  it('strips leading and trailing hyphens', () => {
    expect(sanitizeTitle('---abc---', 'fallback')).toBe('abc');
  });

  it('falls back when input becomes empty after sanitization', () => {
    expect(sanitizeTitle('!!!', 'lageplan')).toBe('lageplan');
    expect(sanitizeTitle('', 'tabelle')).toBe('tabelle');
  });

  it('collapses runs of separators into a single hyphen', () => {
    expect(sanitizeTitle('A   B___C', 'x')).toBe('a-b-c');
  });

  it('handles umlauts by stripping them (current behaviour)', () => {
    // Aktuelles Verhalten: nicht-ASCII wird zu Hyphen.
    expect(sanitizeTitle('Grüße aus Köln', 'x')).toBe('gr-e-aus-k-ln');
  });
});

describe('simulateLines', () => {
  it('returns 1 line for short text', () => {
    expect(simulateLines('hi', 10)).toBe(1);
  });

  it('wraps when text exceeds chars-per-line', () => {
    // Bei cpl=5 muss "hello world" in mehrere Zeilen umbrechen.
    expect(simulateLines('hello world', 5)).toBeGreaterThanOrEqual(2);
  });

  it('keeps a single line when everything fits', () => {
    expect(simulateLines('hello world', 20)).toBe(1);
  });

  it('handles long unbreakable strings by hard-wrapping', () => {
    // 12 Zeichen, cpl=4 => mindestens 3 Zeilen
    expect(simulateLines('abcdefghijkl', 4)).toBeGreaterThanOrEqual(3);
  });

  it('treats hyphens as soft-break candidates', () => {
    // Trennen nach "-" sollte erlaubt sein.
    const lines = simulateLines('foo-bar-baz', 4);
    expect(lines).toBeGreaterThanOrEqual(2);
  });
});

describe('pickFontSize', () => {
  it('picks the largest size that fits short text', () => {
    // "AB" passt locker auf eine Zeile in 64x58 mit f=14.
    expect(pickFontSize('AB', 64, 58)).toBe(14);
  });

  it('picks a smaller size for long text', () => {
    const big = pickFontSize('SHORT', 64, 58);
    const small = pickFontSize('THIS IS A LONG STATION NAME WITH MANY WORDS', 64, 58);
    expect(small).toBeLessThanOrEqual(big);
  });

  it('never returns less than 7 (minimum floor)', () => {
    expect(pickFontSize('X'.repeat(500), 64, 58)).toBe(7);
  });
});

describe('computePdfImagePlacement', () => {
  it('width-fits when image aspect is wider than page', () => {
    // pdfW=200, pdfH=100, imgAspect=4 => drawW=200, drawH=50
    const r = computePdfImagePlacement(200, 100, 4);
    expect(r.drawW).toBe(200);
    expect(r.drawH).toBe(50);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(25);
  });

  it('height-fits when image aspect is narrower than page', () => {
    // pdfW=100, pdfH=200, imgAspect=0.5
    // drawH initial = 100/0.5 = 200 => exactly fits height; drawW=100
    const r = computePdfImagePlacement(100, 200, 0.5);
    expect(r.drawH).toBe(200);
    expect(r.drawW).toBe(100);
  });

  it('switches to height-fit when width-fit overflows', () => {
    // pdfW=100, pdfH=50, imgAspect=1 => drawW=100, drawH=100 overflows
    // => drawH=50, drawW=50
    const r = computePdfImagePlacement(100, 50, 1);
    expect(r.drawH).toBe(50);
    expect(r.drawW).toBe(50);
    expect(r.offsetX).toBe(25);
    expect(r.offsetY).toBe(0);
  });

  it('centers the image inside the page', () => {
    const r = computePdfImagePlacement(210, 297, 1);
    expect(r.offsetX + r.drawW / 2).toBeCloseTo(105);
    expect(r.offsetY + r.drawH / 2).toBeCloseTo(148.5);
  });
});
