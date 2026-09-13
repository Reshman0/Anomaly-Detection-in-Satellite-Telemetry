import { describe, expect, it } from 'vitest';
import { Fleet, RESUME_TOLERANCE_S } from './fleet';
import { Simulation } from './simulation';
import { SCENARIOS, type Scenario } from './scenarioRunner';
import { PREFILL_S } from './missionClock';
import { nextSequenceCount, resetCounters } from './packetBuilder';

/**
 * Uydu basina anomali hafizasi ve alarm kuyrugu.
 *
 * Katalogdan iki gercek NORAD: 56178 (varsayilan) ve 42691. Testler yalnizca
 * kimligin tuz olarak kullanildigini varsayar, yorunge hesabina girmez.
 */
const A = '56178';
const B = '42691';

function scenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error('senaryo yok: ' + id);
  return s;
}

/** Filoyu 1x hizda `seconds` gorev saniyesi ilerletir. */
function run(fleet: Fleet, seconds: number): void {
  for (let i = 0; i < seconds; i++) fleet.advance(1000);
}

describe('filo — uydu başına ayrım', () => {
  it('bir uyduya enjekte edilen anomali diğerinin kuyruğuna düşmez', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('point'));
    run(fleet, 120);

    const simA = fleet.peek(A)!;
    expect(simA.alarms.length).toBeGreaterThan(0);

    fleet.select(B);
    const simB = fleet.peek(B)!;
    expect(simB.alarms).toHaveLength(0);
    // A'nin hafizasi yerinde durur.
    expect(simA.alarms.length).toBeGreaterThan(0);
    expect(fleet.peek(A)!.alarms.length).toBe(simA.alarms.length);
  });

  it('her alarm kendi uydusunun NORAD’ıyla damgalanır (ST[12], ST[05] ve CUSUM yolları)', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('point'));
    run(fleet, 130);
    const simA = fleet.peek(A)!;
    expect(simA.alarms.every((x) => x.norad === A)).toBe(true);
    expect(simA.alarms.some((x) => x.source === 'ST12_LIMIT')).toBe(true);

    fleet.select(B);
    fleet.active.startScenario(scenario('drift'));
    run(fleet, 130);
    const simB = fleet.peek(B)!;
    expect(simB.alarms.length).toBeGreaterThan(0);
    expect(simB.alarms.every((x) => x.norad === B)).toBe(true);
    expect(simB.alarms.some((x) => x.source === 'AI_DERIVED')).toBe(true);
    expect(simB.alarms.some((x) => x.model === 'CUSUM')).toBe(true);
  });

  it('görev saati ortaktır ve uydu değişimi onu geri almaz', () => {
    const fleet = new Fleet(A);
    run(fleet, 40);
    const t0 = fleet.clock.missionT;
    expect(t0).toBeGreaterThan(0);

    fleet.select(B);
    expect(fleet.clock.missionT).toBe(t0);
    expect(fleet.peek(B)!.clock).toBe(fleet.clock);
    expect(fleet.peek(A)!.clock).toBe(fleet.clock);

    run(fleet, 10);
    expect(fleet.clock.missionT).toBeGreaterThan(t0);
  });

  it('adım sınırı aşılsa bile bir Simulation görev saatini yazmaz', () => {
    const fleet = new Fleet(A);
    // Tek karede 2000 gorev saniyesi: maxSteps (400) yetmez.
    fleet.clock.setSpeed(600);
    fleet.advance(500, 50);
    expect(fleet.clock.missionT).toBeCloseTo(300, 6);
  });
});

describe('filo — telemetri kimliği', () => {
  it('aynı referans model farklı NORAD’da farklı gerçekleme üretir', () => {
    const a = new Simulation({ norad: A });
    const b = new Simulation({ norad: B });
    const a2 = new Simulation({ norad: A });

    const va = a.buffers.get('ch_11')!.map((s) => s.eng);
    const vb = b.buffers.get('ch_11')!.map((s) => s.eng);
    const va2 = a2.buffers.get('ch_11')!.map((s) => s.eng);

    expect(va).toEqual(va2); // aynı uydu → aynı akış
    expect(va).not.toEqual(vb); // farklı uydu → farklı akış
  });

  it('tuzsuz örnek bugünkü tek uydulu akışı birebir üretir', () => {
    const x = new Simulation();
    const y = new Simulation({ norad: '' });
    expect(x.buffers.get('ch_42')!.map((s) => s.eng)).toEqual(y.buffers.get('ch_42')!.map((s) => s.eng));
  });

  it('CCSDS sekans sayacı uydu başınadır ve genel sayaçtan bağımsızdır', () => {
    resetCounters();
    const fleet = new Fleet(A);
    run(fleet, 5);
    fleet.select(B);
    run(fleet, 5);

    const seqOf = (sim: Simulation) => {
      const pkt = sim.packets[0];
      const f = pkt.fields.find((x) => x.name === 'Packet Sequence Count')!;
      return Number(f.value);
    };
    // Iki uydu da kendi sayacini sifirdan baslatir.
    expect(seqOf(fleet.peek(A)!)).toBe(0);
    expect(seqOf(fleet.peek(B)!)).toBe(0);

    // Genel sayac (serbest fonksiyonlar) simulasyonlardan etkilenmez.
    expect(nextSequenceCount(999)).toBe(0);
  });

  it('ön-doldurma canlı paket üretmez', () => {
    const sim = new Simulation({ norad: A });
    expect(sim.packetCount).toBe(0);
    expect(sim.packets).toHaveLength(0);
  });
});

