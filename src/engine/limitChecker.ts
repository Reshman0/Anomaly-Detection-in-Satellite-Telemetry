import { param } from './mib';
import type { LimitState, MibParameter } from './types';

/**
 * ECSS-E-ST-70-41C ST[12] On-board monitoring tarzi sabit limit kontrolu.
 *
 * Bu modul senaryo dosyasina BAKMAZ: yalnizca MIB'deki limitlerle akan degeri
 * karsilastirir. Demonun tek gercek hesaplayan bileseni budur (yonerge §6.3).
 *
 * Her parametre icin iki izleme tanimi vardir:
 *   check 1 = yumusak limit (soft), check 2 = sert limit (hard).
 * Durum degisiminde TM[12,12] Check Transition Report uretilir.
 */

/** Tekrar sayisi: bir gecisin ilan edilmesi icin gereken ardisik orneklem. */
export const REPETITION_NUMBER = 1;

export interface CheckTransition {
  pid: string;
  checkId: 1 | 2;
  from: LimitState;
  to: LimitState;
  value: number;
  raw: number | null;
  missionT: number;
}

export function evaluate(p: MibParameter, eng: number): LimitState {
  const l = p.limits;
  if (l.hard_high !== undefined && eng > l.hard_high) return 'HARD_HIGH';
  if (l.hard_low !== undefined && eng < l.hard_low) return 'HARD_LOW';
  if (l.soft_high !== undefined && eng > l.soft_high) return 'SOFT_HIGH';
  if (l.soft_low !== undefined && eng < l.soft_low) return 'SOFT_LOW';
  return 'NOMINAL';
}

export function isHard(s: LimitState): boolean {
  return s === 'HARD_HIGH' || s === 'HARD_LOW';
}

export function isSoft(s: LimitState): boolean {
  return s === 'SOFT_HIGH' || s === 'SOFT_LOW';
}

export function checkIdFor(s: LimitState): 1 | 2 {
  return isHard(s) ? 2 : 1;
}

/** ECSS ST[12] limit kontrolu durum adlari. */
export function ecssStatus(s: LimitState): string {
  switch (s) {
    case 'HARD_HIGH':
    case 'SOFT_HIGH':
      return 'ABOVE HIGH LIMIT';
    case 'HARD_LOW':
    case 'SOFT_LOW':
      return 'BELOW LOW LIMIT';
    default:
      return 'WITHIN LIMITS';
  }
}

/**
 * Ekranda gorunen durum metni. Kisa sureli bir gosterimde "yumusak/sert limit"
 * ayrimi izleyiciye bir sey anlatmadigi icin uyari/asim olarak yazilir; ok yonu
 * sapmanin yukari mi asagi mi oldugunu tasir.
 */
export function stateLabel(s: LimitState): string {
  switch (s) {
    case 'NOMINAL':
      return 'NOMİNAL';
    case 'SOFT_LOW':
      return 'UYARI ↓';
    case 'SOFT_HIGH':
      return 'UYARI ↑';
    case 'HARD_LOW':
      return 'LİMİT AŞILDI ↓';
    case 'HARD_HIGH':
      return 'LİMİT AŞILDI ↑';
  }
}

export class LimitChecker {
  private state = new Map<string, LimitState>();
  private pending = new Map<string, { to: LimitState; count: number }>();

  stateOf(pid: string): LimitState {
    return this.state.get(pid) ?? 'NOMINAL';
  }

  /** Tum parametrelerin anlik durumu. */
  snapshot(): Map<string, LimitState> {
    return new Map(this.state);
  }

  reset(): void {
    this.state.clear();
    this.pending.clear();
  }

  /** Bir orneklem isle; durum degistiyse gecis raporu dondur. */
  push(pid: string, eng: number, raw: number | null, missionT: number): CheckTransition | null {
    const p = param(pid);
    const now = evaluate(p, eng);
    const prev = this.stateOf(pid);
    if (now === prev) {
      this.pending.delete(pid);
      return null;
    }

    const pend = this.pending.get(pid);
    const count = pend && pend.to === now ? pend.count + 1 : 1;
    if (count < REPETITION_NUMBER) {
      this.pending.set(pid, { to: now, count });
      return null;
    }

    this.pending.delete(pid);
    this.state.set(pid, now);
    return {
      pid,
      checkId: checkIdFor(now === 'NOMINAL' ? prev : now),
      from: prev,
      to: now,
      value: eng,
      raw,
      missionT,
    };
  }
}

/** Bir durum kumesinin en kotusu — durum panelindeki ozet icin. */
export function worstState(states: Iterable<LimitState>): LimitState {
  let worst: LimitState = 'NOMINAL';
  for (const s of states) {
    if (isHard(s)) return s;
    if (isSoft(s)) worst = s;
  }
  return worst;
}
