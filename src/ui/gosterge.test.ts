import { describe, expect, it } from 'vitest';
import { PARAMETERS } from '../engine/mib';
import { gaugeFrac, gaugeZones, valueRange } from './gosterge';

const HAM = PARAMETERS.filter((p) => !p.derived);
const AI = PARAMETERS.filter((p) => p.derived);

describe('limit göstergesi', () => {
  it('bölgeler 0..1 aralığını boşluksuz ve sırayla kaplar', () => {
    for (const p of PARAMETERS) {
      const z = gaugeZones(p);
      expect(z[0].from).toBe(0);
      expect(z[z.length - 1].to).toBe(1);
      for (let i = 0; i < z.length; i++) {
        expect(z[i].to).toBeGreaterThan(z[i].from);
        if (i > 0) expect(z[i].from).toBe(z[i - 1].to);
      }
    }
  });

  it('ham kanal: sert · yumuşak · nominal · yumuşak · sert', () => {
    for (const p of HAM) {
      expect(gaugeZones(p).map((z) => z.kind)).toEqual(['hard', 'soft', 'nominal', 'soft', 'hard']);
    }
  });

  it('AI skoru: alt limit yok, nominal · yumuşak · sert', () => {
    for (const p of AI) {
      expect(gaugeZones(p).map((z) => z.kind)).toEqual(['nominal', 'soft', 'hard']);
    }
  });

  it('bölge sınırları MIB limitlerinin konumuyla aynı', () => {
    for (const p of PARAMETERS) {
      const z = gaugeZones(p);
      const l = p.limits;
      const sinirlar = z.slice(1).map((x) => x.from);
      const beklenen = [l.hard_low, l.soft_low, l.soft_high, l.hard_high]
        .filter((v): v is number => v !== undefined)
        .map((v) => gaugeFrac(p, v));
      expect(sinirlar).toHaveLength(beklenen.length);
      sinirlar.forEach((s, i) => expect(s).toBeCloseTo(beklenen[i], 12));
    }
  });

  it('imleç aralık dışında kenara kelepçelenir, sıfır nominal bölgede', () => {
    for (const p of PARAMETERS) {
      expect(gaugeFrac(p, 1e6)).toBe(1);
      expect(gaugeFrac(p, -1e6)).toBe(0);
      const f = gaugeFrac(p, 0);
      const nominal = gaugeZones(p).find((z) => z.kind === 'nominal')!;
      expect(f).toBeGreaterThanOrEqual(nominal.from);
      expect(f).toBeLessThanOrEqual(nominal.to);
    }
  });

  it('aralık telemetri şeridiyle aynı: sert bandın %12 dışı', () => {
    const [lo, hi] = valueRange(HAM[0]);
    expect(lo).toBeCloseTo(-6.2, 12);
    expect(hi).toBeCloseTo(6.2, 12);
    const [alo, ahi] = valueRange(AI[0]);
    expect(alo).toBeCloseTo(-0.6, 12);
    expect(ahi).toBeCloseTo(5.6, 12);
  });
});
