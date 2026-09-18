#!/usr/bin/env node
/**
 * Yakin goruntuleri (TUSAS 10 m, Ankara 30 m) Copernicus Sentinel-2 L2A'dan
 * uretip pakete gomulecek yere yazar. Goruntuler DERLEME ONCESI bir kez
 * uretilir, calisma zamaninda ag istegi yapilmaz. `build`e baglanmaz.
 *
 *   npm run imagery:yakin
 *
 * KAYNAK: Element 84 Earth Search (AWS Open Data), collection
 * `sentinel-2-c1-l2a`. Copernicus Browser'in gosterdigi urunun aynisidir;
 * hesap ya da anahtar gerekmez. Bantlar Cloud-Optimized GeoTIFF'tir: yalnizca
 * gereken pencere HTTP Range ile okunur (tam dosya ~236 MB).
 *
 * SAHNE SABITTIR: S2B_T36TVK_20260912T084537_L2A (karede %0,001 bulut).
 * Iki goruntu AYNI sahneden, AYNI renk formuluyle uretilir; kure uzerinde ic
 * ice durduklarinda gecis yerinde yalnizca cozunurluk degisir, renk degismez.
 *
 * RENK: Copernicus Browser'in varsayilan "True color" gorunumu. Sentinel Hub
 * custom-scripts deposu (sentinel-2/true_color/README.md) bunun "Sentinel-2
 * L2A optimized True Color" betigi oldugunu yazar
 * (custom-scripts.sentinel-hub.com/sentinel-2/l2a_optimized/). Asagidaki
 * `optimized()` o betigin birebir aktarimidir: parlak alanlari sikistiran
 * kontrast egrisi (maxR 3, midR 0.13), gama 1.8, doygunluk 1.2, sRGB.
 * Duz "2.5 x kazanc" formulu toprak alanlari turuncuya, beyaz catilari
 * patlamis beyaza cevirir; hocanin ekran goruntusu boyle degildi.
 *   yansima = DN x 0.0001 - 0.1   (STAC raster:scale / raster:offset)
 *
 * IZDUSUM: kaynak UTM 36N (EPSG:32636). Cikti enlem/boylam izgarasidir (kure
 * parcasi SphereGeometry'nin UV'si enlem ve boylamda dogrusal). Her cikti
 * pikselinin merkezi proj4 ile UTM'ye cevrilip cift dogrusal orneklenir.
 *
 * Dogrulama (hepsi gecmeli; biri tutmazsa mevcut dosyalara DOKUNMADAN cikar):
 *   1. STAC kaydi: sahne kimligi, tarih, EPSG ve bant izgarasi sabitle ayni
 *   2. RGB bantlarinda veri yok pikseli yok; tekil DN 0 (bozuk dedektor)
 *      ornekleri atlanir, orani <= %0,01
 *   3. SCL (sahne siniflandirmasi): veri yok %0; bulut ve golge
 *      (3, 8, 9, 10) TUSAS'ta <= %0,01, Ankara'da <= %0,5
 *   4. izgara ara degerlemesinin tam izdusumden sapmasi < 1 cm
 *   5. JPEG >= taban bayt
 *
 * Sabitler src/ui/yakinGoruntu.ts ile aynidir; bir birim testi yan dosyalari
 * modulle karsilastirir, kayma CI'da yakalanir.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromUrl } from 'geotiff';
import proj4 from 'proj4';
import jpeg from 'jpeg-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'assets', 'earth');

const STAC = 'https://earth-search.aws.element84.com/v1';
const COLLECTION = 'sentinel-2-c1-l2a';
const ITEM = 'S2B_T36TVK_20260912T084537_L2A';
const DATE = '2026-09-12';
const EPSG = 32636;
const UTM = '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs';
const GRID = { originE: 399960, originN: 4500000, res: 10 };
const SCALE = 0.0001;
const OFFSET = -0.1;
const QUALITY = 88;
const TIMEOUT_MS = 120_000;
/** Kure yaricapi (km) — yakinGoruntu.ts EARTH_KM ile ayni. */
const EARTH_KM = 6371;
const KM_PER_DEG = (Math.PI * EARTH_KM) / 180;

