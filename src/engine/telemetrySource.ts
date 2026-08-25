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

const seeds = new Map<string, number>();
for (const p of PARAMETERS) seeds.set(p.pid, hashSeed(MIB.mission + ':' + p.pid));

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

  constructor() {
    for (const p of PARAMETERS) {
      this.ar.set(p.pid, 0);
      this.arSteps.set(p.pid, 0);
    }
  }

  get currentIndex(): number {
    return this.index;
  }

  static missionTForIndex(index: number): number {
    return -PREFILL_S + index * BASE_PERIOD_S;
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
      const periodSteps = Math.max(1, Math.round(p.sampling_period_s / BASE_PERIOD_S));
      if (this.index % periodSteps !== 0) continue;

      // AR(1): duragan standart sapma tam olarak sim.sd olacak sekilde olceklenir.
      const n = this.arSteps.get(p.pid)!;
      const prev = this.ar.get(p.pid)!;
      const shock = p.sim.sd * Math.sqrt(1 - p.sim.ar1 * p.sim.ar1) * noiseAt(seeds.get(p.pid)!, n);
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