describe('filo — uyandırma (resync)', () => {
  it('pencere istenen görev saatinde biter ve tam PREFILL_S uzunluktadır', () => {
    const sim = new Simulation({ norad: A });
    sim.resync(4000);
    const buf = sim.buffers.get('ch_11')!;
    expect(buf).toHaveLength(PREFILL_S);
    expect(buf[0].t).toBe(4000 - PREFILL_S);
    expect(buf[buf.length - 1].t).toBe(3999);
    expect(sim.lastSampleT).toBe(3999);
  });

  it('aynı görev saatine iki kez uyanmak aynı pencereyi verir', () => {
    const sim = new Simulation({ norad: A });
    sim.resync(4000);
    const first = sim.buffers.get('ch_11')!.map((s) => s.eng);
    sim.resync(4000);
    expect(sim.buffers.get('ch_11')!.map((s) => s.eng)).toEqual(first);
  });

  it('örnekleme ızgarasının fazı uyanış anına göre kaymaz', () => {
    // ch_58 4 s'de bir orneklenir: izgara 4'un katina oturmali.
    const a = new Simulation({ norad: A });
    a.resync(4001);
    const b = new Simulation({ norad: A });
    b.resync(4003);
    const ta = a.buffers.get('ch_58')!.map((s) => s.t);
    const tb = b.buffers.get('ch_58')!.map((s) => s.t);
    expect(ta[1] - ta[0]).toBe(4);
    expect(ta[0] % 4).toBe(tb[0] % 4);
  });

  it('uyanış anomali hafızasını korur, canlı durumu sıfırlar', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('point'));
    run(fleet, 130);

    const sim = fleet.peek(A)!;
    const alarmsBefore = sim.alarms.length;
    const notifBefore = sim.notifications.length;
    const runsBefore = sim.runCounts.get('point');
    const svcBefore = sim.serviceCounts.get('3,25');
    expect(alarmsBefore).toBeGreaterThan(0);
    expect(runsBefore).toBe(1);

    sim.resync(9000);

    // hafıza
    expect(sim.alarms).toHaveLength(alarmsBefore);
    expect(sim.notifications).toHaveLength(notifBefore);
    expect(sim.runCounts.get('point')).toBe(runsBefore);
    expect(sim.serviceCounts.get('3,25')).toBe(svcBefore);
    // canlı durum
    expect(sim.xai).toHaveLength(0);
    expect(sim.infoNotes).toHaveLength(0);
    expect(sim.structuralBreak).toBeNull();
    expect(sim.activeScenario).toBeNull();
    expect(sim.packets).toHaveLength(0);
  });

  it('uyanışın ilk canlı örneği sahte bir limit alarmı üretmez', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('point'));
    run(fleet, 130);
    const sim = fleet.peek(A)!;
    const before = sim.alarms.length;

    sim.resync(9000);
    sim.catchUp(9010);
    expect(sim.alarms).toHaveLength(before);
  });

  it('kısa aradan sonra geri dönüşte koşan senaryo düşmez', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('drift'));
    run(fleet, 20);
    expect(fleet.active.activeScenario).not.toBeNull();

    // B'ye bak, birkac saniye sonra don: tolerans icinde kalmali.
    fleet.select(B);
    run(fleet, Math.floor(RESUME_TOLERANCE_S / 2));
    fleet.select(A);
    expect(fleet.peek(A)!.activeScenario).not.toBeNull();
  });

  it('uzun aradan sonra geri dönüşte güncel görev saatinden devam edilir', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('drift'));
    run(fleet, 20);

    fleet.select(B);
    run(fleet, RESUME_TOLERANCE_S + 60);
    fleet.select(A);

    const sim = fleet.peek(A)!;
    expect(sim.activeScenario).toBeNull();
    expect(sim.behindS).toBeLessThanOrEqual(4);
    expect(sim.lastSampleT).toBeGreaterThan(60);
  });
});

describe('filo — tembel yaratma ve birleşik kuyruk', () => {
  it('görüntüleme yolları uyuyan uyduyu var etmez', () => {
    const fleet = new Fleet(A);
    run(fleet, 5);
    expect(fleet.size).toBe(1);

    expect(fleet.peek(B)).toBeUndefined();
    fleet.summaries();
    fleet.fleetAlarms();
    expect(fleet.size).toBe(1);
    expect(fleet.summaries().has(B)).toBe(false);

    fleet.select(B);
    expect(fleet.size).toBe(2);
  });

  it('filo kuyruğu kimliğe göre azalan sırada birleşir', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('point'));
    run(fleet, 130);
    fleet.select(B);
    fleet.active.startScenario(scenario('point'));
    run(fleet, 130);

    const merged = fleet.fleetAlarms();
    expect(merged.length).toBe(fleet.peek(A)!.alarms.length + fleet.peek(B)!.alarms.length);
    for (let i = 1; i < merged.length; i++) expect(merged[i - 1].id).toBeGreaterThan(merged[i].id);
    expect(new Set(merged.map((x) => x.norad))).toEqual(new Set([A, B]));
  });

  it('özetler onaysız sayısını ve en yüksek şiddeti taşır', () => {
    const fleet = new Fleet(A);
    fleet.active.startScenario(scenario('point'));
    run(fleet, 130);

    const sim = fleet.peek(A)!;
    const s1 = fleet.summaries().get(A)!;
    expect(s1.alarms).toBe(sim.alarms.length);
    expect(s1.unacked).toBe(sim.alarms.length);
    expect(s1.worstSeverity).toBe(Math.max(...sim.alarms.map((x) => x.severity)));
    expect(s1.active).toBe(true);

    sim.acknowledge(sim.alarms[0].id);
    expect(fleet.summaries().get(A)!.unacked).toBe(sim.alarms.length - 1);
  });
});
