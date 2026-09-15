import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { takipKonumu } from './kameraTakip';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('takip kamerasi', () => {
  it('uzaklik degismez — takip acikken kure kendiliginden zoomlanmaz', () => {
    let kamera = v(0, 0, 7.18);
    const hedef = v(1.2, 0.6, -0.4);
    for (let i = 0; i < 200; i++) {
      kamera = takipKonumu(kamera, hedef, 0.12);
      expect(kamera.length()).toBeCloseTo(7.18, 6);
    }
  });

  it('kamera hedefin yonune yaklasir', () => {
    let kamera = v(5, 0, 0);
    const hedef = v(0, 0, -2);
    const aci = () => kamera.angleTo(hedef);
    const ilk = aci();
    kamera = takipKonumu(kamera, hedef, 0.12);
    const sonra = aci();
    expect(sonra).toBeLessThan(ilk);
    for (let i = 0; i < 300; i++) kamera = takipKonumu(kamera, hedef, 0.12);
    expect(aci()).toBeLessThan(1e-4);
    expect(kamera.length()).toBeCloseTo(5, 6);
  });

  it('tam karsi yondeki hedefte de uzaklik korunur', () => {
    const kamera = takipKonumu(v(0, 0, 4), v(0, 0, -4), 0.12);
    expect(kamera.length()).toBeCloseTo(4, 6);
  });

  it('sifir uzaklik ya da sifir hedef guvenli', () => {
    expect(takipKonumu(v(0, 0, 0), v(1, 0, 0), 0.2).length()).toBe(0);
    expect(takipKonumu(v(0, 0, 3), v(0, 0, 0), 0.2).z).toBe(3);
  });
});