/** SCL siniflari: 0 veri yok, 3 bulut golgesi, 8/9 bulut, 10 ince sirrus. */
const SCL_CLOUD = new Set([3, 8, 9, 10]);

const CUTS = [
  {
    name: 'tusas',
    // Cipin ilk satiri; yer tarifi `place` (cip ipucu).
    label: 'TUSAŞ',
    place: 'TUSAŞ yerleşkesi, pist ve Saray OSB · Kahramankazan, Ankara',
    bbox: { south: 40.0, west: 32.51, north: 40.135, east: 32.685 },
    resM: 10,
    overview: 0, // 10 m
    supersample: 1,
    maxCloud: 0.0001,
    minBytes: 300_000,
  },
  {
    name: 'ankara',
    label: 'Ankara',
    place: 'Ankara ve Kahramankazan yer istasyonu çevresi',
    bbox: { south: 39.7, west: 32.45, north: 40.25, east: 33.1 },
    resM: 30,
    overview: 1, // 20 m onizleme katmani: indirme kucuk kalir
    supersample: 2,
    maxCloud: 0.005,
    minBytes: 300_000,
  },
];

function fail(msg) {
  console.error('\nHATA: ' + msg + '\nMevcut dosyalara dokunulmadi.');
  process.exit(1);
}

const fwd = proj4('EPSG:4326', UTM);

/** Cikti izgarasi boyutu: piksel yerde ~resM metre (en ve boy ayri ayri). */
function gridSize(cut) {
  const b = cut.bbox;
  const midLat = ((b.south + b.north) / 2) * (Math.PI / 180);
  const width = Math.round(((b.east - b.west) * KM_PER_DEG * Math.cos(midLat) * 1000) / cut.resM);
  const height = Math.round(((b.north - b.south) * KM_PER_DEG * 1000) / cut.resM);
  return { width, height };
}

/** Enlem/boylam kutusunun UTM'deki sinirlari (kenarlar egri: yogun ornek). */
function utmBounds(b) {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    for (const [lon, lat] of [
      [b.west + t * (b.east - b.west), b.south],
      [b.west + t * (b.east - b.west), b.north],
      [b.west, b.south + t * (b.north - b.south)],
      [b.east, b.south + t * (b.north - b.south)],
    ]) {
      const [e, nn] = fwd.forward([lon, lat]);
      minE = Math.min(minE, e); maxE = Math.max(maxE, e);
      minN = Math.min(minN, nn); maxN = Math.max(maxN, nn);
    }
  }
  return { minE, maxE, minN, maxN };
}

/**
 * Cikti pikseli merkezlerinin UTM koordinatlari. Izdusum her 8 pikselde bir
 * tam hesaplanir, arasi cift dogrusal: 15 km'lik kutuda egrilik hatasi
 * milimetrenin altinda (dogrulama 4 bunu olcer).
 */
