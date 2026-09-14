/**
 * NASA EOSDIS GIBS gunluk mozaigi — saf yardimcilar.
 *
 * Bu dosya bilerek DOM'suzdur ve `../store`dan DEGER import etmez: testler
 * `environment: 'node'` altinda kosar, `store.ts` ise modul duzeyinde
 * `document.documentElement`e dokunur. Tip importu serbesttir (derlemede silinir).
 *
 * Kaynak: NASA Worldview Snapshots API, kamu mali, anahtar gerekmez.
 * Goruntu bir GUNLUK MOZAIKTIR — bir gunluk yorunge seritlerinden dikilmis,
 * anlik goruntu degil. Arayuzde "canli" denmez, alim tarihi yazilir.
 */

export const GIBS_ENDPOINT = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot';
export const GIBS_LAYER = 'VIIRS_SNPP_CorrectedReflectance_TrueColor';

/**
 * Gecerli sayilan en kucuk dosya boyutu. Ayni gunun mozaigi gun ortasina kadar
 * eksik doner ve kucuk gelir: olculen degerler 263 067 bayt (eksik) ve
 * 608 703 bayt (tam).
 */
export const MIN_SNAPSHOT_BYTES = 400_000;

export const SNAPSHOT_WIDTH = 2048;
export const SNAPSHOT_HEIGHT = 1024;

/**
 * Ilgi alani: Turkiye ve cevresi (enlem 35..43, boylam 25..45).
 *
 * Tam mozaik boyutu, gunluk uretimdeki EKSIK SERITLERI yakalamaz: olculen bir
 * ornekte (2026-03-13) Avrupa-Ortadogu-Afrika'yi kaplayan dev bir bosluk vardi
 * ama dosya yine 521 kB geliyordu, yani boyut tabanini asiyordu. Turkiye'nin
 * ustunde siyah bir kama ile demoya cikmak kabul edilemez.
 *
 * Cozum kod cozucu gerektirmez: ayni gunun Turkiye kirpmasi ayrica istenir.
 * Bos (duz siyah) bir bolge JPEG'de neredeyse hic yer kaplamaz. Olculen:
 * dolu gunler ~28 000 bayt, bosluklu gun 908 bayt.
 */
export const AOI_BBOX = '35,25,43,45';
export const AOI_WIDTH = 512;
export const AOI_HEIGHT = 205;
export const MIN_AOI_BYTES = 5_000;

/** Varsayilan zaman asimi: sahne wifi'sinde asili kalmasin. */
export const DEFAULT_TIMEOUT_MS = 8000;

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Anlik goruntu URL'i. BBOX enlem-once yazilir: -90,-180,90,180. */
export function snapshotUrl(date: string, w: number = SNAPSHOT_WIDTH, h: number = SNAPSHOT_HEIGHT): string {
  const q = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: date,
    BBOX: '-90,-180,90,180',
    CRS: 'EPSG:4326',
    LAYERS: GIBS_LAYER,
    FORMAT: 'image/jpeg',
    WIDTH: String(w),
    HEIGHT: String(h),
  });
  return GIBS_ENDPOINT + '?' + q.toString();
}

/**
 * Tam kaplamasi beklenen en yeni gun: UTC'ye gore DUN. Bugunun mozaigi gun
 * ortasina kadar eksiktir. Yerel saat dilimine bakilmaz — Turkiye'de gece
 * yarisini gecmis olmak UTC gunune bir sey katmaz.
 */
export function latestAvailableDate(nowMs: number): string {
  return new Date(nowMs - 86_400_000).toISOString().slice(0, 10);
}

/**
 * '2026-09-13' -> '13 Eylül 2026'.
 *
 * `toLocaleDateString('tr-TR')` kullanilmaz (ICU ciktisi Node derlemesine gore
 * degisir, iddialar kirilgan olur) ve `new Date(iso)` kurulmaz ('2026-09-13'
 * UTC, '2026/09/13' yerel ayristirilir). Dizgi dogrudan parcalanir.
 */
export function fmtTrDate(iso: string): string {
  const m = ISO_DAY.exec(iso);
  if (!m) return iso;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return iso;
  return Number(m[3]) + ' ' + TR_MONTHS[month - 1] + ' ' + m[1];
}

/** Ilgi alani kirpmasinin URL'i — eksik serit denetimi icin. */
export function aoiCropUrl(date: string): string {
  const q = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: date,
    BBOX: AOI_BBOX,
    CRS: 'EPSG:4326',
    LAYERS: GIBS_LAYER,
    FORMAT: 'image/jpeg',
    WIDTH: String(AOI_WIDTH),
    HEIGHT: String(AOI_HEIGHT),
  });
  return GIBS_ENDPOINT + '?' + q.toString();
}

/** Yanit gercekten tam bir mozaik mi (bkz. MIN_SNAPSHOT_BYTES). */
export function isPlausibleSnapshot(bytes: number, dataPresent: boolean): boolean {
  return dataPresent && bytes >= MIN_SNAPSHOT_BYTES;
}

/** Ilgi alani gercekten goruntulenmis mi (bkz. MIN_AOI_BYTES). */
export function isAoiCovered(cropBytes: number): boolean {
  return cropBytes >= MIN_AOI_BYTES;
}

export interface Snapshot {
  blob: Blob;
  /** Sunucunun bildirdigi gercek alim tarihi; basligi yoksa null. */
  acquisitionDate: string | null;
  dataPresent: boolean;
  bytes: number;
}

export interface FetchOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Mozaigi indirir. Zaman asimi hem AbortSignal ile hem de yaris ile kurulur:
 * boylece sinyali yok sayan bir uygulama (ve testlerdeki sahte fetch) de
 * suresinde biter.
 */
export async function fetchSnapshot(url: string, opts: FetchOptions = {}): Promise<Snapshot> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('GIBS zaman aşımı (' + Math.round(timeoutMs / 1000) + ' sn)')), timeoutMs);
  });

  try {
    const res = await Promise.race([
      doFetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' }),
      timeout,
    ]);
    if (!res.ok) throw new Error('GIBS HTTP ' + res.status);

    const acquisitionDate = res.headers.get('Acquisition-Time');
    // Baslik yoksa "veri var" kabul edilir; boyut kontrolu zaten yakalar.
    const dataPresent = res.headers.get('Data-Present') !== 'false';
    const blob = await res.blob();
    return { blob, acquisitionDate, dataPresent, bytes: blob.size };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
