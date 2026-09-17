import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { NOMINAL_SCENARIO, SCENARIOS, type Scenario } from './scenarioRunner';
import { deriveStage } from './infoStage';
import { PARAMETERS } from './mib';
import { worstState } from './limitChecker';
import { SUMMARY_HOLD_S, interestingPids, summaryAlarm, summaryVerdict } from './summary';

/**
 * Ozet modu: istisna tabanli telemetri ve uyari seridi.
 *
 * Kritik iddia: surukleme senaryosunda ch_42 limit icinde kalir ama AI alarm
 * verir. Ozet modu ch_42'yi GIZLEMEMELI — ama bir sey tespit edilmeden de
 * gostermemeli (INFO paneliyle ayni ilke: hikaye tespitten once acilmaz).
 */
const AI = ['AI_SCORE_SS1', 'AI_SCORE_SS3', 'AI_SCORE_SS5'];

function senaryo(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error('senaryo yok: ' + id);
  return s;
}

function kos(sim: Simulation, saniye: number): void {
  for (let i = 0; i < saniye; i++) sim.advance(1000);
}

/** Senaryoyu baslatip `saniye` kadar kosar. */
function baslat(id: string, saniye: number, norad = '56178', siddet = 2): Simulation {
  const sim = new Simulation({ norad });
  sim.setSeverity(siddet);
  sim.startScenario(senaryo(id));
  kos(sim, saniye);
  return sim;
}

function durum(sim: Simulation, pid: string): string {
  return sim.snapshot().states.get(pid) ?? 'NOMINAL';
}

describe('özet modu — nominal', () => {
  for (const norad of ['', '56178']) {
    it('nominal akışta yalnızca AI şeritleri çizilir (NORAD ' + (norad || 'tuzsuz') + ')', () => {
      const sim = new Simulation({ norad });
      for (let i = 0; i < 600; i++) {
        sim.advance(1000);
        expect(interestingPids(sim)).toEqual(AI);
      }
      expect(sim.alarms).toHaveLength(0);
    });
  }
});

describe('özet modu — sürüklenme (demonun kritik anı)', () => {
  it('hikâye sızmaz: hiçbir şey tespit edilmeden ch_42 çizilmez', () => {
    let tespitsizAdim = 0;
    for (const norad of ['', '56178']) {
      for (const siddet of [0, 2, 4]) {
        const sim = new Simulation({ norad });
        sim.setSeverity(siddet);
        sim.startScenario(senaryo('drift'));
        expect(interestingPids(sim)).toEqual(AI);
        for (let i = 0; i < 125; i++) {
          sim.advance(1000);
          if (sim.activeScenario === null) continue;
          const tespit = deriveStage(sim).stage >= 1 || sim.xai.length > 0;
          if (!tespit) {
            tespitsizAdim++;
            expect(interestingPids(sim)).toEqual(AI);
          }
        }
      }
    }
    // Test bosuna gecmesin: gercekten tespitsiz adimlar denetlendi.
    expect(tespitsizAdim).toBeGreaterThan(0);
  });

  it('ch_42 tespitten sonra çizilir — limit içinde kalmasına rağmen', () => {
    const sim = baslat('drift', 50);
    const pids = interestingPids(sim);
    expect(pids).toContain('ch_42');
    expect(pids).not.toContain('ch_75');
    // Kontrastin onculu: ST[12] hala sessiz.
    expect(durum(sim, 'ch_42')).toBe('NOMINAL');

    kos(sim, 60); // t+110
    expect(interestingPids(sim)).toContain('ch_42');
  });

  it('şerit sırası PARAMETERS sırasıdır: ham kanallar AI şeritlerinden önce', () => {
    const pids = interestingPids(baslat('drift', 50));
    expect(pids).toEqual(['ch_42', ...AI]);
  });
});

describe('özet modu — bayat kanıt', () => {
  it('senaryo kendiliğinden bitince XAI kanıtı şeridi tutmaz', () => {
    const sim = baslat('drift', 125);
    expect(sim.activeScenario).toBeNull();
    // Motor kaniti temizlemiyor — kural bunu kapiyla telafi ediyor.
    expect(sim.xai).toHaveLength(3);
    expect(interestingPids(sim)).toEqual(AI);
  });

  it('nominale dönüşte (N) şerit anında çekilir', () => {
    const sim = baslat('drift', 60);
    expect(interestingPids(sim)).toContain('ch_42');
    sim.startScenario(NOMINAL_SCENARIO);
    expect(sim.xai.length).toBeGreaterThan(0);
    expect(interestingPids(sim)).toEqual(AI);
  });

  it('yeni senaryo başlayınca önceki senaryonun kanalı taşınmaz', () => {
    const sim = baslat('drift', 60);
    expect(interestingPids(sim)).toContain('ch_42');
    sim.startScenario(senaryo('point'));
    expect(interestingPids(sim)).toEqual(AI);
  });
});

