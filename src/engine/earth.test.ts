import { describe, expect, it } from 'vitest';
import {
  POLAR_RATIO,
  WGS84_A_KM,
  WGS84_B_KM,
  footprintRingLatLon,
  geodeticToEcefUnit,
} from './earth';

const D2R = Math.PI / 180;

/** Sahne biriminden km'ye: birim = ekvator yaricapi. */
function radiusKm(latDeg: number, lonDeg: number, hKm = 0): number {
  const v = geodeticToEcefUnit(latDeg, lonDeg, hKm);
  return Math.hypot(v.x, v.y, v.z) * WGS84_A_KM;
}

/** Bir noktanin jeosentrik enlemi (derece). */
function geocentricLatDeg(latDeg: number, lonDeg: number): number {
  const v = geodeticToEcefUnit(latDeg, lonDeg);
  return Math.atan2(v.y, Math.hypot(v.x, v.z)) / D2R;
}

describe('WGS84 Dunya modeli', () => {
  it('tanimlayici parametreler WGS84 degerleridir', () => {
    expect(WGS84_A_KM).toBe(6378.137);
    expect(WGS84_B_KM).toBeCloseTo(6356.752314, 5);
    expect(POLAR_RATIO).toBeCloseTo(0.996647189, 9);
  });

  it('yuzey yaricapi ekvatorda a, kutupta b degerine esittir', () => {
    expect(radiusKm(0, 0)).toBeCloseTo(6378.137, 6);
    expect(radiusKm(0, 90)).toBeCloseTo(6378.137, 6);
    expect(radiusKm(90, 0)).toBeCloseTo(6356.752314, 5);
    expect(radiusKm(-90, 0)).toBeCloseTo(6356.752314, 5);
  });

  /**
   * Model kusursuz kureye geri donerse bu test kirmizi olur: kurede jeodezik
   * ve jeosentrik enlem esittir, elipsoitte 45 derecede 0.1924 derece ayrilir.
   */
  it('jeodezik enlem jeosentrik enlemden ayrilir; fark 45 derecede en buyuktur', () => {
    expect(geocentricLatDeg(45, 0)).toBeCloseTo(44.80757, 4);
    const fark = (lat: number) => Math.abs(lat - geocentricLatDeg(lat, 0));
    expect(fark(45)).toBeCloseTo(0.19243, 4);
    expect(fark(45)).toBeGreaterThan(fark(30));
    expect(fark(45)).toBeGreaterThan(fark(60));
    // Kutup ve ekvatorda iki enlem tanimi cakisir.
    expect(fark(0)).toBeCloseTo(0, 9);
    expect(fark(90)).toBeCloseTo(0, 9);
  });

  it('yukseklik elipsoit normali boyunca eklenir', () => {
    // Kutupta ve ekvatorda normal yaricap yonundedir: yaricap tam h kadar artar.
    expect(radiusKm(0, 0, 700) - radiusKm(0, 0)).toBeCloseTo(700, 6);
    expect(radiusKm(90, 0, 700) - radiusKm(90, 0)).toBeCloseTo(700, 6);
  });

  it('boylam dogru yone donduruluyor ve kutup ekseni y', () => {
    const p0 = geodeticToEcefUnit(0, 0);
    expect(p0.x).toBeCloseTo(1, 9);
    expect(p0.y).toBeCloseTo(0, 9);
    expect(p0.z).toBeCloseTo(0, 9);
    const p90 = geodeticToEcefUnit(0, 90);
    expect(p90.z).toBeCloseTo(1, 9);
    expect(p90.x).toBeCloseTo(0, 9);
    const kutup = geodeticToEcefUnit(90, 0);
    expect(kutup.y).toBeCloseTo(POLAR_RATIO, 9);
  });

  it('gorus konisi halkasi merkezden esit acisal uzakliktadir ve kapalidir', () => {
    const lat0 = 40.1608;
    const lon0 = 32.679;
    const yaricapDeg = 18;
    const halka = footprintRingLatLon(lat0, lon0, yaricapDeg, 64);
    expect(halka).toHaveLength(65);

    const merkez = geodeticToEcefUnit(lat0, lon0);
    const birim = (v: { x: number; y: number; z: number }) => {
      const n = Math.hypot(v.x, v.y, v.z);
      return { x: v.x / n, y: v.y / n, z: v.z / n };
    };
    // Acisal uzaklik jeosentrik yonler uzerinden olculur; elipsoit basikligi
    // nedeniyle jeodezik yaricapla birebir esit olmaz, ama halka boyunca sabittir.
    const m = birim(merkez);
    const acilar = halka.map((p) => {
      const u = birim(geodeticToEcefUnit(p.latDeg, p.lonDeg));
      return (Math.acos(Math.min(1, m.x * u.x + m.y * u.y + m.z * u.z)) / D2R);
    });
    const enBuyuk = Math.max(...acilar);
    const enKucuk = Math.min(...acilar);
    expect(enBuyuk - enKucuk).toBeLessThan(0.15);
    expect(enBuyuk).toBeLessThan(yaricapDeg + 0.2);
    expect(enKucuk).toBeGreaterThan(yaricapDeg - 0.2);

    // Halka kapali: ilk ve son nokta ayni yer.
    expect(halka[0].latDeg).toBeCloseTo(halka[64].latDeg, 9);
    expect(Math.abs(halka[0].lonDeg - halka[64].lonDeg) % 360).toBeCloseTo(0, 6);
  });
});
