#!/usr/bin/env node
/**
 * Ankara yakin goruntusunu (NASA HLS S30, 30 m) indirip pakete gomulecek yere
 * yazar. GUNCEL temanin global mozaigiyle ayni idiom: goruntu DERLEME ONCESI
 * bir kez cekilir, calisma zamaninda ag istegi yapilmaz. `build`e baglanmaz.
 *
 *   npm run imagery:ankara
 *
 * TARIH SABITTIR. Otomatik secilmez: dosya boyutu bulutlu gunu ayirt etmiyor
 * (olculen: 2026-08-28 buyuk olcude acik 55 KB, 2026-08-30 bulutla kapli
 * 51 KB). 2026-04-15, 150 gunluk taramada bolgeyi tam kaplayan 34 gunun en
 * temizi: maskeli piksel %0,017; yer istasyonu ve Kizilay cevresinde %0.
 *
 * Dogrulama (hepsi gecmeli; biri tutmazsa mevcut dosyalara DOKUNMADAN cikar):
 *   1. HTTP 200 ve Content-Type image/jpeg
 *   2. Data-Present false degil
 *   3. Acquisition-Time sabit tarihle ayni
 *   4. ilk baytlar FF D8 FF (captive portal 200 ile HTML dondurur)
 *   5. >= MIN_BYTES
 *   6. istasyon ve Kizilay cevresindeki kucuk kirpmalar >= MIN_CROP_BYTES.
 *      Bos (veri yok) bolge JPEG'de neredeyse yer kaplamaz. 128x128 kirpmada
 *      olculen: gecerli gun 3235 / 4104 bayt, verisiz gun 380 bayt.
 *
 * Sabitler src/ui/yakinGoruntu.ts ile aynidir; bir birim testi yan dosyayi
 * modulle karsilastirir, kayma CI'da yakalanir.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'assets', 'earth');
const OUT_JPG = join(OUT_DIR, 'ankara_hls.jpg');
const OUT_JSON = join(OUT_DIR, 'ankara_hls.json');

const DATE = '2026-04-15';
const LAYER = 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance';
const BBOX = { south: 39.7, west: 32.45, north: 40.25, east: 33.1 };
const WIDTH = 2400;
const HEIGHT = 2030;
const MIN_BYTES = 500_000;
const MIN_CROP_BYTES = 1_500;
const TIMEOUT_MS = 90_000;
const CHECKPOINTS = {
  istasyon: { lat: 40.1608, lon: 32.6789 },
  kizilay: { lat: 39.92, lon: 32.85 },
};

function url(bbox, w, h) {
  const q = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: DATE,
    // EPSG:4326'da BBOX enlem-once yazilir.
    BBOX: [bbox.south, bbox.west, bbox.north, bbox.east].join(','),
    CRS: 'EPSG:4326',
    LAYERS: LAYER,
    FORMAT: 'image/jpeg',
    WIDTH: String(w),
    HEIGHT: String(h),
  });
  return 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?' + q.toString();
}

function fail(msg) {
  console.error('\nHATA: ' + msg + '\nMevcut dosyalara dokunulmadi.');
  process.exit(1);
}

async function cropBytes({ lat, lon }) {
  const d = 0.02;
  const res = await fetch(
    url({ south: lat - d, west: lon - d * 1.3, north: lat + d, east: lon + d * 1.3 }, 128, 128),
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return 0;
  return (await res.arrayBuffer()).byteLength;
}

console.log('NASA HLS · ' + LAYER + ' · ' + DATE + ' · ' + WIDTH + '×' + HEIGHT);

let res;
try {
  res = await fetch(url(BBOX, WIDTH, HEIGHT), { signal: AbortSignal.timeout(TIMEOUT_MS) });
} catch (err) {
  fail(err && err.name === 'TimeoutError' ? 'zaman aşımı' : String(err && err.message ? err.message : err));
}
if (!res.ok) fail('HTTP ' + res.status);
const type = res.headers.get('Content-Type') || '';
if (!type.startsWith('image/jpeg')) fail('beklenmeyen içerik türü: ' + type);
if (res.headers.get('Data-Present') === 'false') fail('Data-Present: false');
const acquired = (res.headers.get('Acquisition-Time') || '').slice(0, 10);
if (acquired !== DATE) fail('alım tarihi ' + (acquired || 'yok') + ', beklenen ' + DATE);

const buf = Buffer.from(await res.arrayBuffer());
if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) fail('JPEG değil (captive portal olabilir)');
if (buf.length < MIN_BYTES) fail(buf.length + ' bayt — ' + MIN_BYTES + ' bayt tabanının altında');
console.log('  görüntü ' + buf.length + ' bayt ✓');

for (const [name, pt] of Object.entries(CHECKPOINTS)) {
  const n = await cropBytes(pt);
  if (n < MIN_CROP_BYTES) fail(name + ' çevresi boş görünüyor (' + n + ' bayt)');
  console.log('  ' + name + ' kırpması ' + n + ' bayt ✓');
}

const meta = {
  date: DATE,
  layer: LAYER,
  satellite: 'Sentinel-2',
  bbox: BBOX,
  width: WIDTH,
  height: HEIGHT,
  resolution_m: 30,
  doi: '10.5067/HLS/HLSS30.002',
  credit: 'NASA HLS S30 v2.0 · Contains modified Copernicus Sentinel data 2026',
  bytes: buf.length,
  sha256: createHash('sha256').update(buf).digest('hex'),
  fetchedAt: new Date().toISOString(),
};

await writeFile(OUT_JPG, buf);
await writeFile(OUT_JSON, JSON.stringify(meta, null, 2) + '\n', 'utf8');
console.log('\nYazıldı: src/assets/earth/ankara_hls.jpg (' + buf.length + ' bayt)');
