import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GROUND_STATION } from '../engine/orbit';
import meta from '../assets/earth/ankara_hls.json';
import {
  ANKARA_BBOX,
  FEATHER,
  LEGACY_MIN_DISTANCE,
  MIN_DISTANCE,
  PATCH_FULL_KM,
  PATCH_HIDDEN_KM,
  altitudeKm,
  bboxSizeKm,
  chipLines,
  fitAltitudeKm,
  markerScale,
  nearPlaneFor,
  patchInView,
  patchOpacity,
  patchUv,
  rotateSpeedFor,
  sphereParams,
  toVec,
  zoomSpeedFor,
} from './yakinGoruntu';

const KIZILAY = { lat: 39.92, lon: 32.85 };
const FOV = 38; // GlobeView kamerasi, dusey
const H = 761; // kure tuvali, CSS px
const TAN_V = Math.tan((FOV / 2) * (Math.PI / 180));

/** d'yi MIN_DISTANCE ile limit arasinda tarar. */
function tara(bitis: number, n = 400): number[] {
  return Array.from({ length: n + 1 }, (_, i) => MIN_DISTANCE + ((bitis - MIN_DISTANCE) * i) / n);
}

describe('yakın görüntü — parça eşlemesi', () => {
  it('kısmi SphereGeometry köşeleri toVec ile birebir aynı', () => {
    const p = sphereParams();
    const g = new THREE.SphereGeometry(1, 3, 2, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    const ilk = new THREE.Vector3().fromBufferAttribute(pos, 0);
    const son = new THREE.Vector3().fromBufferAttribute(pos, pos.count - 1);
    // Ilk satir kuzey-bati, son satir guney-dogu. Konumlar Float32Array'de
    // saklanir: 1e-6 birim = 6 m. Yanlis bir eslemenin hatasi ~0.01 (60 km) olurdu.
    expect(ilk.distanceTo(toVec(ANKARA_BBOX.north, ANKARA_BBOX.west, 1))).toBeLessThan(1e-6);
    expect(son.distanceTo(toVec(ANKARA_BBOX.south, ANKARA_BBOX.east, 1))).toBeLessThan(1e-6);
    // Karsi kose ile karistirilmadigini da dogrula (esleme yanlissa bu tutardi).
    expect(ilk.distanceTo(toVec(ANKARA_BBOX.south, ANKARA_BBOX.east, 1))).toBeGreaterThan(1e-3);
    // Kuzey kenar uv.y = 1: kuzey-yukari tuval flipY ile dogrudan oturur.
    expect(uv.getY(0)).toBeCloseTo(1, 12);
    expect(uv.getX(0)).toBeCloseTo(0, 12);
    expect(uv.getY(uv.count - 1)).toBeCloseTo(0, 12);
  });

  it('yer istasyonu ve Kızılay kutunun opak iç bölgesinde', () => {
    for (const pt of [{ lat: GROUND_STATION.lat_deg, lon: GROUND_STATION.lon_deg }, KIZILAY]) {
      const { u, v } = patchUv(pt.lat, pt.lon);
      expect(u).toBeGreaterThan(FEATHER);
      expect(u).toBeLessThan(1 - FEATHER);
      expect(v).toBeGreaterThan(FEATHER);
      expect(v).toBeLessThan(1 - FEATHER);
    }
  });

  it('gömülü görüntünün pikselleri derece cinsinden kare', () => {
    const pxLon = (ANKARA_BBOX.east - ANKARA_BBOX.west) / meta.width;
    const pxLat = (ANKARA_BBOX.north - ANKARA_BBOX.south) / meta.height;
    expect(Math.abs(pxLon / pxLat - 1)).toBeLessThan(0.001);
  });
});

describe('yakın görüntü — gömülü yan dosya', () => {
  it('betik ile modül aynı kutuyu ve tarihi kullanıyor', () => {
    expect(meta.bbox).toEqual(ANKARA_BBOX);
    expect(meta.date).toBe('2026-04-15');
    expect(meta.layer).toBe('HLS_S30_Nadir_BRDF_Adjusted_Reflectance');
    expect([meta.width, meta.height]).toEqual([2400, 2030]);
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('atıf Copernicus türevini ve DOI’yi taşıyor', () => {
    expect(meta.credit).toContain('Contains modified Copernicus Sentinel data');
    expect(meta.doi).toBe('10.5067/HLS/HLSS30.002');
  });
});

describe('yakın görüntü — kamera', () => {
  it('bugünkü aralıkta (d ≥ 1.35) davranış değişmez', () => {
    for (const d of [LEGACY_MIN_DISTANCE, 1.5, 3.75, 4.6, 6.09, 7.47, 40]) {
      expect(zoomSpeedFor(d)).toBe(0.7);
      expect(markerScale(d)).toBe(1);
      expect(nearPlaneFor(d)).toBe(0.05);
    }
    // Donus hizi LEO ve TUMU on ayar mesafelerinde bugunku degerinde.
    for (const d of [3.75, 4.6, 6.09, 7.47]) expect(rotateSpeedFor(d)).toBe(0.5);
  });

  it('yakın kırpma zemini asla kesmez ve mesafeyle azalmaz', () => {
    let onceki = 0;
    for (const d of tara(1.2)) {
      const n = nearPlaneFor(d);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(0.5 * (d - 1) + 1e-12);
      expect(n).toBeGreaterThanOrEqual(onceki);
      // En yuksek isaretci (istasyon, 1 + 0.004·s) bile kirpilmaz.
      expect(d - (1 + 0.004 * markerScale(d))).toBeGreaterThan(n);
      onceki = n;
    }
    expect(nearPlaneFor(1.1)).toBe(0.05);
  });

  it('tekerlek çentiği yüzeye yakın irtifayı sabit oranla küçültür', () => {
    // OrbitControls: bir centik mesafeyi 0.95^zoomSpeed ile carpar.
    for (const d of tara(1.19)) {
      const yeni = d * 0.95 ** zoomSpeedFor(d);
      const oran = (yeni - 1) / (d - 1);
      expect(oran).toBeGreaterThan(0.75);
      expect(oran).toBeLessThan(0.8);
      // Uzaklasma her zaman mesafeyi artirir.
      expect(d / 0.95 ** zoomSpeedFor(d)).toBeGreaterThan(d);
    }
  });

  it('bugünkü sınırdan tabana 20 çentikten az', () => {
    let d = LEGACY_MIN_DISTANCE;
    let centik = 0;
    while (d > MIN_DISTANCE + 1e-9 && centik < 100) {
      d = Math.max(MIN_DISTANCE, d * 0.95 ** zoomSpeedFor(d));
      centik++;
    }
    expect(centik).toBeLessThanOrEqual(20);
  });

  it('sürükleme alçakta görüşün sabit oranını kaydırır', () => {
    // G = suruklenen zemin / ekran pikseli basina zemin = π·rs / (a·tan(fov/2))
    for (const d of tara(3.5)) {
      const a = d - 1;
      const G = (Math.PI * rotateSpeedFor(d)) / (a * TAN_V);
      expect(G).toBeCloseTo(1.825, 2);
    }
  });

  it('istasyon işareti her irtifada görünür ama parçayı örtmez', () => {
    for (const d of tara(LEGACY_MIN_DISTANCE)) {
      const a = d - 1;
      const capPx = (2 * 0.011 * markerScale(d) * H) / (2 * a * TAN_V);
      expect(capPx).toBeGreaterThanOrEqual(8);
    }
    // 120 km'de ortulen zemin (cap) 2 km'yi gecmez.
    const d120 = 1 + 120 / 6371;
    expect(2 * 0.011 * markerScale(d120) * 6371).toBeLessThanOrEqual(2);
  });
});

describe('yakın görüntü — görünürlük ve çerçeve', () => {
  it('parça opaklığı uçlarda doğru ve irtifayla artmaz', () => {
    expect(patchOpacity(0)).toBe(1);
    expect(patchOpacity(PATCH_FULL_KM)).toBe(1);
    expect(patchOpacity(PATCH_HIDDEN_KM)).toBe(0);
    expect(patchOpacity(altitudeKm(LEGACY_MIN_DISTANCE))).toBe(0);
    let onceki = 1;
    for (let km = 0; km <= 3000; km += 25) {
      const o = patchOpacity(km);
      expect(o).toBeLessThanOrEqual(onceki + 1e-12);
      onceki = o;
    }
  });

  it('ANKARA çerçevesi kutuyu farklı en-boy oranlarında sığdırır', () => {
    const { widthKm, heightKm } = bboxSizeKm();
    for (const aspect of [0.6, 0.8, 1, 1.4, 1.8]) {
      const alt = fitAltitudeKm(aspect, FOV);
      expect(alt * TAN_V).toBeGreaterThanOrEqual(heightKm / 2);
      expect(alt * TAN_V * aspect).toBeGreaterThanOrEqual(widthKm / 2);
      expect(alt).toBeGreaterThan(40);
    }
    // Kure tuvalinde (~0.8) yaklasik 110 km.
    expect(fitAltitudeKm(0.8, FOV)).toBeGreaterThan(100);
    expect(fitAltitudeKm(0.8, FOV)).toBeLessThan(125);
  });

  it('parça yalnızca kameranın baktığı yerdeyken ekranda sayılır', () => {
    const tanDiag = Math.hypot(TAN_V, TAN_V * 0.8);
    const merkez = { lat: 39.975, lon: 32.775 };
    const ust = (km: number) => toVec(merkez.lat, merkez.lon, 1 + km / 6371);
    expect(patchInView(ust(110), tanDiag)).toBe(true);
    // 110 km'de 5° ote (yaklasik 550 km): gorus disi.
    expect(patchInView(toVec(merkez.lat, merkez.lon + 5, 1 + 110 / 6371), tanDiag)).toBe(false);
    // Dunyanin ote yuzu.
    expect(patchInView(toVec(-merkez.lat, merkez.lon + 180, 1.2), tanDiag)).toBe(false);
  });
});

describe('yakın görüntü — atıf çipi', () => {
  it('kaynak, tarih ve Göktürk olmadığı yazıyor', () => {
    const [a, b, c] = chipLines(47.6, '2026-04-15');
    expect(a).toContain('15 Nisan 2026');
    expect(b).toContain('Sentinel-2');
    expect(b).toContain('NASA HLS');
    expect(c).toContain('Göktürk görüntüsü değildir');
    expect(c).toContain('48 km');
  });
});
