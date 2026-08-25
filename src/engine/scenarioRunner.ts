import nominalJson from '../data/scenario_nominal.json';
import driftJson from '../data/scenario_drift.json';
import pointJson from '../data/scenario_point.json';
import collectiveJson from '../data/scenario_collective.json';
import { param } from './mib';
import { BASE_PERIOD_S } from './missionClock';

export type ScenarioStep =
  | { t: number; type: 'inject_drift'; pid: string; duration_s: number; magnitude: number; max_abs_eng?: number }
  | { t: number; type: 'inject_point'; pid: string; magnitude: number; width_s: number }
  | {
      t: number;
      type: 'inject_collective';
      duration_s: number;
      ramp_s: number;
      oscillation_hz: number;
      max_abs_eng?: number;
      targets: { pid: string; magnitude: number }[];
    }
  | { t: number; type: 'ai_score'; pid: string; value: number }
  | {
      t: number;
      type: 'event';
      service: [number, number];
      severity: number;
      pid: string;
      text: string;
      model?: string;
      confidence?: number;
    }
  | {
      t: number;
      type: 'show_xai';
      level: 1 | 2 | 3;
      asset: string;
      caption: string;
      model: string;
      top_channels: string[];
      band?: string;
    };

export interface Scenario {
  id: string;
  name: string;
  button: string;
  description: string;
  model: string;
  duration_s: number;
  timeline: ScenarioStep[];
}

export const SCENARIOS: Scenario[] = [
  pointJson as Scenario,
  driftJson as Scenario,
  collectiveJson as Scenario,
];

export const NOMINAL_SCENARIO = nominalJson as Scenario;

/** Senaryo konsolundaki siddet kaydiricisi (5 kademe). */
export const SEVERITY_STEPS = [0.7, 0.85, 1.0, 1.15, 1.3] as const;
export const DEFAULT_SEVERITY_INDEX = 2;

/** Senaryo bittikten sonra enjeksiyon ve AI skorunun nominale donme suresi. */
const RELEASE_S = 30;
/** AI skorunun ilk kilometre tasina yumusak giris suresi. */
const AI_RAMP_IN_S = 10;

export interface InjectionResult {
  delta: number;
  maxAbsEng?: number;
}

/**
 * Senaryo zaman cizelgesini gorev saatine gore yurutur.
 * `t` degerleri saniye, senaryonun baslatildigi ana goredir.
 */
export class ScenarioRunner {
  readonly scenario: Scenario;
  readonly startMissionT: number;
  readonly severityMul: number;
  private fired = new Set<number>();

  constructor(scenario: Scenario, startMissionT: number, severityIndex: number) {
    this.scenario = scenario;
    // Baslangic ani orneklem izgarasina oturtulur. Aksi halde enjeksiyon sekli
    // kesirli bir ofsetle orneklenir ve ayni butona basmak farkli bir anomali
    // uretir; kabul kriteri §10 determinizmi bunu yasaklar.
    this.startMissionT = Math.ceil(startMissionT / BASE_PERIOD_S) * BASE_PERIOD_S;
    this.severityMul = SEVERITY_STEPS[severityIndex] ?? 1;
  }

  elapsed(missionT: number): number {
    return missionT - this.startMissionT;
  }

  /** 0..1 arasi ilerleme (yalnizca zaman cizelgesi suresi icin). */
  progress(missionT: number): number {
    if (this.scenario.duration_s <= 0) return 1;
    return Math.max(0, Math.min(1, this.elapsed(missionT) / this.scenario.duration_s));
  }

  /** Enjeksiyonlar ve skor gecersiz kilmalari da dahil tamamen bitti mi? */
  isFinished(missionT: number): boolean {
    return this.elapsed(missionT) > this.scenario.duration_s + RELEASE_S;
  }