function utmGrid(cut, width, height, sub) {
  const b = cut.bbox;
  const W = width * sub;
  const H = height * sub;
  const lonAt = (i) => b.west + ((i + 0.5) / W) * (b.east - b.west);
  const latAt = (j) => b.north - ((j + 0.5) / H) * (b.north - b.south);
  const STEP = 8;
  const gw = Math.ceil((W - 1) / STEP) + 1;
  const gh = Math.ceil((H - 1) / STEP) + 1;
  const nodeE = new Float64Array(gw * gh);
  const nodeN = new Float64Array(gw * gh);
  for (let gj = 0; gj < gh; gj++) {
    for (let gi = 0; gi < gw; gi++) {
      const [e, n] = fwd.forward([lonAt(Math.min(gi * STEP, W - 1)), latAt(Math.min(gj * STEP, H - 1))]);
      nodeE[gj * gw + gi] = e;
      nodeN[gj * gw + gi] = n;
    }
  }
  const E = new Float64Array(W * H);
  const N = new Float64Array(W * H);
  for (let j = 0; j < H; j++) {
    const gj = Math.min(Math.floor(j / STEP), gh - 2);
    const j0 = gj * STEP;
    const j1 = Math.min((gj + 1) * STEP, H - 1);
    const ty = j1 > j0 ? (j - j0) / (j1 - j0) : 0;
    for (let i = 0; i < W; i++) {
      const gi = Math.min(Math.floor(i / STEP), gw - 2);
      const i0 = gi * STEP;
      const i1 = Math.min((gi + 1) * STEP, W - 1);
      const tx = i1 > i0 ? (i - i0) / (i1 - i0) : 0;
      const a = gj * gw + gi;
      const lerp = (arr) =>
        (arr[a] * (1 - tx) + arr[a + 1] * tx) * (1 - ty) + (arr[a + gw] * (1 - tx) + arr[a + gw + 1] * tx) * ty;
      E[j * W + i] = lerp(nodeE);
      N[j * W + i] = lerp(nodeN);
    }
  }
  // Dogrulama 4: rastgele noktalarda ara degerleme ile tam izdusum farki.
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    const i = Math.floor(Math.random() * W);
    const j = Math.floor(Math.random() * H);
    const [e, n] = fwd.forward([lonAt(i), latAt(j)]);
    worst = Math.max(worst, Math.hypot(e - E[j * W + i], n - N[j * W + i]));
  }
  if (worst >= 0.01) fail(cut.name + ': ara değerleme hatası ' + worst.toFixed(4) + ' m');
  return { E, N, W, H, worst };
}

async function readWindow(url, overview, bounds, pad = 3) {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage(overview);
  const full = await tiff.getImage(0);
  const [ox, oy] = full.getOrigin();
  if (ox !== GRID.originE || oy !== GRID.originN) fail('beklenmeyen ızgara başlangıcı ' + ox + ',' + oy + ' — ' + url);
  const res = (full.getResolution()[0] * full.getWidth()) / image.getWidth();
  const x0 = Math.max(0, Math.floor((bounds.minE - ox) / res) - pad);
  const x1 = Math.min(image.getWidth(), Math.ceil((bounds.maxE - ox) / res) + pad);
  const y0 = Math.max(0, Math.floor((oy - bounds.maxN) / res) - pad);
  const y1 = Math.min(image.getHeight(), Math.ceil((oy - bounds.minN) / res) + pad);
  const [data] = await image.readRasters({ window: [x0, y0, x1, y1] });
  return { data, w: x1 - x0, h: y1 - y0, e0: ox + x0 * res, n0: oy - y0 * res, res };
}

/** Atlanan (DN 0) kaynak ornek sayisi — dogrulama 2 bunu sinirlar. */
let skipped = 0;

/**
 * Cift dogrusal ornek; kaynak piksel merkezleri tam sayi + 0.5'te. DN 0
 * (veri yok / bozuk dedektor pikseli) ornekler atlanir, kalan komsularin
 * agirliklari yeniden olceklenir. Olculen: 12 Eylul sahnesinde TUSAS
 * penceresinde yalnizca B02'de 5 tekil sifir piksel var (degraded %0,0082).
 */
function bilinear(src, e, n) {
  const fx = (e - src.e0) / src.res - 0.5;
  const fy = (src.n0 - n) / src.res - 0.5;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  const tx = fx - x;
  const ty = fy - y;
  if (x < 0 || y < 0 || x + 1 >= src.w || y + 1 >= src.h) return NaN;
  const d = src.data;
  const a = y * src.w + x;
  const v = [d[a], d[a + 1], d[a + src.w], d[a + src.w + 1]];
  const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  let sum = 0;
  let wsum = 0;
  for (let k = 0; k < 4; k++) {
    if (v[k] === 0) {
      if (w[k] > 0) skipped++;
      continue;
    }
    sum += v[k] * w[k];
    wsum += w[k];
  }
  return wsum > 1e-9 ? sum / wsum : NaN;
}

function nearest(src, e, n) {
  const x = Math.floor((e - src.e0) / src.res);
  const y = Math.floor((src.n0 - n) / src.res);
  if (x < 0 || y < 0 || x >= src.w || y >= src.h) return 0;
  return src.data[y * src.w + x];
}

