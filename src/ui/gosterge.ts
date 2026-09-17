import type { MibParameter } from '../engine/types';

/**
 * Deger araligi ve limit bolgeleri — telemetri seridi ile ozet panosundaki
 * yatay gosterge ayni olcegi kullanir. Saf modul (DOM yok, store yok).
 */

/** Serit / gosterge araligi: sert limit bandinin biraz disi. */
export function valueRange(p: MibParameter): [number, number] {
  const l = p.limits;
  const hi = l.hard_high ?? 5;
  const lo = l.hard_low ?? 0;
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

export type ZoneKind = 'hard' | 'soft' | 'nominal';

export interface GaugeZone {
  /** 0..1, soldan saga. */
  from: number;
  to: number;
  kind: ZoneKind;
}

/** Degerin gosterge uzerindeki yeri, 0..1'e kelepcelenir. */
export function gaugeFrac(p: MibParameter, v: number): number {
  const [lo, hi] = valueRange(p);
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

/**
 * Gostergenin bolgeleri, soldan saga, araligi bosluksuz kaplar. Tanimsiz bir
 * limit (AI skorlarinda alt limit yok) o bolgeyi uretmez; komsu bolge uzar.
 */
export function gaugeZones(p: MibParameter): GaugeZone[] {
  const l = p.limits;
  const [lo, hi] = valueRange(p);
  const f = (v: number) => (v - lo) / (hi - lo);
  const cuts: [number, ZoneKind][] = [];
  // Her kesim noktasi, kendisinden SONRA baslayan bolgenin turunu tasir.
  if (l.hard_low !== undefined) cuts.push([f(l.hard_low), l.soft_low !== undefined ? 'soft' : 'nominal']);
  if (l.soft_low !== undefined) cuts.push([f(l.soft_low), 'nominal']);
  if (l.soft_high !== undefined) cuts.push([f(l.soft_high), 'soft']);
  if (l.hard_high !== undefined) cuts.push([f(l.hard_high), 'hard']);

  const first: ZoneKind = l.hard_low !== undefined ? 'hard' : l.soft_low !== undefined ? 'soft' : 'nominal';
  const out: GaugeZone[] = [];
  let at = 0;
  let kind = first;
  for (const [cut, next] of cuts) {
    if (cut > at) out.push({ from: at, to: cut, kind });
    at = Math.max(at, cut);
    kind = next;
  }
  if (at < 1) out.push({ from: at, to: 1, kind });
  return out;
}
