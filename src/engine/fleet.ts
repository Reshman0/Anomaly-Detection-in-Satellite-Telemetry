import { BASE_PERIOD_S, MissionClock } from './missionClock';
import { Simulation } from './simulation';
import type { Alarm } from './types';

/**
 * Filo: katalogdaki her uydunun kendi `Simulation` ornegi.
 *
 * Yer istasyonu tektir, dolayisiyla gorev saati de tektir; `Fleet` saati tutar
 * ve her karede YALNIZCA secili uyduyu yetistirir. Secilmemis uydu uykudadir,
 * kare basina maliyeti sifirdir, ama alarm/bildirim hafizasi korunur.
 *
 * Bir uydu ilk kez secildiginde ornegi dogar (600 adimlik on-doldurma). Bu
 * tembelligin bozulmamasi icin disariya yaratan bir erisimci verilmez:
 * `peek()` yaratmaz, tek yaratma kapisi `select()`tir.
 */

/**
 * Uyandirmada yeniden kurulmadan yetisilebilecek en buyuk gecikme (saniye).
 * Kazara tiklayip geri donen operator kosan senaryosunu kaybetmesin diye kisa
 * bir tolerans birakilir; bunun otesinde pencere bastan kurulur (sert resync).
 * 600x hizda 10 gorev saniyesi ~17 ms gercek sureye denk gelir, yani hizli
 * modda her gecis sert resync olur.
 */
export const RESUME_TOLERANCE_S = 10;

export interface FleetSummary {
  norad: string;
  alarms: number;
  unacked: number;
  /** En yuksek ESA-ADB onem derecesi; alarm yoksa -1. */
  worstSeverity: number;
  lastSampleT: number;
  active: boolean;
}

export class Fleet {
  readonly clock = new MissionClock();
  private sims = new Map<string, Simulation>();
  private selected: string;
  private alarmCache: { key: string; list: Alarm[] } | null = null;

  constructor(norad: string) {
    this.selected = norad;
    this.wake(norad);
  }

  get selectedNorad(): string {
    return this.selected;
  }

  get active(): Simulation {
    return this.sims.get(this.selected)!;
  }

  /** Ornegi olan (yani en az bir kez secilmis) uydu sayisi. */
  get size(): number {
    return this.sims.size;
  }

  /** Katalog rozetleri icin: ornek YARATMAZ, yoksa undefined doner. */
  peek(norad: string): Simulation | undefined {
    return this.sims.get(norad);
  }

  /** Tek yaratma kapisi. */
  select(norad: string): Simulation {
    const sim = this.wake(norad);
    this.selected = norad;
    return sim;
  }

  private wake(norad: string): Simulation {
    const existing = this.sims.get(norad);
    if (existing) {
      const behind = existing.behindS;
      if (behind > RESUME_TOLERANCE_S) {
        existing.resync(this.clock.missionT);
      } else if (behind > 0) {
        existing.catchUp(this.clock.missionT, Math.ceil(RESUME_TOLERANCE_S / BASE_PERIOD_S) + 2);
      }
      return existing;
    }
    const sim = new Simulation({ clock: this.clock, norad, startAtT: this.clock.missionT });
    this.sims.set(norad, sim);
    return sim;
  }

  /** Saati bir kez ilerletir, sonra yalnizca secili uyduyu yetistirir. */
  advance(realDtMs: number, maxSteps = 400): void {
    this.clock.advance(realDtMs);
    this.active.catchUp(this.clock.missionT, maxSteps);
  }

  /** Yalnizca ornegi olan uydular icin ozet. */
  summaries(): Map<string, FleetSummary> {
    const out = new Map<string, FleetSummary>();
    for (const [norad, sim] of this.sims) {
      out.set(norad, {
        norad,
        alarms: sim.alarmCount,
        unacked: sim.unackCount,
        worstSeverity: sim.worstSeverity,
        lastSampleT: sim.lastSampleT,
        active: norad === this.selected,
      });
    }
    return out;
  }

  /**
   * Filo genelindeki alarmlar, kimlige gore azalan (en yeni once). Kimlikler
   * modul duzeyinde tekil oldugu icin siralama uydular arasinda da dogrudur.
   * 15 Hz'de yeniden siralamamak icin sonuc onbelleklenir.
   */
  fleetAlarms(limit = 120): Alarm[] {
    let key = String(this.sims.size);
    for (const sim of this.sims.values()) {
      key += '|' + sim.norad + ':' + sim.alarms.length + ':' + (sim.alarms[0]?.id ?? 0);
    }
    if (this.alarmCache && this.alarmCache.key === key) return this.alarmCache.list;

    const all: Alarm[] = [];
    for (const sim of this.sims.values()) all.push(...sim.alarms);
    all.sort((a, b) => b.id - a.id);
    const list = all.length > limit ? all.slice(0, limit) : all;
    this.alarmCache = { key, list };
    return list;
  }
}
