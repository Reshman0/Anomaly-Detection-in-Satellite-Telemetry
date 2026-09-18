import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GROUND_STATION } from '../engine/orbit';
import ankaraMeta from '../assets/earth/yakin_ankara.json';
import tusasMeta from '../assets/earth/yakin_tusas.json';
import {
  ANKARA_BBOX,
  EARTH_KM,
  FEATHER,
  LEGACY_MIN_DISTANCE,
  MIN_ALT_KM,
  MIN_DISTANCE,
  PATCH_FULL_KM,
  PATCH_HIDDEN_KM,
  TUSAS_BBOX,
  TUSAS_FRAME,
  altitudeKm,
  bboxSizeKm,
  chipLines,
  chipTarget,
  fitAltitudeKm,
  fitFrameAltitudeKm,
  latLonOf,
  markerScale,
  nearPlaneFor,
  patchInView,
  patchOpacity,
  patchUv,
  rotateSpeedFor,
  sphereParams,
  toVec,
  zoomSpeedFor,
  type Bbox,
} from './yakinGoruntu';

const KIZILAY = { lat: 39.92, lon: 32.85 };
const FOV = 38; // GlobeView kamerasi, dusey
const H = 761; // kure tuvali, CSS px
const TAN_V = Math.tan((FOV / 2) * (Math.PI / 180));
const SAHNE = 'S2B_T36TVK_20260912T084537_L2A';

/** d'yi MIN_DISTANCE ile limit arasinda tarar. */
function tara(bitis: number, n = 400): number[] {
  return Array.from({ length: n + 1 }, (_, i) => MIN_DISTANCE + ((bitis - MIN_DISTANCE) * i) / n);
}

/** Kutunun kenar yumusatmasi disinda kalan, tamamen opak ic bolgesi. */
function opak(b: Bbox): Bbox {
  const dLat = (b.north - b.south) * FEATHER;
  const dLon = (b.east - b.west) * FEATHER;
  return { south: b.south + dLat, north: b.north - dLat, west: b.west + dLon, east: b.east - dLon };
}

function icinde(ic: Bbox, dis: Bbox): boolean {
  return ic.south >= dis.south && ic.north <= dis.north && ic.west >= dis.west && ic.east <= dis.east;
}

/** Hocanin cercevesinin enlem/boylam kutusu. */
function cerceveKutusu(): Bbox {
  const f = TUSAS_FRAME;
  const kmPerDeg = (Math.PI * EARTH_KM) / 180;
  const dLat = f.heightKm / 2 / kmPerDeg;
  const dLon = f.widthKm / 2 / (kmPerDeg * Math.cos((f.lat * Math.PI) / 180));
  return { south: f.lat - dLat, north: f.lat + dLat, west: f.lon - dLon, east: f.lon + dLon };
}

