/**
 * Kanit gorsellerinin VERISI.
 *
 * Onceden uretilmis PNG'lerin yerini aldi: senaryo artik hedef kanali her
 * kosuda havuzdan seciyor, dolayisiyla gorselin de o kanala gore olusmasi
 * gerekiyor. Cizim `components/XaiFigure.tsx` icinde, burasi yalnizca sayi
 * uretir; boylece test edilebilir kalir.
 *
 * Uretim TOHUMLUDUR: ayni senaryo + ayni kanal + ayni tohum her zaman ayni
 * seriyi verir (kabul kriteri: determinizm).
 */
import type { Scenario } from './scenarioRunner';
import { MIB } from './mib';

export const FIGURE_CHANNELS: string[] = MIB.parameters.filter((p) => !p.derived).map((p) => p.pid);

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Metin tohumu -> sayi (kanal adi tohuma katilsin diye). */
export function hashSeedText(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface DeviationField {
  grid: number[][];
  dur: number;
}

/** Kanal x zaman mutlak sapma alani (sekil 2 ve 3). */
export function deviationField(sc: Scenario, seed: number): DeviationField {
  const dur = sc.duration_s;
  const rnd = mulberry32(seed);
  const grid = FIGURE_CHANNELS.map(() => new Array<number>(dur).fill(0));
  for (let c = 0; c < FIGURE_CHANNELS.length; c++) {
    let prev = 0;
    for (let t = 0; t < dur; t++) {
      prev = prev * 0.85 + (rnd() - 0.5) * 0.16;
      grid[c][t] = Math.abs(prev) + 0.03;
    }
  }
  const idx = (pid: string) => FIGURE_CHANNELS.indexOf(pid);

  for (const step of sc.timeline) {
    if (step.type === 'inject_drift') {
      const c = idx(step.pid);
      if (c < 0) continue;
      for (let t = 0; t < dur; t++) {
        const te = t - step.t;
        if (te < 0) continue;
        grid[c][t] += Math.abs(step.magnitude) * Math.min(1, te / step.duration_s);
      }
    } else if (step.type === 'inject_point') {
      const c = idx(step.pid);
      if (c < 0) continue;
      const sigma = Math.max(1, step.width_s) / 2;
      for (let t = 0; t < dur; t++) {
        const d = (t - step.t) / sigma;
        grid[c][t] += Math.abs(step.magnitude) * Math.exp(-0.5 * d * d);
      }
    } else if (step.type === 'inject_collective') {
      for (const tg of step.targets) {
        const c = idx(tg.pid);
        if (c < 0) continue;
        for (let t = 0; t < dur; t++) {
          const te = t - step.t;
          if (te < 0 || te > step.duration_s) continue;
          const ramp = Math.min(1, te / step.ramp_s);
          const osc = 1 + 0.28 * Math.sin(2 * Math.PI * step.oscillation_hz * te);
          grid[c][t] += Math.abs(tg.magnitude) * ramp * osc;
        }
      }
    }
  }
  return { grid, dur };
}

export interface SignalPair {
  beklenen: number[];
  olculen: number[];
  fark: number[];
  dur: number;
}

/**
 * Sekil 1: modelin bekledigi (yeniden kurdugu) seri ile olculen seri.
 * Enjeksiyon yalnizca olculene eklenir; ikisinin farki modelin yakaladigi sey.
 */
export function signalPair(sc: Scenario, pid: string, seed: number): SignalPair {
  const dur = sc.duration_s;
  const rnd = mulberry32(seed + 313);
  const beklenen: number[] = [];
  const olculen: number[] = [];
  let taban = 0;
  for (let t = 0; t < dur; t++) {
    taban = taban * 0.9 + (rnd() - 0.5) * 0.22;
    const bek = taban + 0.3 * Math.sin((2 * Math.PI * t) / 190 + 2.6);
    // model kusursuz kurmaz: kucuk bir kurulum hatasi birakilir
    beklenen.push(bek + (rnd() - 0.5) * 0.07);
    olculen.push(bek);
  }
  for (const step of sc.timeline) {
    if (step.type === 'inject_drift' && step.pid === pid) {
      for (let t = Math.max(0, step.t); t < dur; t++) {
        olculen[t] += step.magnitude * Math.min(1, (t - step.t) / step.duration_s);
      }
    } else if (step.type === 'inject_point' && step.pid === pid) {
      const sigma = Math.max(1, step.width_s) / 2;
      for (let t = 0; t < dur; t++) {
        const d = (t - step.t) / sigma;
        olculen[t] += step.magnitude * Math.exp(-0.5 * d * d);
      }
    } else if (step.type === 'inject_collective') {
      const tg = step.targets.find((x) => x.pid === pid);
      if (!tg) continue;
      for (let t = Math.max(0, step.t); t < dur; t++) {
        const te = t - step.t;
        if (te > step.duration_s) continue;
        const osc = 1 + 0.28 * Math.sin(2 * Math.PI * step.oscillation_hz * te);
        olculen[t] += tg.magnitude * Math.min(1, te / step.ramp_s) * osc;
      }
    }
  }
  return { beklenen, olculen, fark: olculen.map((v, t) => v - beklenen[t]), dur };
}

/** Sekil 2: pencere boyunca toplam sapmanin kanallara yuzde dagilimi. */
export function channelShares(field: DeviationField): number[] {
  const toplam = field.grid.map((satir) => satir.reduce((a, b) => a + b, 0));
  const genel = toplam.reduce((a, b) => a + b, 0) || 1;
  return toplam.map((v) => (v / genel) * 100);
}

/** Sekil 3 alt paneli: sapmanin zaman profili (yumusatilmis, 0..1). */
export function timeProfile(field: DeviationField): number[] {
  const { grid, dur } = field;
  const mean = Array.from({ length: dur }, (_, t) => {
    let s = 0;
    for (let c = 0; c < grid.length; c++) s += grid[c][t];
    return s / grid.length;
  });
  const mmax = Math.max(...mean) || 1;
  const p = mean.map((v) => v / mmax);
  for (let k = 0; k < 3; k++) {
    for (let t = 1; t < dur - 1; t++) p[t] = (p[t - 1] + p[t] + p[t + 1]) / 3;
  }
  return p;
}
