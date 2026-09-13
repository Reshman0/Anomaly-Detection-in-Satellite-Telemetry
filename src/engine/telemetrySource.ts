import { MIB, PARAMETERS, decalibrate } from './mib';
import { BASE_PERIOD_S, PREFILL_S } from './missionClock';
import { hashSeed, noiseAt } from './rng';
import type { ScenarioRunner } from './scenarioRunner';
import type { MibParameter, Sample } from './types';

/**
 * Nominal seri ureteci + senaryo enjeksiyonu.
 *
 * Nominal bilesenler (yonerge §6.1): parametrenin kendi ortalamasi, varyansi,
 * AR(1) otokorelasyonu ve yorunge periyodunda yavas bir periyodik bilesen.
 * Duz beyaz gurultu kullanilmaz.
 *
 * Tum gurultu (tohum, indeks) ciftinden turetilir; ayni indeks her zaman ayni
 * degeri verir, dolayisiyla acilis gecmisi ve senaryolar tekrarlanabilirdir.
 */

export interface StepSample {
  pid: string;
  sample: Sample;
}

/**
 * Ornekleme izgarasinin ortak katsayisi: `sampling_period_s` degerlerinin
 * en kucuk ortak kati (bugun ch_58 = 4 s, digerleri 1 s). Bir kaynak keyfi bir
 * gorev saatinden baslatilirken indeks bunun katina oturtulur, boylece her
 * uyduda ayni parametre ayni fazda orneklenir.
 */
const GRID_STEPS = PARAMETERS.reduce(
  (acc, p) => lcm(acc, Math.max(1, Math.round(p.sampling_period_s / BASE_PERIOD_S))),
  1,
);

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

export interface SourceOptions {
  /**
   * Tohum tuzu — uydu NORAD'i. Ayni referans modeli (AZS-DEMO) her uyduda
   * farkli bir gurultu gerceklemesiyle kosar. Bos birakilirsa bugunku tek
   * uydulu akis birebir yeniden uretilir.
   */
  seedSalt?: string;
  /** Baslangic temel adim indeksi; `indexForEndT` ile hesaplanir. */
  startIndex?: number;
}

/** Bir parametrenin kac temel adimda bir orneklendigi. */
function periodSteps(p: MibParameter): number {
  return Math.max(1, Math.round(p.sampling_period_s / BASE_PERIOD_S));
}

function nominalEng(p: MibParameter, arValue: number, missionT: number): number {
  const s = p.sim;
  const diurnal = s.diurnal_amp * Math.sin((2 * Math.PI * missionT) / s.diurnal_period_s + s.phase);
  return s.mean + diurnal + arValue;
}

export class TelemetrySource {
  /** 1 Hz temel adim indeksi. missionT = -PREFILL_S + index * BASE_PERIOD_S */
  private index = 0;
  private ar = new Map<string, number>();
  private arSteps = new Map<string, number>();
  private seeds = new Map<string, number>();

  constructor(options: SourceOptions = {}) {
    const start = Math.max(0, Math.floor(options.startIndex ?? 0));
    this.index = start - (start % GRID_STEPS);
    const base = MIB.mission + (options.seedSalt ? ':' + options.seedSalt : '');
    for (const p of PARAMETERS) {
      this.seeds.set(p.pid, hashSeed(base + ':' + p.pid));
      this.ar.set(p.pid, 0);
      // Gurultu ornek sayacindan turetilir (noiseAt(seed, n)). Sayac indeksten
      // tohumlanmazsa ayni gorev saatine iki kez uyanmak iki farkli pencere
      // verir; boylece uyandirma gorev saatinde idempotent olur.
      this.arSteps.set(p.pid, Math.floor(this.index / periodSteps(p)));
    }
  }

  get currentIndex(): number {
    return this.index;
  }

  static missionTForIndex(index: number): number {
    return -PREFILL_S + index * BASE_PERIOD_S;
  }

  /**
   * `endT` gorev saniyesinde biten PREFILL_S uzunlugunda bir pencere uretmek
   * icin gereken baslangic indeksi. `endT = 0` bugunku acilisi birebir verir.
   */
  static indexForEndT(endT: number): number {
    return Math.max(0, Math.floor(endT / BASE_PERIOD_S));
  }

  /** Sonraki temel adimin gorev saati. */
  nextMissionT(): number {
    return TelemetrySource.missionTForIndex(this.index);
  }

  /**
   * Bir temel adim uretir. Yalnizca orneklem periyodu dolan parametreler
   * yeni ornek dondurur.
   */
  step(runner: ScenarioRunner | null): StepSample[] {
    const missionT = this.nextMissionT();
    const out: StepSample[] = [];

    for (const p of PARAMETERS) {
      if (this.index % periodSteps(p) !== 0) continue;

      // AR(1): duragan standart sapma tam olarak sim.sd olacak sekilde olceklenir.
      const n = this.arSteps.get(p.pid)!;
      const prev = this.ar.get(p.pid)!;
      const shock = p.sim.sd * Math.sqrt(1 - p.sim.ar1 * p.sim.ar1) * noiseAt(this.seeds.get(p.pid)!, n);
      const next = p.sim.ar1 * prev + shock;
      this.ar.set(p.pid, next);
      this.arSteps.set(p.pid, n + 1);

      let eng: number;
      const override = runner ? runner.aiOverride(p.pid, missionT) : null;
      if (override !== null) {
        // AI skoru senaryo tarafindan surulur; uzerine kendi gurultusu binir.
        eng = override + next * 0.55;
      } else {
        eng = nominalEng(p, next, missionT);
        const inj = runner ? runner.injection(p.pid, missionT) : null;
        if (inj && inj.delta !== 0) {
          eng += inj.delta;
          if (inj.maxAbsEng !== undefined) {
            eng = Math.max(-inj.maxAbsEng, Math.min(inj.maxAbsEng, eng));
          }
        }
      }

      if (p.sim.floor !== undefined) eng = Math.max(p.sim.floor, eng);

      out.push({ pid: p.pid, sample: { t: missionT, raw: decalibrate(p, eng), eng } });
    }

    this.index++;
    return out;
  }
}
