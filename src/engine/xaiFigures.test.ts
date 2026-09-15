import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarioRunner';
import {
  FIGURE_CHANNELS,
  channelShares,
  deviationField,
  hashSeedText,
  figureTimeTicks,
  injectedChannels,
  missionUtcMs,
  scenarioByAsset,
  scenarioStartT,
  signalPair,
} from './xaiFigures';
import { Simulation } from './simulation';
import { fmtTime } from './missionClock';

const tekKanalli = SCENARIOS.filter((sc) =>
  sc.timeline.some((st) => st.type === 'inject_point' || st.type === 'inject_drift'),
);

describe('kanittan senaryoya', () => {
  it('her show_xai adiminin asset alani kendi senaryosunu bulur', () => {
    for (const sc of SCENARIOS) {
      for (const st of sc.timeline) {
        if (st.type !== 'show_xai') continue;
        expect(scenarioByAsset(st.asset)?.id, st.asset).toBe(sc.id);
      }
    }
  });

  it('bilinmeyen asset icin null doner', () => {
    expect(scenarioByAsset('xai/yok.png')).toBeNull();
  });

  it('enjekte edilen kanallar MIB kanallaridir', () => {
    for (const sc of SCENARIOS) {
      const k = injectedChannels(sc);
      if (sc.timeline.some((st) => st.type.startsWith('inject'))) expect(k.length, sc.id).toBeGreaterThan(0);
      for (const ch of k) expect(FIGURE_CHANNELS, sc.id).toContain(ch);
    }
  });
});

describe('kanit gorselleri senaryonun kanalini gosterir', () => {
  it('sekil 2: en buyuk payi senaryonun enjekte ettigi kanal alir', () => {
    for (const sc of SCENARIOS) {
      const k = injectedChannels(sc);
      if (k.length === 0) continue;
      const pay = channelShares(deviationField(sc, hashSeedText(sc.id + '|' + k.join(','))));
      expect(k, sc.id).toContain(FIGURE_CHANNELS[pay.indexOf(Math.max(...pay))]);
    }
  });

  it('sekil 1: fark hedef kanalda buyur, hedef olmayanda kurulum hatasi kadar kalir', () => {
    for (const sc of tekKanalli) {
      const k = injectedChannels(sc);
      const seed = hashSeedText(sc.id + '|' + k.join(','));
      const hedef = Math.max(...signalPair(sc, k[0], seed).fark.map(Math.abs));
      const dis = FIGURE_CHANNELS.find((c) => !k.includes(c))!;
      expect(hedef, sc.id).toBeGreaterThan(1);
      expect(Math.max(...signalPair(sc, dis, seed).fark.map(Math.abs)), sc.id).toBeLessThan(0.1);
    }
  });

  it('ayni senaryo her zaman ayni gorseli verir', () => {
    const sc = tekKanalli[0];
    const seed = hashSeedText(sc.id);
    expect(deviationField(sc, seed).grid).toEqual(deviationField(sc, seed).grid);
  });
});

describe('sekil zaman ekseni simulasyon saatini yazar', () => {
  it('kanittan bulunan baslangic, simulasyonun senaryoyu baslattigi an ile ayni', () => {
    const sim = new Simulation();
    // Kesirli bir anda baslat: baslangic izgaraya oturtulmali, kanit yine tutmali.
    sim.advance(12_345.6);
    for (const sc of SCENARIOS.filter((x) => x.timeline.some((st) => st.type === 'show_xai'))) {
      sim.startScenario(sc);
      const bas = sim.scenarioStartT!;
      // Buyuk adimlarla ilerlet: bir cagrida birden cok orneklem islenir.
      for (let i = 0; i < 14; i++) sim.advance(7_300);
      expect(sim.xai.length, sc.id).toBe(3);
      for (const ev of sim.xai) {
        expect(scenarioByAsset(ev.asset)?.id).toBe(sc.id);
        expect(scenarioStartT(sc, ev.asset, ev.missionT), ev.asset).toBe(bas);
      }
      sim.stopScenario();
    }
  });

  it('isaretler yuvarlak UTC saniyelerine oturur ve pencerenin icinde kalir', () => {
    // Epok 08:10:00; 97. gorev saniyesi 08:11:37.
    expect(fmtTime(missionUtcMs(97))).toBe('08:11:37');
    const k = figureTimeTicks(97, 89);
    expect(k.map((x) => fmtTime(x.utcMs))).toEqual(['08:11:45', '08:12:00', '08:12:15', '08:12:30', '08:12:45', '08:13:00']);
    for (const x of k) {
      expect(x.t).toBeGreaterThanOrEqual(0);
      expect(x.t).toBeLessThanOrEqual(89);
      expect(missionUtcMs(97 + x.t)).toBe(x.utcMs);
    }
  });
});
