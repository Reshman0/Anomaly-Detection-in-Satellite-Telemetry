import { beforeEach, describe, expect, it } from 'vitest';
import { useConsole } from './store';
import { NOMINAL_SCENARIO, SCENARIOS, type Scenario } from './engine/scenarioRunner';
import { Simulation } from './engine/simulation';

function scenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error('senaryo yok: ' + id);
  return s;
}

/** Senaryoda `show_xai` adimlarinin gorev saniyesi ve seviyesi. */
function xaiSteps(sc: Scenario): Array<{ t: number; level: 1 | 2 | 3 }> {
  return sc.timeline
    .filter((s): s is Extract<typeof s, { type: 'show_xai' }> => s.type === 'show_xai')
    .map((s) => ({ t: s.t, level: s.level }))
    .sort((a, b) => a.t - b.t);
}

/** Her test kendi Simulation'i ile baslasin; store tekil bir nesne. */
beforeEach(() => {
  useConsole.setState({
    sim: new Simulation(),
    version: 0,
    speed: 1,
    selectedAlarmId: null,
    xaiLevel: 1,
    lastXaiSeq: 0,
  });
});

describe('XAI seviye ilerlemesi', () => {
  it('surukleme senaryosunda uc seviye sirayla kendiliginden acilir', () => {
    const sc = scenario('drift');
    const adimlar = xaiSteps(sc);
    expect(adimlar.map((a) => a.level)).toEqual([1, 2, 3]);

    const g = useConsole.getState;
    g().runScenario(sc);
    expect(g().xaiLevel).toBe(1);

    const gorulen: Array<{ t: number; level: number }> = [];
    let onceki = g().xaiLevel;
    for (let t = 1; t <= sc.duration_s; t++) {
      g().tick(1000);
      if (g().xaiLevel !== onceki) {
        onceki = g().xaiLevel;
        gorulen.push({ t, level: onceki });
      }
    }

    // Panel 2. ve 3. seviyeye kendiliginden gecmis olmali.
    expect(gorulen.map((x) => x.level)).toEqual([2, 3]);
    expect(g().xaiLevel).toBe(3);
    expect(g().sim.xai).toHaveLength(3);

    // Gecisler kanitin geldigi anda olmali (bir gorev saniyesi tolerans).
    for (const g2 of gorulen) {
      const adim = adimlar.find((a) => a.level === g2.level);
      expect(adim).toBeDefined();
      expect(Math.abs(g2.t - adim!.t)).toBeLessThanOrEqual(1);
    }
  });

  it('her senaryo kendi kanit seviyelerini artan sirada acar', () => {
    for (const sc of SCENARIOS) {
      const adimlar = xaiSteps(sc);
      if (adimlar.length === 0) continue;

      useConsole.setState({ sim: new Simulation(), xaiLevel: 1, lastXaiSeq: 0 });
      const g = useConsole.getState;
      g().runScenario(sc);
      for (let t = 0; t < sc.duration_s; t++) g().tick(1000);

      const sonSeviye = adimlar[adimlar.length - 1].level;
      expect(g().xaiLevel, sc.id + ' son seviye').toBe(sonSeviye);
      expect(g().sim.xai, sc.id + ' kanit sayisi').toHaveLength(adimlar.length);
    }
  });

  it('elle secilen seviye kanit gelmedikce ezilmez', () => {
    const sc = scenario('drift');
    const g = useConsole.getState;
    g().runScenario(sc);
    for (let t = 0; t < sc.duration_s; t++) g().tick(1000);
    expect(g().xaiLevel).toBe(3);

    // Sunucu geri donup 1. seviyeyi anlatiyor: yeni kanit yok, secim korunur.
    g().setXaiLevel(1);
    for (let i = 0; i < 30; i++) g().tick(1000);
    expect(g().xaiLevel).toBe(1);
  });

  it('senaryo yeniden baslatilinca panel 1. seviyeye doner', () => {
    const sc = scenario('drift');
    const g = useConsole.getState;
    g().runScenario(sc);
    for (let t = 0; t < sc.duration_s; t++) g().tick(1000);
    expect(g().xaiLevel).toBe(3);

    g().runScenario(sc);
    expect(g().xaiLevel).toBe(1);
    expect(g().sim.xai).toHaveLength(0);
    // Sayac hizalandi: bir sonraki tik sahte bir ilerleme uretmemeli.
    expect(g().lastXaiSeq).toBe(g().sim.xaiSeq);
    g().tick(1000);
    expect(g().xaiLevel).toBe(1);
  });

  it('nominal akisa donunce seviye ilerlemesi tetiklenmez', () => {
    const g = useConsole.getState;
    g().backToNominal();
    const once = g().xaiLevel;
    for (let i = 0; i < 60; i++) g().tick(1000);
    expect(g().xaiLevel).toBe(once);
    expect(g().sim.xai).toHaveLength(0);
    expect(NOMINAL_SCENARIO.timeline).toHaveLength(0);
  });
});
