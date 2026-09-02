import { describe, expect, it } from 'vitest';
import { Simulation, severityToSubtype } from './simulation';
import { SCENARIOS, SEVERITY_STEPS, type Scenario } from './scenarioRunner';
import { param } from './mib';
import { evaluate } from './limitChecker';
import { SEQ_COUNT_MAX, buildTmPacket, crc16Ccitt, nextSequenceCount, resetCounters } from './packetBuilder';
import type { LimitState } from './types';

function scenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error('senaryo yok: ' + id);
  return s;
}

/**
 * Bir senaryoyu bastan sona 1x hizda kosar, her parametrenin en kotu durumunu dondurur.
 * `startOffsetMs` gorev saatini kesirli bir noktaya tasir; senaryonun baslatildigi
 * anin ondalik kismindan bagimsiz olmasi gerekir.
 */
function runScenario(id: string, severityIndex: number, startOffsetMs = 0, pick = 0) {
  const sim = new Simulation();
  sim.setSeverity(severityIndex);
  if (startOffsetMs > 0) sim.advance(startOffsetMs);
  const sc = scenario(id);
  sim.startScenario(sc, pick);
  // Kanallar simdi yakalanmali: senaryo bitince runner temizleniyor.
  const channels = sim.runner?.channels ?? [];

  const worst = new Map<string, LimitState>();
  const peakEng = new Map<string, number>();

  const totalSteps = sc.duration_s + 40;
  for (let i = 0; i < totalSteps; i++) {
    sim.advance(1000);
    for (const [pid, buf] of sim.buffers) {
      const last = buf[buf.length - 1];
      if (!last || last.t < 0) continue;
      const st = evaluate(param(pid), last.eng);
      const prev = worst.get(pid);
      if (!prev || rank(st) > rank(prev)) worst.set(pid, st);
      const pk = peakEng.get(pid);
      if (pk === undefined || Math.abs(last.eng) > Math.abs(pk)) peakEng.set(pid, last.eng);
    }
  }
  return { sim, worst, peakEng, channels };
}

/** Havuzdaki her secenegi tek tek denemek icin 0..1 arasi `pick` degerleri. */
function picks(id: string): number[] {
  const n = scenario(id).channel_pool?.length ?? 1;
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
}

function rank(s: LimitState): number {
  return s === 'NOMINAL' ? 0 : s === 'SOFT_LOW' || s === 'SOFT_HIGH' ? 1 : 2;
}

describe('§6.3 — yavaş sürüklenme: ST[12] NOMİNAL kalır, AI skoru alarma geçer', () => {
  SEVERITY_STEPS.forEach((mul, idx) => {
    it('şiddet kademesi ' + (idx + 1) + ' (×' + mul + ')', () => {
      // Hedef kanal havuzdan seciliyor: her secenek ayni garantiyi vermeli.
      for (const pick of picks('drift')) {
        const { worst, peakEng, channels } = runScenario('drift', idx, 0, pick);
        const hedef = channels[0];
        expect(worst.get(hedef), hedef).toBe('NOMINAL');
        expect(Math.abs(peakEng.get(hedef)!), hedef).toBeLessThan(param(hedef).limits.soft_high!);
      }
      const { worst, peakEng, sim } = runScenario('drift', idx);

      // AI türetilmiş parametre sert eşiği aşmalı.
      expect(worst.get('AI_SCORE_SS3')).toBe('HARD_HIGH');
      expect(peakEng.get('AI_SCORE_SS3')!).toBeGreaterThan(param('AI_SCORE_SS3').limits.hard_high!);

      // Sürüklenme senaryosunda hiçbir ST[12] geçiş raporu üretilmemeli.
      expect(sim.serviceCounts.get('12,12') ?? 0).toBe(0);

      // Buna karşılık AI kaynaklı ST[05] bildirimleri üretilmeli.
      const st05 = sim.alarms.filter((a) => a.source === 'AI_DERIVED');
      expect(st05.length).toBeGreaterThan(0);
    });
  });
});

describe('§6.3 — kolektif sapma: kanallar tek tek limit içinde kalır', () => {
  SEVERITY_STEPS.forEach((_mul, idx) => {
    it('şiddet kademesi ' + (idx + 1), () => {
      for (const pick of picks('collective')) {
        const { worst, sim, channels } = runScenario('collective', idx, 0, pick);
        for (const pid of channels) {
          expect(worst.get(pid), pid).toBe('NOMINAL');
        }
        expect(worst.get('AI_SCORE_SS3')).toBe('HARD_HIGH');
        expect(sim.serviceCounts.get('12,12') ?? 0).toBe(0);
      }
    });
  });
});

