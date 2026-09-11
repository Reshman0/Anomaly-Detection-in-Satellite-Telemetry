import { describe, expect, it } from 'vitest';
import { detectBreak, fitNominal } from './changePoint';
import type { Sample } from './types';

/** Uygulamadakiyle aynı gürültü modeli: Gaussian AR(1), φ = 0.88, durağan sd 0.24. */
function noise(n: number, seed = 7): number[] {
  let x = seed >>> 0;
  const rand = () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const phi = 0.88;
  const sd = 0.24;
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < n; i++) {
    prev = phi * prev + sd * Math.sqrt(1 - phi * phi) * gauss();
    out.push(prev);
  }
  return out;
}

function series(eng: number[]): Sample[] {
  return eng.map((e, i) => ({ t: i, raw: null, eng: e }));
}

describe('beyazlatılmış CUSUM yapısal kırılma', () => {
  it('pencere içinde t=500’de başlayan rampada kırılmayı ±12 s içinde bulur, yönü pozitif', () => {
    // Pencere [479, 599]; rampa pencerenin içinde başlar, referans [239, 479] temizdir.
    const n = noise(600);
    const eng = n.map((v, t) => v + (t >= 500 ? Math.min(1.3, ((t - 500) / 70) * 1.3) : 0));
    const r = detectBreak(series(eng), 599)!;
    expect(r).not.toBeNull();
    expect(r.direction).toBe(1);
    // Yavaş rampada başlangıç kestirimi doğası gereği ±10 s belirsizdir.
    expect(r.breakT).toBeGreaterThanOrEqual(488);
    expect(r.breakT).toBeLessThanOrEqual(512);
    expect(r.detectedT).toBeLessThan(599);
    expect(r.phi).toBeGreaterThan(0.5);
  });

  it('aşağı yönlü basamakta yön negatiftir ve başlangıç yakındır', () => {
    const n = noise(600, 11);
    const eng = n.map((v, t) => v - (t >= 520 ? 1.2 : 0));
    const r = detectBreak(series(eng), 599)!;
    expect(r).not.toBeNull();
    expect(r.direction).toBe(-1);
    expect(Math.abs(r.breakT - 520)).toBeLessThanOrEqual(10);
  });

  it('durağan AR(1) gürültüde kırılma ilan etmez', () => {
    for (const seed of [3, 19, 42]) {
      expect(detectBreak(series(noise(600, seed)), 599), 'seed ' + seed).toBeNull();
    }
  });

  it('dondurulmuş nominal modelle, referans önceki senaryo kuyruğuyla kirliyken de çalışır', () => {
    const n = noise(600, 5);
    // 300–420 arası eski bir "senaryo" izi, 540'tan itibaren yeni basamak
    // Eski iz referansin (239-479) ucte birini kaplar; medyan taban cizgisi etkilenmez.
    const eng = n.map((v, t) => v + (t >= 380 && t < 460 ? 1.2 : 0) + (t >= 540 ? 1.3 : 0));
    const model = fitNominal(n.slice(0, 280));
    const r = detectBreak(series(eng), 599, { startAfterT: 479, model, refS: 240 })!;
    expect(r).not.toBeNull();
    expect(Math.abs(r.breakT - 540)).toBeLessThanOrEqual(8);
  });

  it('yetersiz referansta null döner', () => {
    expect(detectBreak(series(noise(40)), 39)).toBeNull();
  });
});