describe('özet modu — nokta anomalisi ve tutma', () => {
  it('ch_11 ihlaldeyken çizilir', () => {
    const sim = baslat('point', 31);
    expect(interestingPids(sim)).toContain('ch_11');
  });

  it('limite döndükten sonra da tutma süresince çizilir', () => {
    const sim = baslat('point', 40);
    expect(durum(sim, 'ch_11')).toBe('NOMINAL');
    expect(interestingPids(sim)).toContain('ch_11');
  });

  it('tutma süresi dolunca şerit çekilir', () => {
    const sim = baslat('point', 40);
    const gecisler = sim.alarms.filter((a) => a.source === 'ST12_LIMIT' && a.pid === 'ch_11');
    const sonT = Math.max(...gecisler.map((a) => a.missionT));

    // Son gecisten 95 s sonra: tutma (90) dolmus, runner da bitmis olmali.
    kos(sim, Math.ceil(sonT + 95 - sim.clock.missionT));
    expect(sim.activeScenario).toBeNull();
    expect(durum(sim, 'ch_11')).toBe('NOMINAL');
    expect(interestingPids(sim, SUMMARY_HOLD_S)).not.toContain('ch_11');
    expect(interestingPids(sim, 100)).toContain('ch_11');
  });

  it('tutma İHLALDEN değil, NOMİNAL’e dönüşten sayılır', () => {
    // Yalnizca ihlale bakan bir kural, tutma suresinden uzun suren bir ihlalde
    // seridi limite dondugu AN kaybederdi — tutmanin onlemek icin var oldugu sey.
    const sim = baslat('point', 40);
    const gecisler = sim.alarms.filter((a) => a.source === 'ST12_LIMIT' && a.pid === 'ch_11');
    const ihlalT = Math.min(...gecisler.filter((a) => a.transition?.to !== 'NOMINAL').map((a) => a.missionT));
    const donusT = Math.max(...gecisler.filter((a) => a.transition?.to === 'NOMINAL').map((a) => a.missionT));
    expect(donusT).toBeGreaterThan(ihlalT);

    kos(sim, 90); // runner bitsin: XAI kapisi kapansin, yalnizca tutma kalsin
    expect(sim.activeScenario).toBeNull();
    const simdi = sim.clock.missionT;

    // Pencere donusu kapsar ama ihlali kapsamaz: iki kural burada ayrisir.
    const pencere = simdi - donusT + 0.5;
    expect(simdi - ihlalT).toBeGreaterThan(pencere);
    expect(interestingPids(sim, pencere)).toContain('ch_11');
    expect(interestingPids(sim, simdi - donusT - 0.5)).not.toContain('ch_11');
  });
});

describe('özet modu — kolektif sapma', () => {
  it('üç kanal da çizilir, hiçbiri limit dışında değilken', () => {
    const sim = baslat('collective', 47);
    const ham = interestingPids(sim).filter((p) => !AI.includes(p));
    expect(ham).toEqual(['ch_42', 'ch_75', 'ch_58']);
    for (const p of ham) expect(durum(sim, p)).toBe('NOMINAL');
  });
});

describe('özet modu — uyarı şeridi', () => {
  it('nominalde uyarı yok', () => {
    const sim = new Simulation({ norad: '56178' });
    kos(sim, 60);
    expect(summaryAlarm(sim.alarms)).toBeNull();
  });

  it('düşük şiddet uyarı üretmez, orta şiddet üretir', () => {
    const sim = baslat('collective', 40);
    expect(sim.alarms.some((a) => a.severity === 1)).toBe(true);
    expect(summaryAlarm(sim.alarms)).toBeNull();

    kos(sim, 7); // t+47: TM[5,3] siddet 2
    const s = summaryAlarm(sim.alarms)!;
    expect(s).not.toBeNull();
    expect(s.top.severity).toBe(2);
    expect(s.top.service).toEqual([5, 3]);
  });

  it('en yeni onaysız alarmı gösterir; onaylananlar düşer', () => {
    const sim = baslat('point', 40);
    const s1 = summaryAlarm(sim.alarms)!;
    // TM[5,4] (siddet 3) ST[12] SERT ihlalden sonra dustu: kimligi daha buyuk.
    expect(s1.top.service).toEqual([5, 4]);
    expect(s1.count).toBe(2);

    sim.acknowledge(s1.top.id);
    const s2 = summaryAlarm(sim.alarms)!;
    expect(s2.top.source).toBe('ST12_LIMIT');
    expect(s2.top.severity).toBe(3);
    expect(s2.count).toBe(1);

    sim.acknowledge(s2.top.id);
    expect(summaryAlarm(sim.alarms)).toBeNull();
  });

  it('eşik ayarlanabilir', () => {
    const sim = baslat('collective', 40);
    expect(summaryAlarm(sim.alarms, 1)?.top.severity).toBe(1);
  });
});

