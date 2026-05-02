import { describe, it, expect } from 'vitest';
import { slugify, extractUuid } from './slugify';

describe('slugify', () => {
  it('liefert leeren String fuer leere Eingabe', () => {
    expect(slugify('')).toBe('');
  });

  it('liefert leeren String fuer Whitespace-Eingabe', () => {
    expect(slugify('   ')).toBe('');
  });

  it('macht Plain-ASCII-Titel zu Kleinbuchstaben mit Bindestrich', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('transliteriert deutsche Umlaute (auch in Grossbuchstaben)', () => {
    expect(slugify('Über Ärger Öl')).toBe('uber-arger-ol');
    expect(slugify('Müsli')).toBe('musli');
  });

  it('transliteriert ß zu ss', () => {
    expect(slugify('Größe Straße')).toBe('grosse-strasse');
  });

  it('strippt Satzzeichen und Sonderzeichen', () => {
    expect(slugify('Hallo, Welt!')).toBe('hallo-welt');
    expect(slugify('a/b\\c.d:e')).toBe('a-b-c-d-e');
  });

  it('entfernt fuehrende und nachfolgende Bindestriche', () => {
    expect(slugify('--abc--')).toBe('abc');
    expect(slugify('!!!Test!!!')).toBe('test');
  });

  it('faltet mehrere Sonderzeichen in einen Bindestrich', () => {
    expect(slugify('foo   bar')).toBe('foo-bar');
    expect(slugify('foo---bar')).toBe('foo-bar');
  });

  it('ist idempotent', () => {
    const inputs = ['Hello World', 'Größe Straße', 'Hallo, Welt!', '   '];
    for (const input of inputs) {
      const once = slugify(input);
      expect(slugify(once)).toBe(once);
    }
  });

  it('truncated keine langen Eingaben (kein Truncation-Verhalten)', () => {
    const long = 'a'.repeat(500);
    expect(slugify(long)).toBe(long);
  });
});

describe('extractUuid', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('extrahiert UUID aus Token mit Praefix', () => {
    expect(extractUuid(`my-plan-${uuid}`)).toBe(uuid);
  });

  it('liefert reine UUID unveraendert zurueck', () => {
    expect(extractUuid(uuid)).toBe(uuid);
  });

  it('liefert Token unveraendert zurueck wenn keine UUID am Ende', () => {
    expect(extractUuid('foo')).toBe('foo');
    expect(extractUuid('a'.repeat(40))).toBe('a'.repeat(40));
  });
});