describe('nokta anomalisi: limit kontrolü gerçekten çalışır', () => {
  SEVERITY_STEPS.forEach((_mul, idx) => {
    it('şiddet kademesi ' + (idx + 1) + ': hedef kanal sert limiti aşar ve TM[12,12] üretilir', () => {
      for (const pick of picks('point')) {
        const { worst, sim, channels } = runScenario('point', idx, 0, pick);
        const hedef = channels[0];
        expect(worst.get(hedef), hedef).toBe('HARD_HIGH');
        expect(sim.serviceCounts.get('12,12') ?? 0).toBeGreaterThan(0);
        const limitAlarms = sim.alarms.filter((a) => a.source === 'ST12_LIMIT');
        expect(limitAlarms.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('§10 — determinizm', () => {
  it('aynı senaryo aynı şiddette aynı seriyi üretir', () => {
    const a = runScenario('drift', 2);
    const b = runScenario('drift', 2);
    const bufA = a.sim.buffers.get('ch_75')!.map((s) => s.eng);
    const bufB = b.sim.buffers.get('ch_75')!.map((s) => s.eng);
    expect(bufA).toEqual(bufB);
  });

  it('senaryo kesirli bir görev saatinde başlatılsa da aynı anomaliyi üretir', () => {
    // Buton gerçek kullanımda ondalıklı bir görev saatinde basılır; enjeksiyon
    // şeklinin örneklem ızgarasına oturması gerekir.
    for (const id of ['point', 'drift', 'collective']) {
      const clean = runScenario(id, 2);
      const shifted = runScenario(id, 2, 3170);
      for (const pid of ['ch_44', 'ch_42', 'ch_75', 'ch_74', 'AI_SCORE_SS5', 'AI_SCORE_SS3']) {
        expect(shifted.worst.get(pid), id + '/' + pid).toBe(clean.worst.get(pid));
      }
      expect(shifted.sim.serviceCounts.get('12,12') ?? 0).toBe(clean.sim.serviceCounts.get('12,12') ?? 0);
      expect(shifted.sim.alarms.map((a) => a.text)).toEqual(clean.sim.alarms.map((a) => a.text));
    }
  });
});

describe('§4 — paket üretimi', () => {
  it('sekans sayacı APID başına artar ve 16383’te sarar', () => {
    resetCounters();
    expect(nextSequenceCount(42)).toBe(0);
    expect(nextSequenceCount(43)).toBe(0);
    expect(nextSequenceCount(42)).toBe(1);
    for (let i = 2; i <= SEQ_COUNT_MAX; i++) nextSequenceCount(42);
    expect(nextSequenceCount(42)).toBe(0);
    expect(nextSequenceCount(43)).toBe(1);
  });

  it('birincil başlık bit alanları CCSDS 133.0-B düzenindedir', () => {
    resetCounters();
    const pkt = buildTmPacket({
      apid: 43,
      service: 3,
      subtype: 25,
      unixMs: Date.UTC(2026, 8, 21, 8, 10, 0),
      userData: new Uint8Array([0x00, 0x01]),
    });
    const b = pkt.bytes;
    expect(b[0] >> 5).toBe(0); // packet version number = 000
    expect((b[0] >> 4) & 1).toBe(0); // packet type = TM
    expect((b[0] >> 3) & 1).toBe(1); // secondary header flag
    expect(((b[0] & 0x07) << 8) | b[1]).toBe(43); // APID
    expect(b[2] >> 6).toBe(0b11); // sequence flags = unsegmented
    const dataLength = (b[4] << 8) | b[5];
    expect(dataLength).toBe(b.length - 6 - 1); // veri alanı uzunluğu eksi 1
    expect((b[6] >> 4) & 0x0f).toBe(2); // PUS-C
    expect(b[7]).toBe(3); // service type
    expect(b[8]).toBe(25); // subtype
  });

  it('Packet Error Control paketin geri kalanının CRC-16-CCITT değeridir', () => {
    resetCounters();
    const pkt = buildTmPacket({
      apid: 42,
      service: 5,
      subtype: 4,
      unixMs: Date.UTC(2026, 8, 21, 8, 10, 0),
      userData: new Uint8Array([0xab, 0xcd]),
    });
    const body = pkt.bytes.slice(0, pkt.bytes.length - 2);
    const pec = (pkt.bytes[pkt.bytes.length - 2] << 8) | pkt.bytes[pkt.bytes.length - 1];
    expect(pec).toBe(crc16Ccitt(body));
  });

  it('yalnızca ST[03], ST[05], ST[12] servisleri kullanılır', () => {
    const { sim } = runScenario('point', 4);
    for (const key of sim.serviceCounts.keys()) {
      expect([3, 5, 12]).toContain(Number(key.split(',')[0]));
    }
    expect(sim.serviceCounts.get('3,25') ?? 0).toBeGreaterThan(0);
  });

  it('ESA-ADB önem derecesi 0–3 ↔ TM[5,1..4] eşlemesi', () => {
    expect(severityToSubtype(0)).toBe(1);
    expect(severityToSubtype(1)).toBe(2);
    expect(severityToSubtype(2)).toBe(3);
    expect(severityToSubtype(3)).toBe(4);
  });

  it('senaryo dosyalarındaki servis çiftleri önem derecesiyle tutarlıdır', () => {
    for (const sc of SCENARIOS) {
      for (const step of sc.timeline) {
        if (step.type !== 'event') continue;
        expect(step.service[0]).toBe(5);
        expect(step.service[1]).toBe(severityToSubtype(step.severity));
      }
    }
  });
});
