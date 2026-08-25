import type { LimitState } from '../engine/types';

/** Durum renkleri (yonerge §8). AI kaynakli alarm limit kaynaklidan renkle ayrilir. */
export const COLOR = {
  bg: '#0E1419',
  panel: '#141C23',
  sunken: '#0B1014',
  line: '#1E2A33',
  line2: '#2A3A45',
  text: '#C8D6DF',
  dim: '#788B98',
  faint: '#4A5B66',
  nominal: '#2FBF87',
  soft: '#D9A02B',
  hard: '#E24A5F',
  ai: '#A184F5',
  aiDim: '#6B54B0',
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