// --- Sentinel-2 L2A optimized True Color (Sentinel Hub custom-scripts) ---
const maxR = 3.0;
const midR = 0.13;
const sat = 1.2;
const gamma = 1.8;
const gOff = 0.01;
const gOffPow = Math.pow(gOff, gamma);
const gOffRange = Math.pow(1 + gOff, gamma) - gOffPow;
const clip = (s) => (s < 0 ? 0 : s > 1 ? 1 : s);
/** Kontrast artirma ve parlak alan sikistirma. */
function adj(a, tx, ty, maxC) {
  const ar = clip(a / maxC);
  return (ar * (ar * (tx / maxC + ty - 1) - ty)) / (ar * ((2 * tx) / maxC - 1) - tx / maxC);
}
const adjGamma = (b) => (Math.pow(b + gOff, gamma) - gOffPow) / gOffRange;
const sAdj = (a) => adjGamma(adj(a, midR, 1, maxR));
const sRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 0.41666666666) - 0.055);
/** Yansima (B04, B03, B02) -> 8 bit RGB. */
function optimized(r, g, b) {
  const lr = sAdj(r);
  const lg = sAdj(g);
  const lb = sAdj(b);
  const avgS = ((lr + lg + lb) / 3.0) * (1 - sat);
  return [lr, lg, lb].map((c) => Math.round(sRGB(clip(avgS + c * sat)) * 255));
}
const refl = (dn) => dn * SCALE + OFFSET;

// ---------------------------------------------------------------------------

console.log('Sentinel-2 L2A · ' + ITEM);

let item;
try {
  const res = await fetch(STAC + '/collections/' + COLLECTION + '/items/' + ITEM, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) fail('STAC HTTP ' + res.status);
  item = await res.json();
} catch (err) {
  fail('STAC: ' + (err && err.message ? err.message : err));
}
const p = item.properties;
if (item.id !== ITEM) fail('sahne kimliği ' + item.id);
if (!String(p.datetime).startsWith(DATE)) fail('sahne tarihi ' + p.datetime + ', beklenen ' + DATE);
if ((p['proj:epsg'] ?? Number(String(p['proj:code']).split(':')[1])) !== EPSG) fail('EPSG ' + (p['proj:epsg'] ?? p['proj:code']));
const href = (k) => {
  const a = item.assets[k];
  if (!a) fail('varlık yok: ' + k);
  return a.href;
};
const redT = item.assets.red['proj:transform'];
if (redT && (redT[0] !== GRID.res || redT[2] !== GRID.originE || redT[5] !== GRID.originN)) fail('B04 ızgarası ' + redT);
const band = item.assets.red['raster:bands']?.[0];
if (band && (band.scale !== SCALE || band.offset !== OFFSET)) fail('ölçek/ofset ' + band.scale + '/' + band.offset);
console.log('  sahne ' + p.datetime + ' · bulut %' + Number(p['eo:cloud_cover']).toFixed(3) + ' ✓');

