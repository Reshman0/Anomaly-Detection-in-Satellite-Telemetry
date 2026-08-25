import { MIB } from './mib';

export const SPEED_OPTIONS = [1, 60, 600] as const;
export type Speed = (typeof SPEED_OPTIONS)[number];

/** Uygulama acilirken seritlerde gorunecek gecmis (§5): 10 dakika. */
export const PREFILL_S = 600;

/** Telemetri temel orneklem periyodu (saniye). */
export const BASE_PERIOD_S = 1;

const EPOCH_MS = Date.parse(MIB.epoch);

/**
 * Duvar saatinden bagimsiz gorev saati.
 * `missionT` saniye cinsinden, 0 = gorev epogu. Onceden doldurulmus tampon
 * icin -PREFILL_S .. 0 araligi da uretilir.
 */
export class MissionClock {
  missionT = 0;
  speed: Speed = 1;

  /** Gercek gecen sureyi (ms) gorev saatine cevirir. */
  advance(realDtMs: number): void {
    this.missionT += (realDtMs / 1000) * this.speed;
  }

  setSpeed(s: Speed): void {
    this.speed = s;
  }

  utcMs(): number {
    return EPOCH_MS + this.missionT * 1000;
  }

  /** Uydu ustu zaman: yer zamanindan sabit ofset kadar kaymis (zaman korelasyonu). */
  obtMs(): number {
    return this.utcMs() + MIB.obt_offset_s * 1000;
  }
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return (
    String(d.getUTCHours()).padStart(2, '0') +
    ':' +
    String(d.getUTCMinutes()).padStart(2, '0') +
    ':' +
    String(d.getUTCSeconds()).padStart(2, '0')
  );
}

export function fmtTimeMs(ms: number): string {
  const d = new Date(ms);
  return fmtTime(ms) + '.' + String(d.getUTCMilliseconds()).padStart(3, '0');
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return (
    d.getUTCFullYear() +
    '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

/** Gun-basi-saniye cinsinden gun-ici konum (nominal periyodik bilesen icin). */
export function secondsOfDay(ms: number): number {
  return (ms / 1000) % 86400;
}

export function fmtCountdown(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + 's ' + String(m).padStart(2, '0') + 'd';
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}
