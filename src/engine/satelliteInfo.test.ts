import { describe, expect, it } from 'vitest';
import { SATELLITES, satByNorad } from './orbit';
import {
  dataVolume,
  fmtBytes,
  missionLife,
  nadirFromElevation,
  orbitCount,
  recordedProblems,
  regionAt,
  regionTimeline,
  revAtEpoch,
} from './satelliteInfo';
import type { Alarm } from './types';

const IMECE = satByNorad('56178');

describe('nadir acisi', () => {
  it('tepedeyken sifir, ufukta en buyuk', () => {
    expect(nadirFromElevation(686, 90)).toBeCloseTo(0, 6);
    const ufuk = nadirFromElevation(686, 0);
    expect(ufuk).toBeGreaterThan(60);
    expect(ufuk).toBeLessThan(70);
  });

  it('yukselti arttikca kuculur', () => {
    const d = [0, 30, 60, 89].map((e) => nadirFromElevation(686, e));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1]);
  });
});

describe('gorev omru', () => {
  it('IMECE icin kesin tarih ve 5 yil tasarim omru kullanilir', () => {
    const m = missionLife(IMECE, Date.parse('2024-04-14T06:47:00Z'));
    expect(m.kesin).toBe(true);
    expect(m.gecenGun).toBe(365);
    expect(m.tasarimYil).toBe(5);
    expect(m.gecenGun + m.kalanGun!).toBe(Math.round(5 * 365.25));
  });

  it('kunyesi olmayan uyduda tasarim omru uydurulmaz', () => {
    const baska = SATELLITES.find((s) => s.norad !== '56178')!;
    const m = missionLife(baska, Date.UTC(2026, 0, 1));
    expect(m.kesin).toBe(false);
    expect(m.tasarimYil).toBeNull();
    expect(m.kalanGun).toBeNull();
    expect(m.yuzde).toBeNull();
    expect(new Date(m.firlatmaMs).getUTCFullYear()).toBe(baska.launchYear);
  });

  it('omur yuzdesi 100 u asmaz', () => {
    expect(missionLife(IMECE, Date.parse('2040-01-01T00:00:00Z')).yuzde).toBe(100);
  });
});

describe('tur sayisi', () => {
  it('baslangic sayisi TLE ikinci satirindaki gercek tur numarasidir', () => {
    // IMECE TLE: ... 14.65887670 18082 5 -> epoch aninda 18 082. tur
    expect(revAtEpoch('56178')).toBe(18082);
    expect(orbitCount(IMECE, IMECE.epochMs).toplam).toBe(18082);
  });

  it('bir tur suresi gecince bir artar', () => {
    expect(orbitCount(IMECE, IMECE.epochMs + IMECE.periodMin * 60_000 + 1).toplam).toBe(18083);
  });

  it('katalogdaki her uydunun tur numarasi okunur', () => {
    for (const s of SATELLITES) expect(revAtEpoch(s.norad), s.name).toBeGreaterThan(0);
  });
});

describe('aktarilan veri', () => {
  it('oturum hacmi olcum, gorev boyu hacim olculen hizin surmesidir', () => {
    expect(dataVolume(100, 29, 300, 1e8).oturumBayt).toBe(2900);
    const v = dataVolume(600, 29, 600, 1_000_000);
    expect(v.hizBps).toBeCloseTo(29, 6);
    expect(v.gorevBayt).toBeCloseTo(29_000_000, 0);
  });

  it('bir dakikadan kisa olcumde tahmin verilmez', () => {
    expect(dataVolume(40, 29, 30, 1e8).gorevBayt).toBeNull();
  });

  it('Turkce ondalikla yazilir', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2900)).toBe('2,90 kB');
    expect(fmtBytes(29_000_000)).toBe('29,0 MB');
  });
});

describe('bolgeler', () => {
  it('bilinen koordinatlari esler, uzak noktalari acik deniz sayar', () => {
    expect(regionAt(39.9, 32.8)).toBe('Türkiye');
    expect(regionAt(-48.9, -123.4)).toBe('açık deniz');
  });

  it('ardisik ayni bolgeler birlesir', () => {
    const iz = regionTimeline(IMECE, IMECE.epochMs, 40 * 60, 60);
    expect(iz.length).toBeGreaterThan(1);
    for (let i = 1; i < iz.length; i++) expect(iz[i].ad).not.toBe(iz[i - 1].ad);
  });
});

describe('kaydedilen anomaliler', () => {
  let id = 0;
  const alarm = (o: Partial<Alarm>): Alarm =>
    ({
      id: ++id,
      service: [5, 3],
      severity: 2,
      source: 'AI_DERIVED',
      apid: 1,
      pid: 'AI_SCORE_SS3',
      subsystem: 'SS3',
      text: 'sapma',
      utc: '08:10:00',
      obt: '',
      missionT: 0,
      ...o,
    }) as Alarm;

  it('ayni kaynak, alt sistem ve parametre tek sorunun tekrari sayilir', () => {
    const p = recordedProblems([
      alarm({ missionT: 10, utc: '08:10:10', text: 'ilk' }),
      alarm({ missionT: 40, utc: '08:10:40', text: 'son', severity: 3 }),
      alarm({ source: 'ST12_LIMIT', pid: 'ch_11', subsystem: 'SS1', missionT: 20 }),
    ]);
    expect(p).toHaveLength(2);
    const ai = p.find((x) => x.kaynak === 'AI_DERIVED')!;
    expect(ai.adet).toBe(2);
    expect(ai.sureS).toBe(30);
    expect(ai.enYuksekOnem).toBe(3);
    expect(ai.sonMetin).toBe('son');
  });

  it('onem 0 sorun sayilmaz, en son yasanan uste gelir', () => {
    expect(recordedProblems([alarm({ severity: 0 })])).toHaveLength(0);
    expect(recordedProblems([alarm({ pid: 'a', missionT: 5 }), alarm({ pid: 'b', missionT: 50 })])[0].pid).toBe('b');
  });
});
