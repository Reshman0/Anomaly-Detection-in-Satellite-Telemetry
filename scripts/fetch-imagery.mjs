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
 * Dogrulama (ucu birden gecmeli):
 *   1. Data-Present: true
 *   2. Content-Length >= MIN_SNAPSHOT_BYTES — ayni gunun mozaigi henuz
 *      tamamlanmadigi icin kucuk gelir (olculdu: 263 KB'a karsi 608 KB)
 *   3. Ilk baytlar FF D8 FF — captive portal 200 ile HTML dondurur
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
const MAX_LOOKBACK_DAYS = 3;
const TIMEOUT_MS = 45_000;

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function snapshotUrl(date) {
  const q = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: date,
    BBOX: '-90,-180,90,180',
    CRS: 'EPSG:4326',
    LAYERS: LAYER,
    FORMAT: 'image/jpeg',
    WIDTH: String(WIDTH),
    HEIGHT: String(HEIGHT),
  });
  return 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?' + q.toString();
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
  console.log(buf.length + ' bayt ✓');
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
