import { PARAMETERS, param } from './mib';
import { targetPid } from './scenarioRunner';
import type { Simulation } from './simulation';
import type { StructuralBreak } from './types';

/**
 * INFO panelinin asamasi — senaryonun basladigina degil, konsolun GERCEKTEN
 * ne tespit ettigine bakar. Boylece panel seritler, alarm kuyrugu ve XAI ile
 * ayni anda ayni seyi soyler:
 *
 *   0 IZLEME       hicbir tespit yok (kirilma yok, AI < 3σ, ST[12] sessiz)
 *   1 SUPHE        CUSUM kirilmasi VEYA AI skoru >= 3σ VEYA ST[12] gecisi
 *                  -> tespit gercekleri + imza kutuphanesinden eslesme adayi + gecmis
 *   2 DOGRULANDI   AI skoru >= 5σ (sert esik)
 *                  -> olasi neden + ONERI
 */
export type InfoStage = 0 | 1 | 2;

export interface StageInfo {
  stage: InfoStage;
  targetPid: string | null;
  aiPid: string | null;
  aiDetectT: number | null;
  aiConfirmT: number | null;
  st12T: number | null;
  brk: StructuralBreak | null;
  /** Asamayi tetikleyen ilk gercek: kirilma / AI / ST[12]. */
  trigger: 'break' | 'ai' | 'st12' | null;
}

export function deriveStage(sim: Simulation): StageInfo {
  const sc = sim.activeScenario;
  const startT = sim.scenarioStartT;
  const empty: StageInfo = { stage: 0, targetPid: null, aiPid: null, aiDetectT: null, aiConfirmT: null, st12T: null, brk: null, trigger: null };
  if (!sc || startT === null) return empty;

  const pid = targetPid(sc);
  if (!pid) return empty;
  const sub = param(pid).subsystem;
  const ai = PARAMETERS.find((q) => q.derived && q.pid === 'AI_SCORE_' + sub) ?? null;
  const soft = ai?.limits.soft_high ?? 3;
  const hard = ai?.limits.hard_high ?? 5;
  const aiBuf = ai ? (sim.buffers.get(ai.pid) ?? []).filter((s) => s.t >= startT) : [];
  const aiDetectT = aiBuf.find((s) => s.eng >= soft)?.t ?? null;
  const aiConfirmT = aiBuf.find((s) => s.eng >= hard)?.t ?? null;

  const st12 = sim.alarms
    .filter((a) => a.source === 'ST12_LIMIT' && a.pid === pid && a.missionT >= startT && a.transition && a.transition.to !== 'NOMINAL')
    .map((a) => a.missionT);
  const st12T = st12.length ? Math.min(...st12) : null;
  const brk = sim.structuralBreak && sim.structuralBreak.pid === pid ? sim.structuralBreak : null;

  const candidates: [number, StageInfo['trigger']][] = [];
  if (brk) candidates.push([brk.detectedT, 'break']);
  if (aiDetectT !== null) candidates.push([aiDetectT, 'ai']);
  if (st12T !== null) candidates.push([st12T, 'st12']);
  candidates.sort((a, b) => a[0] - b[0]);
  const trigger = candidates.length ? candidates[0][1] : null;

  const stage: InfoStage = aiConfirmT !== null ? 2 : trigger ? 1 : 0;
  return { stage, targetPid: pid, aiPid: ai?.pid ?? null, aiDetectT, aiConfirmT, st12T, brk, trigger };
}