/** Panonun hukmu, simulasyonun o anki limit durumlarindan. */
function hukum(sim: Simulation) {
  const st = (pid: string) => sim.snapshot().states.get(pid) ?? 'NOMINAL';
  return summaryVerdict(
    worstState(PARAMETERS.filter((p) => !p.derived).map((p) => st(p.pid))),
    worstState(PARAMETERS.filter((p) => p.derived).map((p) => st(p.pid))),
  );
}

describe('özet panosu — genel hüküm', () => {
  it('iki kaynak da nominalken NOMİNAL', () => {
    const v = summaryVerdict('NOMINAL', 'NOMINAL');
    expect(v).toMatchObject({ word: 'NOMİNAL', tone: 'nominal', glyph: '●', contrast: false });
    expect(hukum(new Simulation({ norad: '56178' })).word).toBe('NOMİNAL');
  });

  it('ST[12] sert ihlali AI alarmının önüne geçer', () => {
    expect(summaryVerdict('HARD_HIGH', 'HARD_HIGH')).toMatchObject({ word: 'ALARM', tone: 'hard', glyph: '▲', contrast: false });
    expect(summaryVerdict('HARD_LOW', 'NOMINAL')).toMatchObject({ word: 'ALARM', tone: 'hard' });
  });

  it('sert AI skoru yumuşak limit ihlalinin önüne geçer, kontrast sayılmaz', () => {
    const v = summaryVerdict('SOFT_LOW', 'HARD_HIGH');
    expect(v).toMatchObject({ word: 'ALARM', tone: 'ai', glyph: '◆', contrast: false });
    expect(v.reason).not.toContain('limit içinde');
  });

  it('limitler sessizken AI alarmı KONTRAST olarak işaretlenir', () => {
    const v = summaryVerdict('NOMINAL', 'HARD_HIGH');
    expect(v).toMatchObject({ word: 'ALARM', tone: 'ai', contrast: true });
    // Esik MIB'den okunur (AI_SCORE_* hard_high = 5).
    expect(v.reason).toContain('5σ');
    expect(v.reason).toContain('limit içinde');
  });

  it('yumuşak eşikler İZLEME verir, kaynağına göre işaretlenir', () => {
    expect(summaryVerdict('SOFT_HIGH', 'NOMINAL')).toMatchObject({ word: 'İZLEME', tone: 'soft', glyph: '▲', contrast: false });
    const ai = summaryVerdict('NOMINAL', 'SOFT_HIGH');
    expect(ai).toMatchObject({ word: 'İZLEME', tone: 'ai', glyph: '◆', contrast: true });
    expect(ai.reason).toContain('3σ');
  });

  it('sürüklenme doğrulandığında: AI kaynaklı ALARM ve KONTRAST', () => {
    const sim = baslat('drift', 0);
    let t = 0;
    while (deriveStage(sim).aiConfirmT === null && t < 120) {
      kos(sim, 1);
      t++;
    }
    expect(deriveStage(sim).aiConfirmT).not.toBeNull();
    expect(hukum(sim)).toMatchObject({ word: 'ALARM', tone: 'ai', contrast: true });
  });

  it('nokta anomalisinin sert ihlali anında ▲ ALARM', () => {
    const sim = baslat('point', 0);
    let t = 0;
    while (!durum(sim, 'ch_11').startsWith('HARD') && t < 90) {
      kos(sim, 1);
      t++;
    }
    expect(durum(sim, 'ch_11')).toMatch(/^HARD/);
    expect(hukum(sim)).toMatchObject({ word: 'ALARM', tone: 'hard', glyph: '▲' });
  });
});
