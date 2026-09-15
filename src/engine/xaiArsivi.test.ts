import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { SCENARIOS, type Scenario } from './scenarioRunner';

/**
 * Alarm detayindaki XAI sekmesi kosu arsivinden okur. Canli `xai` yeni
 * senaryoda temizlenir; arsiv eski alarmin kanitlarini tutmali.
 */
function senaryo(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error('senaryo yok: ' + id);
  return s;
}

function kos(sim: Simulation, saniye: number): void {
  for (let i = 0; i < saniye; i++) sim.advance(1000);
}

describe('XAI kosu arsivi', () => {
  it('yeni anomali enjekte edilince eski alarmin kanitlari kaybolmaz', () => {
    const sim = new Simulation();
    sim.startScenario(senaryo('point'));
    const ilkBaslangic = sim.scenarioStartT;
    kos(sim, 100);
    const eskiAlarm = sim.alarms.find((a) => a.scenarioId === 'point')!;
    expect(eskiAlarm).toBeDefined();
    expect(sim.xaiRunFor(eskiAlarm.id)?.evidence).toHaveLength(3);

    sim.startScenario(senaryo('drift'));
    expect(sim.xai).toHaveLength(0);
    kos(sim, 100);

    const eski = sim.xaiRunFor(eskiAlarm.id)!;
    expect(eski.scenarioId).toBe('point');
    expect(eski.startT).toBe(ilkBaslangic);
    expect(eski.evidence.map((e) => e.level)).toEqual([1, 2, 3]);
    expect(eski.evidence.every((e) => e.asset.startsWith('xai/specae'))).toBe(true);

    const yeniAlarm = sim.alarms.find((a) => a.scenarioId === 'drift')!;
    expect(sim.xaiRunFor(yeniAlarm.id)?.scenarioId).toBe('drift');
    expect(sim.xaiRunFor(yeniAlarm.id)).not.toBe(eski);
  });

  it('ayni senaryonun iki kosusu ayri kayit ve kosu numarasi alir', () => {
    const sim = new Simulation();
    sim.startScenario(senaryo('point'));
    kos(sim, 100);
    const a1 = sim.alarms.find((a) => a.scenarioId === 'point')!;
    sim.startScenario(senaryo('point'));
    kos(sim, 100);
    const a2 = sim.alarms.find((a) => a.scenarioId === 'point')!;
    expect(a2.id).not.toBe(a1.id);
    expect(sim.xaiRunFor(a1.id)?.runNo).toBe(1);
    expect(sim.xaiRunFor(a2.id)?.runNo).toBe(2);
    expect(sim.xaiRunFor(a2.id)!.startT).toBeGreaterThan(sim.xaiRunFor(a1.id)!.startT);
  });

  it('senaryo disinda dusen alarmin kaydi yok; sifirlama arsivi temizler', () => {
    const sim = new Simulation();
    sim.startScenario(senaryo('collective'));
    kos(sim, 100);
    const id = sim.alarms[0].id;
    expect(sim.xaiRunFor(id)).not.toBeNull();
    expect(sim.xaiRunFor(-1)).toBeNull();
    sim.resetAll();
    expect(sim.xaiRuns).toHaveLength(0);
    expect(sim.xaiRunFor(id)).toBeNull();
  });
});
