import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_UCUS_MS, MIN_UCUS_MS, easeInOutCubic, easeInOutSine, ucusKonumu, ucusPlani } from './kameraUcusu';
import { EARTH_KM, TUSAS_FRAME, toVec } from './yakinGoruntu';

const irtifa = (km: number) => 1 + km / EARTH_KM;
/** TUSAS on ayarinin hedefi (1920x1080'de ~19 km). */
const TUSAS = toVec(TUSAS_FRAME.lat, TUSAS_FRAME.lon, irtifa(19.4));

/** Olculen ve kullanilan baslangic noktalari. */
const BASLANGIC: [string, THREE.Vector3][] = [
  ['TÜMÜ görünümü, istasyon üstü', toVec(40.16, 32.68, 6.09)],
  ['LEO görünümü, dünyanın öbür yüzü', toVec(-40, -147, 3.75)],
  ['Japonya üstü 100 km', toVec(36, 139, irtifa(100))],
  ['Kızılay üstü 80 km', toVec(39.92, 32.85, irtifa(80))],
  ['tam ters yön, alçak', toVec(-TUSAS_FRAME.lat, TUSAS_FRAME.lon + 180, irtifa(50))],
];

const ORNEK = 400;
const alt = (v: THREE.Vector3) => v.length() - 1;

describe('kamera uçuşu', () => {
  for (const [ad, bas] of BASLANGIC) {
    it(ad + ': tam başlangıçtan tam hedefe, yere hiç inmeden', () => {
      const p = ucusPlani(bas, TUSAS);
      expect(ucusKonumu(p, 0).distanceTo(bas)).toBeLessThan(1e-12);
      expect(ucusKonumu(p, 1).distanceTo(TUSAS)).toBeLessThan(1e-12);
      const taban = Math.min(alt(bas), alt(TUSAS));
      for (let i = 0; i <= ORNEK; i++) {
        const v = ucusKonumu(p, i / ORNEK);
        expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
        expect(alt(v)).toBeGreaterThanOrEqual(taban * 0.999);
      }
    });

    it(ad + ': hedefe olan açı hiç büyümez (geri dönüş yok)', () => {
      const p = ucusPlani(bas, TUSAS);
      const u1 = TUSAS.clone().normalize();
      let onceki = Infinity;
      for (let i = 0; i <= ORNEK; i++) {
        const a = ucusKonumu(p, i / ORNEK).normalize().angleTo(u1);
        // acos, tam ters yon yakininda ~1e-8 gurultulu.
        expect(a).toBeLessThanOrEqual(onceki + 1e-6);
        onceki = a;
      }
    });

    it(ad + ': kare başına hareket irtifaya göre küçük (yer ekranda sıçramaz)', () => {
      // 60 Hz'de bir kare: dt = 16.7 ms / sure. Kameranin yer degistirmesi,
      // o anki irtifanin %10'unu gecmez (gorus alaninin kucuk bir kesri).
      const p = ucusPlani(bas, TUSAS);
      const dt = 16.7 / p.durationMs;
      for (let t = 0; t + dt <= 1; t += dt) {
        const a = ucusKonumu(p, t);
        const b = ucusKonumu(p, t + dt);
        expect(a.distanceTo(b) / Math.min(alt(a), alt(b))).toBeLessThan(0.1);
      }
    });
  }

  it('uzak ve alçak kalkışta kamera önce yükselir: küre yolculuk boyunca görünür', () => {
    const p = ucusPlani(toVec(36, 139, irtifa(100)), TUSAS);
    expect(p.bump).toBeGreaterThan(0);
    // Ortada en az ~5000 km (0.8 dunya yaricapi).
    expect(alt(ucusKonumu(p, 0.5))).toBeGreaterThan(0.8);
  });

  it('yakın sıçramada tümsek yok: irtifa yalnızca azalır', () => {
    const p = ucusPlani(toVec(39.92, 32.85, irtifa(80)), TUSAS);
    expect(p.bump).toBe(0);
    let onceki = Infinity;
    for (let i = 0; i <= ORNEK; i++) {
      const a = alt(ucusKonumu(p, i / ORNEK));
      expect(a).toBeLessThanOrEqual(onceki + 1e-12);
      onceki = a;
    }
  });

  it('aynı yönde yalnızca yakınlaşma/uzaklaşma (LEO ↔ TÜMÜ)', () => {
    const bas = toVec(40.16, 32.68, 6.09);
    const hedef = bas.clone().setLength(3.75);
    const p = ucusPlani(bas, hedef);
    // acos, ayni yon yakininda ~1e-8 gurultulu.
    expect(p.angle).toBeLessThan(1e-6);
    for (let i = 0; i <= 20; i++) {
      expect(ucusKonumu(p, i / 20).normalize().angleTo(hedef.clone().normalize())).toBeLessThan(1e-6);
    }
  });

  it('süre açıyla ve irtifa oranıyla uzar, sınırlar içinde kalır', () => {
    const yakin = ucusPlani(toVec(39.92, 32.85, irtifa(80)), TUSAS).durationMs;
    const uzak = ucusPlani(toVec(-40, -147, 3.75), TUSAS).durationMs;
    expect(uzak).toBeGreaterThan(yakin);
    for (const [, bas] of BASLANGIC) {
      const d = ucusPlani(bas, TUSAS).durationMs;
      expect(d).toBeGreaterThanOrEqual(MIN_UCUS_MS);
      expect(d).toBeLessThanOrEqual(MAX_UCUS_MS);
    }
  });

  it('yumuşatma eğrileri uçlarda durur ve ortada simetrik', () => {
    for (const f of [easeInOutCubic, easeInOutSine]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      expect(f(0.5)).toBeCloseTo(0.5, 12);
      expect(f(0.2) + f(0.8)).toBeCloseTo(1, 12);
    }
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(0.2) + easeInOutCubic(0.8)).toBeCloseTo(1, 12);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});
