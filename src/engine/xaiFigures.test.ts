import { describe, expect, it } from 'vitest';
import { SCENARIOS, pickChannels, resolveScenario } from './scenarioRunner';
import { FIGURE_CHANNELS, channelShares, deviationField, hashSeedText, signalPair } from './xaiFigures';

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

/** Havuzdaki her secenegi tek tek dolasmak icin 0..1 arasi `pick` degerleri. */
function picks(id: string): number[] {
  const n = scenario(id).channel_pool?.length ?? 1;
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
}

describe('hedef kanal havuzdan secilir', () => {
  it('her senaryonun havuzu doludur ve secenekler MIB kanallaridir', () => {
    for (const id of ['point', 'drift', 'collective']) {
      const pool = scenario(id).channel_pool!;
      expect(pool.length, id).toBeGreaterThan(1);
      for (const secenek of pool) {
        for (const ch of secenek) expect(FIGURE_CHANNELS, id).toContain(ch);
      }
    }
  });

  it('havuzdaki her secenek gercekten secilebilir', () => {
    for (const id of ['point', 'drift', 'collective']) {
      const gorulen = new Set(picks(id).map((p) => pickChannels(scenario(id), p).join(',')));
      expect(gorulen.size, id).toBe(scenario(id).channel_pool!.length);
    }
  });

  it('nokta anomalisi hep alt sistem 5, surukleme hep alt sistem 3 kanalinda kalir', () => {
    // Alt sistem kisiti korunmazsa model adi ve alarm metni kanalla celisir.
    for (const p of picks('point')) {
      expect(['ch_42', 'ch_44', 'ch_46']).toContain(pickChannels(scenario('point'), p)[0]);
    }
    for (const p of picks('drift')) {
      expect(['ch_74', 'ch_75']).toContain(pickChannels(scenario('drift'), p)[0]);
    }
  });
});

describe('yer tutucular tek yerden cozulur', () => {
  it('cozulmus senaryoda $n kalmaz ve secilen kanal her yerde ayni', () => {
    for (const id of ['point', 'drift', 'collective']) {
      for (const p of picks(id)) {
        const kanallar = pickChannels(scenario(id), p);
        const sc = resolveScenario(scenario(id), kanallar);
        const ham = JSON.stringify(sc.timeline);
        expect(ham, id).not.toMatch(/\$\d/);

        // enjeksiyon hedefi, alarm metni ve kanit kanallari ayni kanali gostermeli
        const enjekte = sc.timeline.flatMap((st) =>
          st.type === 'inject_point' || st.type === 'inject_drift'
            ? [st.pid]
            : st.type === 'inject_collective'
              ? st.targets.map((t) => t.pid)
              : [],
        );
        for (const pid of enjekte) expect(kanallar, id).toContain(pid);

        const metinler = sc.timeline.filter((st) => st.type === 'event').map((st) => st.text);
        expect(metinler.some((t) => kanallar.some((c) => t.includes(c))), id + ' alarm metni').toBe(true);

        for (const st of sc.timeline) {
          if (st.type !== 'show_xai') continue;
          for (const ch of st.top_channels) expect(kanallar, id + ' top_channels').toContain(ch);
        }
      }
    }
  });
});

describe('kanit gorselleri secilen kanali gosterir', () => {
  it('sekil 2: en buyuk payi senaryonun enjekte ettigi kanal alir', () => {
    for (const id of ['point', 'drift', 'collective']) {
      for (const p of picks(id)) {
        const kanallar = pickChannels(scenario(id), p);
        const sc = resolveScenario(scenario(id), kanallar);
        const pay = channelShares(deviationField(sc, hashSeedText(id + '|' + kanallar.join(','))));
        const baskin = FIGURE_CHANNELS[pay.indexOf(Math.max(...pay))];
        expect(kanallar, id + ' baskin kanal').toContain(baskin);
      }
    }
  });

  it('sekil 1: fark yalnizca hedef kanalda buyur, hedef olmayanda kalir', () => {
    for (const id of ['point', 'drift']) {
      for (const p of picks(id)) {
        const kanallar = pickChannels(scenario(id), p);
        const sc = resolveScenario(scenario(id), kanallar);
        const seed = hashSeedText(id + '|' + kanallar.join(','));

        const hedefFark = Math.max(...signalPair(sc, kanallar[0], seed).fark.map(Math.abs));
        const disKanal = FIGURE_CHANNELS.find((c) => !kanallar.includes(c))!;
        const disFark = Math.max(...signalPair(sc, disKanal, seed).fark.map(Math.abs));

        expect(hedefFark, id + ' hedef ' + kanallar[0]).toBeGreaterThan(1);
        // hedef olmayan kanalda yalnizca modelin kucuk kurulum hatasi kalir
        expect(disFark, id + ' dis kanal ' + disKanal).toBeLessThan(0.1);
      }
    }
  });

  it('ayni kanal + ayni senaryo her zaman ayni gorseli verir', () => {
    const sc = resolveScenario(scenario('drift'), ['ch_74']);
    const seed = hashSeedText('drift|ch_74');
    expect(signalPair(sc, 'ch_74', seed).fark).toEqual(signalPair(sc, 'ch_74', seed).fark);
    expect(deviationField(sc, seed).grid).toEqual(deviationField(sc, seed).grid);
  });

  it('farkli kanal farkli gorsel verir', () => {
    const a = deviationField(resolveScenario(scenario('drift'), ['ch_74']), hashSeedText('drift|ch_74'));
    const b = deviationField(resolveScenario(scenario('drift'), ['ch_75']), hashSeedText('drift|ch_75'));
    expect(a.grid).not.toEqual(b.grid);
  });
});
