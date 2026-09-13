import type { Alarm } from '../engine/types';

/**
 * ESA-ADB onem derecesi 0..3 icin ortak renk tablosu.
 *
 * Alarm kuyrugu ile uydu katalogu ayni siddeti ayni renkle gostersin diye
 * burada durur. Sinif adlari birebir yazilir: Tailwind yalnizca kaynakta
 * harfi harfine gecen sinif adlarini uretir, birlestirilerek kurulanlari degil.
 */
export const SEVERITY = [
  { label: 'bilgi', text: 'text-ops-nominal', borderL: 'border-l-ops-nominal', bg: '', dot: 'bg-ops-nominal' },
  { label: 'düşük', text: 'text-ops-soft', borderL: 'border-l-ops-soft', bg: '', dot: 'bg-ops-soft' },
  { label: 'orta', text: 'text-ops-warn', borderL: 'border-l-ops-warn', bg: 'bg-ops-warn/[0.06]', dot: 'bg-ops-warn' },
  { label: 'yüksek', text: 'text-ops-hard', borderL: 'border-l-ops-hard', bg: 'bg-ops-hard/[0.09]', dot: 'bg-ops-hard' },
] as const;

export type SeverityStyle = (typeof SEVERITY)[number];

/** Onem derecesini 0..3 araligina kelepceleyip tablodan okur. */
export function severityStyle(severity: number): SeverityStyle {
  return SEVERITY[Math.max(0, Math.min(3, severity))];
}

export function sev(a: Alarm): SeverityStyle {
  return severityStyle(a.severity);
}
