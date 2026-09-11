/** Saglam istatistik yardimcilari — medyan ve MAD tabanli taban cizgisi. */

export function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface RobustBaseline {
  baseline: number;
  /** MAD * 1.4826 — normal dagilim icin sigma esdegeri. */
  sigma: number;
}

export function robustBaseline(ref: number[]): RobustBaseline {
  const baseline = median(ref);
  const mad = median(ref.map((v) => Math.abs(v - baseline)));
  return { baseline, sigma: Math.max(1e-6, 1.4826 * mad) };
}
