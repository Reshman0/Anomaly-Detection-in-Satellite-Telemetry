import type { LimitState } from '../engine/types';
import { buildPalette, DEFAULT_A11Y, type Palette } from './a11y';

/**
 * Durum renkleri (yonerge §8). AI kaynakli alarm limit kaynaklidan renkle ayrilir.
 *
 * CANLI PALET: nesne degistirilebilir; erisilebilirlik ayari degisince
 * `setPalette` alanlari yerinde gunceller. Canvas cizimleri her karede
 * COLOR.x okudugu icin yeni palet bir sonraki karede gorunur. Tailwind
 * siniflari ayni paleti CSS degiskenlerinden alir (index.css `:root`).
 */
export const COLOR: Palette = { ...buildPalette(DEFAULT_A11Y) };

/** Palet her degistiginde artar; three.js malzemeleri gibi bir kez kurulan renkler bunu izler. */
let paletteVersion = 0;
export function getPaletteVersion(): number {
  return paletteVersion;
}

export function setPalette(p: Palette): void {
  Object.assign(COLOR, p);
  paletteVersion++;
}

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
