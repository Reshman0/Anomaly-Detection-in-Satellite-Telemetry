import { median, robustBaseline } from './robust';
import type { Sample } from './types';

/**
 * Yapisal kirilma (structural break) tespiti — beyazlatilmis iki yonlu CUSUM
 * + baslangic keskinlestirme.
 *
 * Telemetri otokorelasyonludur (AR(1), phi ~ 0.9). Ham seride CUSUM sik
 * yanlis alarm verir; bu yuzden seri yenilik (innovation) serisine cevrilir:
 *   e_t = (x_t - b) - phi * (x_{t-1} - b)
 * ve CUSUM z = e / sigma_e uzerinde kosar:
 *   S+ = max(0, S+ + z - k),  S- = max(0, S- - z - k);  biri h'yi asinca tespit.
 *
 * Nominal model (sigma, phi, sigma_e) ya `model` ile disaridan verilir — gercek
 * sistemlerde oldugu gibi uzun temiz gecmisten cevrimdisi kestirilmis — ya da
 * pencere oncesi referanstan kestirilir. Taban cizgisi her zaman pencere
 * oncesi referansin medyanidir (yavas gunluk/yorunge bilesenini izler).
 *
 * Baslangic ani: tespit anina kadar HAM z uzerinde "0, sonra dogrusal"
 * modeli her aday icin uydurulur; en kucuk hata kareleri toplami kazanir.
 *
 * Senaryo dosyasina bakmaz; yalnizca veriyi okur.
 */

export interface NominalModel {
  sigma: number;
  phi: number;
  sigmaE: number;
}

export interface BreakResult {
  breakT: number;
  detectedT: number;
  direction: 1 | -1;
  /** Kirilma sonrasi ortalama ham sapma (nominal sigma birimi). */
  magnitudeSigma: number;
  phi: number;
}

export interface BreakOptions {
  winS: number;
  /** Taban cizgisi (ve model verilmediyse sigma/phi) icin pencere oncesi referans uzunlugu. */
  refS: number;
  startAfterT?: number;
  model?: NominalModel;
  k: number;
  h: number;
}

/**
 * k = 0.6, h = 6: Siegmund yaklasimiyla tek yonlu ARL0 ~ 7500, iki yonlu ~ 3800
 * orneklem -> 120 s senaryo penceresinde yanlis alarm ~%3. k=0.75 daha guvenli
 * ama beyazlatma seviye kaymasini (1-phi)*shift/sigma_e'ye indirdigi icin
 * phi ~ 0.9'da 1 sigma'lik kaymalar kaciriliyordu.
 */
export const DEFAULT_BREAK_OPTIONS: BreakOptions = { winS: 120, refS: 240, k: 0.6, h: 6 };

function lag1(v: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < v.length; i++) {
    den += v[i] * v[i];
    if (i > 0) num += v[i] * v[i - 1];
  }
  if (den === 0) return 0;
  return Math.max(0, Math.min(0.97, num / den));
}

/** Temiz bir seriden nominal model: saglam sigma, AR(1) phi, yenilik sigmasi. */
export function fitNominal(values: number[]): NominalModel {
  const { baseline, sigma } = robustBaseline(values);
  const c = values.map((v) => v - baseline);
  const phi = lag1(c);
  const innov: number[] = [];
  for (let i = 1; i < c.length; i++) innov.push(c[i] - phi * c[i - 1]);
  return { sigma, phi, sigmaE: Math.max(1e-6, robustBaseline(innov).sigma) };
}

/** Tespit indeksine kadar "0, sonra dogrusal" modelini en iyi aciklayan baslangic indeksi. */
function refineOnset(z: number[], detectIdx: number): number {
  let bestIdx = 0;
  let bestSse = Infinity;
  let prefixSq = 0;
  for (let tau = 0; tau <= detectIdx; tau++) {
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let j = tau; j <= detectIdx; j++) {
      const x = j - tau + 1;
      sxy += x * z[j];
      sxx += x * x;
      syy += z[j] * z[j];
    }
    const b = sxx > 0 ? Math.max(0, sxy / sxx) : 0;
    const sse = prefixSq + (syy - 2 * b * sxy + b * b * sxx);
    if (sse < bestSse - 1e-9) {
      bestSse = sse;
      bestIdx = tau;
    }
    prefixSq += z[tau] * z[tau];
  }
  return bestIdx;
}

export function detectBreak(samples: Sample[], endT: number, opts: Partial<BreakOptions> = {}): BreakResult | null {
  const o = { ...DEFAULT_BREAK_OPTIONS, ...opts };
  const startT = Math.max(endT - o.winS, o.startAfterT ?? -Infinity);
  const refIdx: number[] = [];
  const winIdx: number[] = [];
  samples.forEach((s, i) => {
    if (s.t >= startT - o.refS && s.t < startT) refIdx.push(i);
    else if (s.t >= startT && s.t <= endT) winIdx.push(i);
  });
  if (refIdx.length < 10 || winIdx.length < 5) return null;

  const refVals = refIdx.map((i) => samples[i].eng);
  const baseline = median(refVals);
  const model = o.model ?? fitNominal(refVals);
  const { sigma, phi, sigmaE } = model;

  const prevOf = (k: number) => (k > 0 ? samples[k - 1].eng - baseline : 0);
  const z = winIdx.map((i) => ((samples[i].eng - baseline) - phi * prevOf(i)) / sigmaE);

  let sPlus = 0;
  let sMinus = 0;
  for (let i = 0; i < z.length; i++) {
    sPlus = Math.max(0, sPlus + z[i] - o.k);
    sMinus = Math.max(0, sMinus - z[i] - o.k);
    if (sPlus > o.h || sMinus > o.h) {
      const direction: 1 | -1 = sPlus > o.h ? 1 : -1;
      const rawZ = winIdx.slice(0, i + 1).map((k) => ((samples[k].eng - baseline) / sigma) * direction);
      const from = refineOnset(rawZ, i);
      const rawAfter = rawZ.slice(from);
      const magnitudeSigma = Math.abs(rawAfter.reduce((a, b) => a + b, 0) / rawAfter.length);
      return { breakT: samples[winIdx[from]].t, detectedT: samples[winIdx[i]].t, direction, magnitudeSigma, phi };
    }
  }
  return null;
}
