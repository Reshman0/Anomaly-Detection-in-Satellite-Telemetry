#!/usr/bin/env node
/**
 * NASA EOSDIS GIBS gunluk mozaigini indirip pakete gomulecek yere yazar.
 *
 * TLE tazeleme (README §8) ile ayni idiom: goruntu DERLEME ONCESI bir kez
 * cekilir, calisma zamaninda ag istegi yapilmaz. Bu betik `build`e baglanmaz —
 * baglansa derleme internet ister, CI ve offline hikayesi coker.
 *
 *   npm run imagery
 *
 * Dogrulama (dordu birden gecmeli):
 *   1. Data-Present: true
 *   2. Content-Length >= MIN_BYTES — ayni gunun mozaigi henuz tamamlanmadigi
 *      icin kucuk gelir (olculdu: 263 KB'a karsi 608 KB)
 *   3. Ilk baytlar FF D8 FF — captive portal 200 ile HTML dondurur
 *   4. Turkiye kirpmasi >= MIN_AOI_BYTES — gunluk uretimde EKSIK SERIT olabilir.
 *      Olculen bir ornekte (2026-03-13) Avrupa-Ortadogu-Afrika'yi kaplayan dev
 *      bir bosluk vardi ama dosya 521 KB ile boyut tabanini asiyordu. Bos bir
 *      bolge JPEG'de yer kaplamaz: dolu gunler ~28 000 bayt, bosluklu gun 908.
 *
 * Herhangi biri tutmazsa bir onceki gune yurur. Hepsi basarisizsa sifirdan
 * farkli cikar ve mevcut dosyalara DOKUNMAZ: elde calisan bir goruntu varken
 * onu bozmak, hic goruntu olmamasindan kotudur.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'assets', 'earth');
const OUT_JPG = join(OUT_DIR, 'gibs_current.jpg');
const OUT_JSON = join(OUT_DIR, 'gibs_current.json');

const LAYER = 'VIIRS_SNPP_CorrectedReflectance_TrueColor';
const MIN_BYTES = 400_000;
const WIDTH = 2048;
const HEIGHT = 1024;
// Turkiye ve cevresi — src/ui/gibs.ts icindeki AOI_* sabitleriyle ayni.
const AOI_BBOX = '35,25,43,45';
const AOI_WIDTH = 512;
const AOI_HEIGHT = 205;
const MIN_AOI_BYTES = 5_000;
const MAX_LOOKBACK_DAYS = 3;
const TIMEOUT_MS = 45_000;

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function urlFor(date, bbox, w, h) {
  const q = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: date,
    BBOX: bbox,
    CRS: 'EPSG:4326',
    LAYERS: LAYER,
    FORMAT: 'image/jpeg',
    WIDTH: String(w),
    HEIGHT: String(h),
  });
  return 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?' + q.toString();
}

const snapshotUrl = (date) => urlFor(date, '-90,-180,90,180', WIDTH, HEIGHT);
const aoiCropUrl = (date) => urlFor(date, AOI_BBOX, AOI_WIDTH, AOI_HEIGHT);

/** Turkiye kirpmasinin bayt boyutu; bos bolge neredeyse hic yer kaplamaz. */
async function aoiBytes(date) {
  const res = await fetch(aoiCropUrl(date), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return 0;
  return (await res.arrayBuffer()).byteLength;
}

async function tryDate(date) {
  const url = snapshotUrl(date);
  process.stdout.write('  ' + date + ' … ');
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    console.log('HTTP ' + res.status);
    return null;
  }
  const dataPresent = res.headers.get('Data-Present');
  const acquired = res.headers.get('Acquisition-Time');
  const buf = Buffer.from(await res.arrayBuffer());

  if (dataPresent === 'false') {
    console.log('veri yok (Data-Present: false)');
    return null;
  }
  if (buf.length < MIN_BYTES) {
    console.log(buf.length + ' bayt — eksik kaplama, ' + MIN_BYTES + ' bayt tabanının altında');
    return null;
  }
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
    console.log('JPEG değil (captive portal olabilir)');
    return null;
  }
  // Eksik serit denetimi: tam mozaik gecse bile Turkiye'nin ustu bos olabilir.
  const aoi = await aoiBytes(date);
  if (aoi < MIN_AOI_BYTES) {
    console.log(buf.length + ' bayt, ama Türkiye kırpması ' + aoi + ' bayt — eksik şerit');
    return null;
  }

  console.log(buf.length + ' bayt · Türkiye kırpması ' + aoi + ' bayt ✓');
  return { buf, date: acquired || date };
}

const now = Date.now();
console.log('NASA GIBS · ' + LAYER + ' · ' + WIDTH + '×' + HEIGHT);

let hit = null;
for (let back = 1; back <= MAX_LOOKBACK_DAYS && !hit; back++) {
  const date = isoDay(now - back * 86_400_000);
  try {
    hit = await tryDate(date);
  } catch (err) {
    console.log((err && err.name === 'TimeoutError') ? 'zaman aşımı' : String(err && err.message ? err.message : err));
  }
}

if (!hit) {
  console.error('\nHiçbir güne ait geçerli mozaik alınamadı. Mevcut dosyalara dokunulmadı.');
  process.exit(1);
}

await writeFile(OUT_JPG, hit.buf);
await writeFile(
  OUT_JSON,
  JSON.stringify({ date: hit.date, layer: LAYER, width: WIDTH, height: HEIGHT, fetchedAt: new Date().toISOString() }, null, 2) + '\n',
  'utf8',
);

console.log('\nYazıldı: src/assets/earth/gibs_current.jpg (' + hit.buf.length + ' bayt)');
console.log('Mozaik tarihi: ' + hit.date);
console.log('Şimdi `npm run build` ile pakete gömülür.');
