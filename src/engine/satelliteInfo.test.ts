import { describe, expect, it } from 'vitest';
import {
  DESIGN_LIFE_YEARS,
  LAUNCH_MS,
  memoryHealth,
  missionLife,
  nadirFromElevation,
  regionAt,
  regionTimeline,
} from './satelliteInfo';

const GUN = 86400_000;

describe('nadir acisi', () => {
  it('uydu tam tepedeyken nadir sifirdir', () => {
    // Yukselti 90 derece: istasyon uydunun tam altinda, bakis dogrudan asagi.
    expect(nadirFromElevation(686, 90)).toBeCloseTo(0, 6);
  });

  it('ufuktaki uydu en buyuk nadir acisini verir', () => {
    // Yukselti 0'da nadir = asin(R / (R + h)); 686 km icin ~65 derece.
    const ufuk = nadirFromElevation(686, 0);
    expect(ufuk).toBeGreaterThan(60);
    expect(ufuk).toBeLessThan(70);
  });

  it('yukselti arttikca nadir kucululur', () => {
    const dizi = [0, 20, 45, 70, 89].map((e) => nadirFromElevation(686, e));
    for (let i = 1; i < dizi.length; i++) expect(dizi[i]).toBeLessThan(dizi[i - 1]);
  });

  it('yuksek yorunge nadir acisini daraltir', () => {
    // Uydu yukseldikce ayni yukselti acisi daha dar bir nadir acisina karsilik gelir.
    expect(nadirFromElevation(35786, 30)).toBeLessThan(nadirFromElevation(686, 30));
  });
});

describe('gorev omru', () => {
  it('firlatmadan bir yil sonra gecen sure 365 gundur', () => {
    expect(missionLife(LAUNCH_MS + 365 * GUN).gecenGun).toBe(365);
  });

  it('tasarim omru dolunca kalan gun sifira iner, yuzde 100u asmaz', () => {
    const sonra = missionLife(LAUNCH_MS + (DESIGN_LIFE_YEARS + 2) * 365 * GUN);
    expect(sonra.kalanGun).toBe(0);
    expect(sonra.yuzde).toBe(100);
  });

  it('gecen + kalan toplami tasarim omrunu verir', () => {
    const m = missionLife(LAUNCH_MS + 500 * GUN);
    expect(m.gecenGun + m.kalanGun).toBe(m.toplamGun);
  });
});

describe('bolge adlandirma', () => {
  it('bilinen koordinatlari dogru bolgeye esler', () => {
    expect(regionAt(39.9, 32.8)).toBe('Türkiye'); // Ankara
    expect(regionAt(35.7, 139.7)).toBe('Japonya'); // Tokyo
    expect(regionAt(-33.9, 18.4)).toBe('Güney Afrika'); // Cape Town
  });

  it('en yakin referanstan uzaktaki noktalar acik deniz sayilir', () => {
    // Guney Pasifik'te karadan en uzak nokta (Point Nemo civari).
    expect(regionAt(-48.9, -123.4)).toBe('açık deniz');
  });

  it('yer izi zaman cizelgesi ardisik ayni bolgeleri birlestirir', () => {
    const iz = regionTimeline(Date.parse('2026-09-21T08:10:00Z'), 40 * 60, 60);
    expect(iz.length).toBeGreaterThan(1);
    for (let i = 1; i < iz.length; i++) {
      expect(iz[i].ad, 'ardisik ayni bolge birlesmeli').not.toBe(iz[i - 1].ad);
      expect(iz[i].girisMs).toBeGreaterThan(iz[i - 1].girisMs);
    }
  });
});

describe('kalici hafiza sayaci', () => {
  it('ayni gorev gununde ayni degeri verir', () => {
    expect(memoryHealth(3600).son24Saat).toBe(memoryHealth(7200).son24Saat);
  });

  it('esik asildiginda operatore oneri uretilir', () => {
    const h = memoryHealth(0);
    expect(h.son24Saat).toBeGreaterThan(100);
    expect(h.esikAsildi).toBe(true);
    expect(h.oneri).toContain('yeniden başlat');
    // Duzeltilemeyen hata yok: uyari var ama veri kaybi yok.
    expect(h.duzeltilemeyen).toBe(0);
  });
});