describe('yakın görüntü — parça eşlemesi', () => {
  for (const [ad, b] of [
    ['Ankara', ANKARA_BBOX],
    ['TUSAŞ', TUSAS_BBOX],
  ] as const) {
    it(ad + ': kısmi SphereGeometry köşeleri toVec ile birebir aynı', () => {
      const p = sphereParams(b);
      const g = new THREE.SphereGeometry(1, 3, 2, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
      const pos = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      const ilk = new THREE.Vector3().fromBufferAttribute(pos, 0);
      const son = new THREE.Vector3().fromBufferAttribute(pos, pos.count - 1);
      // Ilk satir kuzey-bati, son satir guney-dogu. Konumlar Float32Array'de
      // saklanir: 1e-6 birim = 6 m. Yanlis bir eslemenin hatasi km mertebesinde olurdu.
      expect(ilk.distanceTo(toVec(b.north, b.west, 1))).toBeLessThan(1e-6);
      expect(son.distanceTo(toVec(b.south, b.east, 1))).toBeLessThan(1e-6);
      // Karsi kose ile karistirilmadigini da dogrula (esleme yanlissa bu tutardi).
      expect(ilk.distanceTo(toVec(b.south, b.east, 1))).toBeGreaterThan(1e-3);
      // Kuzey kenar uv.y = 1: kuzey-yukari tuval flipY ile dogrudan oturur.
      expect(uv.getY(0)).toBeCloseTo(1, 12);
      expect(uv.getX(0)).toBeCloseTo(0, 12);
      expect(uv.getY(uv.count - 1)).toBeCloseTo(0, 12);
    });
  }

  it('yer istasyonu ve Kızılay Ankara parçasının opak iç bölgesinde', () => {
    for (const pt of [{ lat: GROUND_STATION.lat_deg, lon: GROUND_STATION.lon_deg }, KIZILAY]) {
      const { u, v } = patchUv(pt.lat, pt.lon);
      expect(u).toBeGreaterThan(FEATHER);
      expect(u).toBeLessThan(1 - FEATHER);
      expect(v).toBeGreaterThan(FEATHER);
      expect(v).toBeLessThan(1 - FEATHER);
    }
  });

  it('TUSAŞ opak olduğu her yerde altındaki Ankara parçası da opak', () => {
    // Ic parcanin tam opak bolgesi dis parcanin tam opak bolgesinde: kuresel
    // doku (baska tarih, ~20 km/piksel) TUSAS'in icinden sizmaz.
    expect(icinde(opak(TUSAS_BBOX), opak(ANKARA_BBOX))).toBe(true);
    expect(icinde(TUSAS_BBOX, ANKARA_BBOX)).toBe(true);
  });

  it('hocanın Copernicus çerçevesi TUSAŞ parçasının opak iç bölgesinde', () => {
    expect(icinde(cerceveKutusu(), opak(TUSAS_BBOX))).toBe(true);
  });

  it('pikseller yerde ~10 m (TUSAŞ) ve ~30 m (Ankara), en ve boy ayrı ayrı', () => {
    for (const m of [tusasMeta, ankaraMeta]) {
      const { widthKm, heightKm } = bboxSizeKm(m.bbox);
      expect(Math.abs((widthKm * 1000) / m.width / m.resolution_m - 1)).toBeLessThan(0.05);
      expect(Math.abs((heightKm * 1000) / m.height / m.resolution_m - 1)).toBeLessThan(0.05);
    }
  });
});

describe('yakın görüntü — gömülü yan dosyalar', () => {
  it('betik ile modül aynı kutuları kullanıyor', () => {
    expect(ankaraMeta.bbox).toEqual(ANKARA_BBOX);
    expect(tusasMeta.bbox).toEqual(TUSAS_BBOX);
    expect(ankaraMeta.resolution_m).toBe(30);
    expect(tusasMeta.resolution_m).toBe(10);
  });

  it('iki parça aynı sahneden: geçişte yalnızca çözünürlük değişir', () => {
    for (const m of [tusasMeta, ankaraMeta]) {
      expect(m.item).toBe(SAHNE);
      expect(m.date).toBe('2026-09-12');
      expect(m.collection).toBe('sentinel-2-c1-l2a');
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(tusasMeta.formula).toBe(ankaraMeta.formula);
    expect(tusasMeta.formula).toContain('L2A optimized True Color');
  });

  it('atıf Copernicus verisini yazıyor, bulut oranı betiğin eşiğinin altında', () => {
    for (const m of [tusasMeta, ankaraMeta]) expect(m.credit).toBe('Contains modified Copernicus Sentinel data 2026');
    expect(tusasMeta.cloud_fraction).toBeLessThanOrEqual(0.0001);
    expect(ankaraMeta.cloud_fraction).toBeLessThanOrEqual(0.005);
  });
});

describe('yakın görüntü — kamera', () => {
  it('eski sınırın üstünde (d ≥ 1.35) davranış değişmez', () => {
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

  it('eski sınırdan 8 km tabana 25 çentikten az', () => {
    let d = LEGACY_MIN_DISTANCE;
    let centik = 0;
    while (d > MIN_DISTANCE + 1e-9 && centik < 100) {
      d = Math.max(MIN_DISTANCE, d * 0.95 ** zoomSpeedFor(d));
      centik++;
    }
    expect(centik).toBeLessThanOrEqual(25);
  });

  it('sürükleme alçakta görüşün sabit oranını kaydırır', () => {
    // G = suruklenen zemin / ekran pikseli basina zemin = π·rs / (a·tan(fov/2))
    for (const d of tara(3.5)) {
      const a = d - 1;
      const G = (Math.PI * rotateSpeedFor(d)) / (a * TAN_V);
      expect(G).toBeCloseTo(1.825, 2);
    }
  });

  it('istasyon işareti her irtifada görünür ama zemini örtmez', () => {
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

  it('TUSAŞ ön ayarı hocanın çerçevesini farklı en-boy oranlarında sığdırır', () => {
    const f = TUSAS_FRAME;
    for (const aspect of [0.6, 0.8, 1, 1.4, 1.8]) {
      const alt = fitFrameAltitudeKm(aspect, FOV, f.widthKm, f.heightKm);
      expect(alt * TAN_V).toBeGreaterThanOrEqual(f.heightKm / 2 - 1e-9);
      expect(alt * TAN_V * aspect).toBeGreaterThanOrEqual(f.widthKm / 2 - 1e-9);
      expect(alt).toBeGreaterThan(MIN_ALT_KM);
    }
    // Kure tuvalinde (~0.8) yaklasik 19 km.
    expect(fitFrameAltitudeKm(0.8, FOV, f.widthKm, f.heightKm)).toBeGreaterThan(17);
    expect(fitFrameAltitudeKm(0.8, FOV, f.widthKm, f.heightKm)).toBeLessThan(21);
    // Kutu sigdirma ayni hesabi kullanir.
    const { widthKm, heightKm } = bboxSizeKm(ANKARA_BBOX);
    expect(fitAltitudeKm(0.8, FOV)).toBeCloseTo(fitFrameAltitudeKm(0.8, FOV, widthKm, heightKm, 1.1), 9);
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

  it('latLonOf, toVec’in tersi', () => {
    for (const [lat, lon] of [
      [40.06796, 32.59751],
      [-33.9, 151.2],
      [0, -179.5],
    ]) {
      const p = latLonOf(toVec(lat, lon, 1.003));
      expect(p.lat).toBeCloseTo(lat, 9);
      expect(p.lon).toBeCloseTo(lon, 9);
    }
  });
});

describe('yakın görüntü — atıf çipi', () => {
  const ust = (lat: number, lon: number, km: number) => toVec(lat, lon, 1 + km / EARTH_KM);
  const hedef = (v: THREE.Vector3) => chipTarget(v, TAN_V, 0.8, TUSAS_BBOX, ANKARA_BBOX);

  it('TUSAŞ ön ayarında çip 10 m’lik parçayı anlatır', () => {
    const alt = fitFrameAltitudeKm(0.8, FOV, TUSAS_FRAME.widthKm, TUSAS_FRAME.heightKm);
    expect(hedef(ust(TUSAS_FRAME.lat, TUSAS_FRAME.lon, alt))).toBe('inner');
    expect(hedef(ust(TUSAS_FRAME.lat, TUSAS_FRAME.lon, MIN_ALT_KM))).toBe('inner');
  });

  it('TUSAŞ üstünde ama yüksekten bakınca, ya da Kızılay üstünde 30 m’lik parça', () => {
    expect(hedef(ust(TUSAS_FRAME.lat, TUSAS_FRAME.lon, 110))).toBe('outer');
    expect(hedef(ust(KIZILAY.lat, KIZILAY.lon, 20))).toBe('outer');
  });

  it('parça görüş dışındayken çip yok', () => {
    expect(hedef(ust(-40, -147, 400))).toBeNull();
  });

  it('metin kaynağı, tarihi, çözünürlüğü ve Göktürk olmadığını yazıyor', () => {
    const [a, b, c] = chipLines(19.4, tusasMeta);
    expect(a).toContain('TUSAŞ');
    expect(a).toContain('12 Eylül 2026');
    expect(b).toContain('Sentinel-2 L2A');
    expect(b).toContain('10 m');
    expect(c).toContain('Göktürk görüntüsü değildir');
    expect(c).toContain('19 km');
    expect(chipLines(110, ankaraMeta)[1]).toContain('30 m');
  });
});
