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

/**
 * Bir gorev saniyesi ilerletir ve akis kendiliginden duraklatildiysa devam
 * ettirir — sunucunun sahnede yaptigi sey. Duraklatma davranisinin kendisi
 * asagida ayrica test edilir.
 */
function ilerlet(n: number): void {
  const g = useConsole.getState;
  for (let i = 0; i < n; i++) {
    g().tick(1000);
    if (g().durduruldu) g().devamEt();
  }
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
    durduruldu: false,
    duraklatmaYapildi: false,
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
      ilerlet(1);
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
      ilerlet(sc.duration_s);

      const sonSeviye = adimlar[adimlar.length - 1].level;
      expect(g().xaiLevel, sc.id + ' son seviye').toBe(sonSeviye);
      expect(g().sim.xai, sc.id + ' kanit sayisi').toHaveLength(adimlar.length);
    }
  });

  it('elle secilen seviye kanit gelmedikce ezilmez', () => {
    const sc = scenario('drift');
    const g = useConsole.getState;
    g().runScenario(sc);
    ilerlet(sc.duration_s);
    expect(g().xaiLevel).toBe(3);

    // Sunucu geri donup 1. seviyeyi anlatiyor: yeni kanit yok, secim korunur.
    g().setXaiLevel(1);
    ilerlet(30);
    expect(g().xaiLevel).toBe(1);
  });

  it('senaryo yeniden baslatilinca panel 1. seviyeye doner', () => {
    const sc = scenario('drift');
    const g = useConsole.getState;
    g().runScenario(sc);
    ilerlet(sc.duration_s);
    expect(g().xaiLevel).toBe(3);

    g().runScenario(sc);
    expect(g().xaiLevel).toBe(1);
    expect(g().sim.xai).toHaveLength(0);
    // Sayac hizalandi: bir sonraki tik sahte bir ilerleme uretmemeli.
    expect(g().lastXaiSeq).toBe(g().sim.xaiSeq);
    ilerlet(1);
    expect(g().xaiLevel).toBe(1);
  });

  it('nominal akisa donunce seviye ilerlemesi tetiklenmez', () => {
    const g = useConsole.getState;
    g().backToNominal();
    const once = g().xaiLevel;
    ilerlet(60);
    expect(g().xaiLevel).toBe(once);
    expect(g().sim.xai).toHaveLength(0);
    expect(NOMINAL_SCENARIO.timeline).toHaveLength(0);
  });
});

describe('akış, son kanıt (ısı haritası) çıktıktan sonra duruyor', () => {
  it.each(['point', 'drift', 'collective'])(
    '%s: duraklama anında üç kanıt adımının tamamı yüklü',
    (id) => {
      const g = useConsole.getState;
      const sc = scenario(id);
      const beklenen = xaiSteps(sc).length;
      expect(beklenen, id + ' kanıt adımı sayısı').toBe(3);

      g().runScenario(sc);
      let durakladi: { kanit: number; seviye: number } | null = null;
      for (let t = 0; t < sc.duration_s + 40 && !durakladi; t++) {
        g().tick(1000);
        if (g().durduruldu) durakladi = { kanit: g().sim.xai.length, seviye: g().xaiLevel };
      }

      expect(durakladi, id + ' duraklamalı').not.toBeNull();
      // Asil kosul: son kanit da dusmus olmali.
      expect(durakladi!.kanit, id + ' yüklü kanıt').toBe(beklenen);
      // Panel son adimi (isi haritasi) gosteriyor olmali.
      expect(durakladi!.seviye, id + ' panel adımı').toBe(3);
    },
  );

  it('son kanıttan önce duraklamaz', () => {
    const g = useConsole.getState;
    const sc = scenario('drift');
    g().runScenario(sc);
    for (let t = 0; t < sc.duration_s + 40; t++) {
      g().tick(1000);
      if (g().durduruldu) break;
      // Duraklamamissa, henuz tum kanit gelmemis olmali.
      expect(g().sim.xai.length).toBeLessThan(3);
    }
    expect(g().durduruldu).toBe(true);
  });

  it('senaryo başına yalnızca bir kez duraklar', () => {
    const g = useConsole.getState;
    const sc = scenario('drift');
    g().runScenario(sc);
    let sayi = 0;
    for (let t = 0; t < sc.duration_s + 60; t++) {
      g().tick(1000);
      if (g().durduruldu) {
        sayi++;
        g().devamEt();
      }
    }
    expect(sayi).toBe(1);
  });

  it('duraklamış akış ilerlemez, devam edilince sürer', () => {
    const g = useConsole.getState;
    const sc = scenario('drift');
    g().runScenario(sc);
    for (let t = 0; t < sc.duration_s + 40 && !g().durduruldu; t++) g().tick(1000);
    expect(g().durduruldu).toBe(true);

    const t0 = g().sim.clock.missionT;
    g().tick(1000);
    expect(g().sim.clock.missionT, 'duraklamışken saat durmalı').toBe(t0);

    g().devamEt();
    g().tick(1000);
    expect(g().sim.clock.missionT, 'devam edince saat ilerlemeli').toBeGreaterThan(t0);
  });

  it('hız düğmesi de devam ettirir', () => {
    const g = useConsole.getState;
    const sc = scenario('drift');
    g().runScenario(sc);
    for (let t = 0; t < sc.duration_s + 40 && !g().durduruldu; t++) g().tick(1000);
    expect(g().durduruldu).toBe(true);
    g().setSpeed(60);
    expect(g().durduruldu).toBe(false);
    expect(g().speed).toBe(60);
  });

  it('nominale dönünce duraklama temizlenir', () => {
    const g = useConsole.getState;
    const sc = scenario('drift');
    g().runScenario(sc);
    for (let t = 0; t < sc.duration_s + 40 && !g().durduruldu; t++) g().tick(1000);
    expect(g().durduruldu).toBe(true);
    g().backToNominal();
    expect(g().durduruldu).toBe(false);
    expect(g().duraklatmaYapildi).toBe(false);
  });
});
