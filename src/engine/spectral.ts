/**
 * Kucuk spektral yardimcilar — DOM'suz, testlenebilir.
 * 1 Hz orneklenmis telemetri icin kisa zamanli Fourier donusumu (STFT).
 * Pencere 32 s -> Nyquist 0.5 Hz, 17 frekans bin'i, cozunurluk 1/32 Hz.
 */

export function hann(n: number): number[] {
  const w: number[] = [];
  for (let i = 0; i < n; i++) w.push(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/** Gercek girdi icin dogrudan DFT gucu, bin 0..N/2. N kucuk oldugu icin FFT gerekmez. */
export function dftPower(x: number[]): number[] {
  const n = x.length;
  const out: number[] = [];
  for (let k = 0; k <= n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (-2 * Math.PI * k * i) / n;
      re += x[i] * Math.cos(a);
      im += x[i] * Math.sin(a);
    }
    out.push((re * re + im * im) / (n * n));
  }
  return out;
}

export interface Stft {
  /** Her sutunun pencere merkezi (orneklem indeksi). */
  times: number[];
  /** Hz. */
  freqs: number[];
  /** power[timeIdx][freqIdx] */
  power: number[][];
}

/**
 * removeMean: her pencerenin ortalamasi cikarilir (AC spektrogrami). Surekli
 * kayma (DC) salinimi ezmesin diye kullanilir; DC ayri hesaplanir.
 */
export function stft(series: number[], win = 32, hop = 2, fs = 1, removeMean = false): Stft {
  const w = hann(win);
  const times: number[] = [];
  const power: number[][] = [];
  for (let start = 0; start + win <= series.length; start += hop) {
    const raw = series.slice(start, start + win);
    const mean = removeMean ? raw.reduce((a, b) => a + b, 0) / raw.length : 0;
    const seg = raw.map((v, i) => (v - mean) * w[i]);
    power.push(dftPower(seg));
    times.push(start + win / 2);
  }
  const freqs: number[] = [];
  for (let k = 0; k <= win / 2; k++) freqs.push((k * fs) / win);
  return { times, freqs, power };
}

/** "0.02–0.08 Hz", "0.15-0.45 Hz" gibi metinleri [lo, hi] olarak coz. */
export function parseBand(s?: string): [number, number] | null {
  if (!s) return null;
  const m = s.replace(',', '.').match(/([\d.]+)\s*[–\-]\s*([\d.]+)/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return [lo, hi];
}

export interface Peak {
  freq: number;
  timeIdx: number;
  freqIdx: number;
  power: number;
}

/** Spektrogramdaki en guclu hucre. minBin=1 verilirse DC atlanir. */
export function peak(st: Stft, minBin = 0): Peak | null {
  let best: Peak | null = null;
  st.power.forEach((col, ti) => {
    col.forEach((p, fi) => {
      if (fi < minBin) return;
      if (!best || p > best.power) best = { freq: st.freqs[fi], timeIdx: ti, freqIdx: fi, power: p };
    });
  });
  return best;
}

/** Bir sutunun tepe/ortalama orani (minBin'den itibaren). Dusukse genis bantli (sicrama). */
export function crestRatio(col: number[], minBin = 1): number {
  const v = col.slice(minBin);
  if (v.length === 0) return 0;
  const max = Math.max(...v);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return mean > 0 ? max / mean : 0;
}

/** Her pencerenin ortalamasi — DC satiri icin. */
export function windowMeans(series: number[], win = 32, hop = 2): number[] {
  const out: number[] = [];
  for (let start = 0; start + win <= series.length; start += hop) {
    const raw = series.slice(start, start + win);
    out.push(raw.reduce((a, b) => a + b, 0) / raw.length);
  }
  return out;
}