const outputs = [];
for (const cut of CUTS) {
  const { width, height } = gridSize(cut);
  const bounds = utmBounds(cut.bbox);
  const sub = cut.supersample;
  console.log('\n' + cut.name + ' · ' + width + '×' + height + ' · ' + cut.resM + ' m');

  const [red, green, blue, scl] = await Promise.all([
    readWindow(href('red'), cut.overview, bounds),
    readWindow(href('green'), cut.overview, bounds),
    readWindow(href('blue'), cut.overview, bounds),
    readWindow(href('scl'), 0, bounds),
  ]);
  console.log('  pencere ' + red.w + '×' + red.h + ' (' + red.res + ' m) okundu');

  const g = utmGrid(cut, width, height, sub);
  console.log('  ara değerleme hatası en çok ' + (g.worst * 1000).toFixed(2) + ' mm ✓');

  const rgba = Buffer.alloc(width * height * 4);
  const counts = new Map();
  let nodata = 0;
  skipped = 0;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let r = 0, gg = 0, bb = 0, ok = true;
      for (let sj = 0; sj < sub && ok; sj++) {
        for (let si = 0; si < sub; si++) {
          const k = (j * sub + sj) * g.W + (i * sub + si);
          const vr = bilinear(red, g.E[k], g.N[k]);
          const vg = bilinear(green, g.E[k], g.N[k]);
          const vb = bilinear(blue, g.E[k], g.N[k]);
          if (Number.isNaN(vr) || Number.isNaN(vg) || Number.isNaN(vb)) {
            ok = false;
            break;
          }
          r += vr; gg += vg; bb += vb;
          const c = nearest(scl, g.E[k], g.N[k]);
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
      }
      const o = (j * width + i) * 4;
      if (!ok) {
        nodata++;
        continue;
      }
      const s2 = sub * sub;
      const [R, G, B] = optimized(refl(r / s2), refl(gg / s2), refl(bb / s2));
      rgba[o] = R;
      rgba[o + 1] = G;
      rgba[o + 2] = B;
      rgba[o + 3] = 255;
    }
  }
  if (nodata > 0) fail(cut.name + ': ' + nodata + ' pikselde veri yok');
  const samples = width * height * sub * sub * 3;
  if (skipped / samples > 1e-4) fail(cut.name + ': atlanan DN 0 örnek oranı ' + (skipped / samples));
  console.log('  veri yok pikseli 0 · atlanan tekil DN 0 örneği ' + skipped + ' ✓');

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const frac = (set) => [...counts].filter(([c]) => set.has(c)).reduce((a, [, n]) => a + n, 0) / total;
  const scl0 = (counts.get(0) ?? 0) / total;
  const cloud = frac(SCL_CLOUD);
  if (scl0 > 0) fail(cut.name + ': SCL veri yok oranı ' + scl0);
  if (cloud > cut.maxCloud) fail(cut.name + ': bulut/gölge oranı %' + (cloud * 100).toFixed(3) + ' > %' + (cut.maxCloud * 100).toFixed(2));
  console.log('  SCL bulut/gölge %' + (cloud * 100).toFixed(4) + ' ✓');

  const jpg = Buffer.from(jpeg.encode({ data: rgba, width, height }, QUALITY).data);
  if (!(jpg[0] === 0xff && jpg[1] === 0xd8 && jpg[2] === 0xff)) fail(cut.name + ': JPEG değil');
  if (jpg.length < cut.minBytes) fail(cut.name + ': ' + jpg.length + ' bayt — taban ' + cut.minBytes);
  console.log('  JPEG ' + jpg.length + ' bayt ✓');

  const sclFractions = Object.fromEntries([...counts].sort((a, b) => a[0] - b[0]).map(([c, n]) => [String(c), Number((n / total).toFixed(6))]));
  outputs.push({
    cut,
    jpg,
    meta: {
      name: cut.name,
      label: cut.label,
      place: cut.place,
      date: DATE,
      item: ITEM,
      collection: COLLECTION,
      platform: p.platform,
      product: 'L2A',
      tile: '36TVK',
      source: 'Earth Search (Element 84) · AWS Open Data',
      bbox: cut.bbox,
      width,
      height,
      resolution_m: cut.resM,
      formula: 'Copernicus Browser True color: Sentinel-2 L2A optimized True Color (Sentinel Hub custom-scripts); yansıma = DN × 0.0001 − 0.1',
      credit: 'Contains modified Copernicus Sentinel data 2026',
      cloud_fraction: Number(cloud.toFixed(6)),
      skipped_zero_samples: skipped,
      scl_fractions: sclFractions,
      bytes: jpg.length,
      sha256: createHash('sha256').update(jpg).digest('hex'),
      fetchedAt: new Date().toISOString(),
    },
  });
}

// Hepsi gecti: simdi yaz.
for (const o of outputs) {
  await writeFile(join(OUT_DIR, 'yakin_' + o.cut.name + '.jpg'), o.jpg);
  await writeFile(join(OUT_DIR, 'yakin_' + o.cut.name + '.json'), JSON.stringify(o.meta, null, 2) + '\n', 'utf8');
  console.log('\nYazıldı: src/assets/earth/yakin_' + o.cut.name + '.jpg (' + o.jpg.length + ' bayt)');
}
