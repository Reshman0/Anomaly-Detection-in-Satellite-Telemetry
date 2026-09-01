import type { LimitState } from '../engine/types';

/**
 * Durum renkleri.
 *
 * Palet, LIFT UP sunum sablonunun (2025-2026 LIFT UP SUNUM SABLONU.pptx) kendi
 * renklerinden turetildi ki konsol ile slaytlar ayni aileden gorunsun:
 *   lacivert zemin  #082549 / #1A2433
 *   LIFT UP kirmizisi #C23735 / #DD140D
 *   altin           #D6A361
 *   yesil           #449E4A
 *   acik griler     #D9DEE5 / #ADB4C9 / #4A5560
 *   mor (accent6)   #3E2A56
 *
 * `ai` rengi accent6'nin acilmis halidir: sablona ait, ama koyu lacivert
 * zeminde okunacak parlaklikta. Mor ayrimi demonun ana mesajini tasir
 * (AI alarmi / limit alarmi), baska bir role verilmemelidir.
 *
 * DIKKAT: bu tablo `tailwind.config.js` ile birebir ayni kalmalidir.
 */
export const COLOR = {
  bg: '#071A2E',
  panel: '#0D2842',
  sunken: '#05121F',
  line: '#17385A',
  line2: '#255081',
  text: '#D9DEE5',
  dim: '#ADB4C9',
  faint: '#5C6B80',
  nominal: '#449E4A',
  soft: '#D6A361',
  hard: '#C23735',
  ai: '#9B7ACF',
  aiDim: '#3E2A56',
} as const;

export function stateHex(s: LimitState): string {
  switch (s) {
    case 'HARD_LOW':
    case 'HARD_HIGH':
      return COLOR.hard;
    case 'SOFT_LOW':
    case 'SOFT_HIGH':
      return COLOR.soft;
    default:
      return COLOR.nominal;
  }
}

export function stateTextClass(s: LimitState): string {
  switch (s) {
    case 'HARD_LOW':
    case 'HARD_HIGH':
      return 'text-ops-hard';
    case 'SOFT_LOW':
    case 'SOFT_HIGH':
      return 'text-ops-soft';
    default:
      return 'text-ops-nominal';
  }
}

/** rgba yardimci: sabit renkleri saydamlastirir. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