  /** Zamani gelmis ve daha once tetiklenmemis event/show_xai adimlarini dondurur. */
  due(missionT: number): ScenarioStep[] {
    const te = this.elapsed(missionT);
    const out: ScenarioStep[] = [];
    this.scenario.timeline.forEach((step, i) => {
      if (step.type !== 'event' && step.type !== 'show_xai') return;
      if (this.fired.has(i) || step.t > te) return;
      this.fired.add(i);
      out.push(step);
    });
    return out;
  }

  /** Senaryo sonrasi serbest birakma zarfi: 1 -> 0. */
  private releaseEnvelope(te: number): number {
    const over = te - this.scenario.duration_s;
    if (over <= 0) return 1;
    return Math.max(0, 1 - over / RELEASE_S);
  }

  /** Bir parametreye uygulanacak toplam enjeksiyon sapmasi. */
  injection(pid: string, missionT: number): InjectionResult {
    const te = this.elapsed(missionT);
    let delta = 0;
    let maxAbsEng: number | undefined;
    const release = this.releaseEnvelope(te);

    for (const step of this.scenario.timeline) {
      if (step.type === 'inject_drift') {
        if (step.pid !== pid) continue;
        const dt = te - step.t;
        if (dt < 0) continue;
        const ramp = Math.min(1, dt / step.duration_s);
        delta += step.magnitude * this.severityMul * ramp * release;
        if (step.max_abs_eng !== undefined) maxAbsEng = step.max_abs_eng;
      } else if (step.type === 'inject_point') {
        if (step.pid !== pid) continue;
        const dt = te - step.t;
        if (dt < -1 || dt > step.width_s + 1) continue;
        // Tek orneklem tepe + iki omuz: sivri ama gercekci bir nokta anomalisi.
        const centre = step.width_s / 3;
        const sigma = step.width_s / 4.3;
        delta += step.magnitude * this.severityMul * Math.exp(-0.5 * Math.pow((dt - centre) / sigma, 2));
      } else if (step.type === 'inject_collective') {
        const target = step.targets.find((x) => x.pid === pid);
        if (!target) continue;
        const dt = te - step.t;
        if (dt < 0) continue;
        const ramp = Math.min(1, dt / step.ramp_s);
        const tail = dt > step.duration_s ? Math.max(0, 1 - (dt - step.duration_s) / RELEASE_S) : 1;
        const osc = 1 + 0.35 * Math.sin(2 * Math.PI * step.oscillation_hz * dt);
        delta += target.magnitude * this.severityMul * ramp * tail * osc * release;
        if (step.max_abs_eng !== undefined) maxAbsEng = step.max_abs_eng;
      }
    }
    return { delta, maxAbsEng };
  }

  /**
   * AI skoru kilometre taslari arasinda dogrusal ara deger.
   * Senaryo disinda `null` doner ve parametre kendi nominal profilinde akar.
   */
  aiOverride(pid: string, missionT: number): number | null {
    const wps = this.scenario.timeline.filter(
      (s): s is Extract<ScenarioStep, { type: 'ai_score' }> => s.type === 'ai_score' && s.pid === pid,
    );
    if (wps.length === 0) return null;

    const te = this.elapsed(missionT);
    const base = param(pid).sim.mean;
    const scaled = (v: number) => base + (v - base) * this.severityMul;

    const first = wps[0];
    if (te < first.t - AI_RAMP_IN_S) return null;
    if (te < first.t) {
      const f = (te - (first.t - AI_RAMP_IN_S)) / AI_RAMP_IN_S;
      return base + (scaled(first.value) - base) * f;
    }

    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i];
      const b = wps[i + 1];
      if (te >= a.t && te <= b.t) {
        const f = b.t === a.t ? 1 : (te - a.t) / (b.t - a.t);
        return scaled(a.value) + (scaled(b.value) - scaled(a.value)) * f;
      }
    }

    const last = wps[wps.length - 1];
    const holdUntil = this.scenario.duration_s;
    if (te <= holdUntil) return scaled(last.value);
    const f = Math.max(0, 1 - (te - holdUntil) / RELEASE_S);
    return base + (scaled(last.value) - base) * f;
  }
}
