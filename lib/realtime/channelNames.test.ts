import { describe, it, expect } from 'vitest';
import { planningChannelNames } from './channelNames';

describe('planningChannelNames', () => {
  it('liefert drei eindeutige Namen pro Planung', () => {
    const ch = planningChannelNames('plan-abc');
    expect(ch.sync).toBe('planning:plan-abc:sync');
    expect(ch.presence).toBe('planning:plan-abc:presence');
    expect(ch.broadcast).toBe('planning:plan-abc:broadcast');
  });

  it('drei Names sind paarweise unterschiedlich (verhindert Singleton-Kollision)', () => {
    const ch = planningChannelNames('p1');
    expect(new Set([ch.sync, ch.presence, ch.broadcast]).size).toBe(3);
  });

  it('verschiedene Planungen erzeugen disjunkte Channel-Namen', () => {
    const a = planningChannelNames('p1');
    const b = planningChannelNames('p2');
    expect(a.sync).not.toBe(b.sync);
    expect(a.presence).not.toBe(b.presence);
    expect(a.broadcast).not.toBe(b.broadcast);
  });

  it('reine Funktion: gleicher Input → identische Strings', () => {
    expect(planningChannelNames('x').sync).toBe(planningChannelNames('x').sync);
  });

  it('UUID-förmige IDs werden korrekt eingebettet', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(planningChannelNames(id).sync).toBe(`planning:${id}:sync`);
  });
});
