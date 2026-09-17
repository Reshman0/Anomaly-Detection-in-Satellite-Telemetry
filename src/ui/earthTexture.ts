import land from '../data/land_110m.json';
import borders from '../data/borders_110m.json';
import turkiye from '../data/turkiye_110m.json';
import countries from '../data/countries_110m.json';
import bmngUrl from '../assets/earth/bmng_2048.jpg';
import gibsUrl from '../assets/earth/gibs_current.jpg';
import gibsMeta from '../assets/earth/gibs_current.json';
import ankaraUrl from '../assets/earth/ankara_hls.jpg';
import ankaraMetaJson from '../assets/earth/ankara_hls.json';
import { FEATHER } from './yakinGoruntu';
import { DEFAULT_TIMEOUT_MS, availableDate, fetchSnapshot, isPlausibleSnapshot, snapshotUrl } from './gibs';
import type { EarthTheme } from '../store';

/**
 * Dunya zemin dokulari — 3B kure (GlobeView) ve 2B harita (MapView2D) ayni
 * canvas'lari paylasir. Dokular tarayicida uretilir; hazir goruntu yalnizca
 * fiziki temadaki NASA Blue Marble'dir ve derlemede base64 gomulur (ag istegi yok).
 *
 * Esdikdortgen (equirectangular) duzen: px = (lon + 180) / 360 · W,
 * py = (90 − lat) / 180 · H. SphereGeometry UV'si ile birebir uyumludur.
 */
export const TEX_W = 4096;
export const TEX_H = 2048;

export const TEX_COLORS = {
  ocean: '#14242f',
  land: '#22384a',
  coast: '#8fb8cd',
  border: '#4a6979',
  trFill: '#3c6079',
  trStroke: '#e6f4fd',
};

export function lonToPx(lon: number): number {
  return ((lon + 180) / 360) * TEX_W;
}

export function latToPx(lat: number): number {
  return ((90 - lat) / 180) * TEX_H;
}

/** Bir halkayi cizer; boylam sarmasinda kopan parcalar ayri yol olarak gecilir. */
export function tracePolyline(g: CanvasRenderingContext2D, flat: number[], close: boolean): void {
  let started = false;
  let prevX = 0;
  g.beginPath();
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = lonToPx(flat[i]);
    const y = latToPx(flat[i + 1]);
    if (started && Math.abs(x - prevX) > TEX_W / 2) {
      // antimeridyeni gecti: dokunun uzerinde yatay leke birakmamak icin yolu kes
      if (close) g.closePath();
      g.moveTo(x, y);
    } else if (!started) {
      g.moveTo(x, y);
    } else {
      g.lineTo(x, y);
    }
    started = true;
    prevX = x;
  }
  if (close) g.closePath();
}

interface CountryRec {
  n: string;
  a3: string;
  c: [number, number];
  s: number;
  rings: number[][];
}

/** Siyasi harita paleti — komsu ulkeler ayrissin diye 8 pastel ton, indeksle. */
const POLITICAL_FILLS = ['#e9d6a8', '#cfe1b9', '#f1c9b4', '#c9dbe9', '#e4cbe3', '#d8e6c3', '#f0d9c0', '#cddfe0'];

/** Fiziki tema: NASA Blue Marble Next Generation (Aralik 2004, topografya + batimetri), kamu mali. */
const bmngImage = new Image();
let bmngReady = false;
const bmngWaiters: (() => void)[] = [];
let bmngFailed = false;
bmngImage.onload = () => {
  bmngReady = true;
  bmngWaiters.splice(0).forEach((f) => f());
};
// Cozulemezse `bmngReady` sonsuza kadar false kalir ve fiziki tema kalici
// olarak bozulur; bayrak en azindan durumu dogru yazdirir.
bmngImage.onerror = () => {
  bmngFailed = true;
  bmngWaiters.splice(0).forEach((f) => f());
};
bmngImage.src = bmngUrl; // derlemede base64 olarak gomulur; ag istegi yok

/**
 * Goruntu temalarinda (fiziki, guncel) Turkiye'nin %18 sari vurgusu. Ankara
 * yakin goruntusune de ayni ton uygulanir; yoksa parcanin kenarinda renk
 * dikisi olusurdu.
 */
const TURKIYE_TINT = 'rgba(240,184,58,0.18)';

/** Blue Marble yuklendiginde (ya da hemen) cagirir. */
export function onBmng(cb: () => void): void {
  if (bmngReady) cb();
  else bmngWaiters.push(cb);
}

export function isBmngReady(): boolean {
  return bmngReady;
}

export function isBmngFailed(): boolean {
  return bmngFailed;
}

// ---------------------------------------------------------------------------
// GUNCEL tema: NASA EOSDIS GIBS gunluk mozaigi
// ---------------------------------------------------------------------------

/**
 * Iki kaynakli: derleme oncesi gomulen mozaik (ag istegi YOK, aninda acilir) ve
 * operatorun elle tetikledigi canli tazeleme. Canli cekim ASLA acilista kosmaz.
 *
 * Onbellek geceersizlestirme yoktur: `'current'` canvas nesnesi sayfa omru
 * boyunca tek kalir, icine yeniden cizilir. Boylece hem buradaki `cache` hem de
 * GlobeView'daki THREE.Texture haritasi bayatlayamaz; kureye tek gereken
 * `texture.needsUpdate = true`.
 */
export type ImageryStatus = 'loading' | 'ready' | 'failed';

export interface ImageryInfo {
  status: ImageryStatus;
  /** Gosterilen mozaigin alim tarihi (ISO). */
  date: string;
  /** true: bu oturumda agdan tazelendi · false: pakete gomulu surum. */
  live: boolean;
  /** Son tazeleme denemesinin hatasi (Turkce); yoksa null. */
  error: string | null;
  /** Su an bir tazeleme suruyor mu. */
  refreshing: boolean;
}

const BAKED_DATE = (gibsMeta as { date: string }).date;

const gibsImage = new Image();
let gibsStatus: ImageryStatus = 'loading';
let gibsDate = BAKED_DATE;
let gibsLive = false;
let gibsError: string | null = null;
let gibsRefreshing = false;
const imageryWaiters: (() => void)[] = [];

function notifyImagery(): void {
  for (const cb of imageryWaiters.slice()) cb();
}

gibsImage.onload = () => {
  if (gibsStatus === 'loading') gibsStatus = 'ready';
  notifyImagery();
};
gibsImage.onerror = () => {
  gibsStatus = 'failed';
  gibsError = 'gömülü mozaik çözülemedi';
  notifyImagery();
};
gibsImage.src = gibsUrl; // derlemede base64 olarak gomulur; ag istegi yok

/**
 * Tarayici hata metinleri Ingilizcedir ("Failed to fetch"); operator ekraninda
 * Turkce ve anlasilir bir sebep gorunsun.
 */
function trReason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.message.includes('zaman aşımı')) return 'zaman aşımı';
    if (err instanceof TypeError) return 'ağa ulaşılamadı';
    if (err.message.startsWith('GIBS HTTP')) return 'sunucu ' + err.message.replace('GIBS HTTP ', 'HTTP ') + ' döndü';
    return err.message;
  }
  return 'canlı görüntü alınamadı';
}

/** Her karede okunabilir durum — mandallanmis bayrak yok, takilamaz. */
export function currentImagery(): ImageryInfo {
  return { status: gibsStatus, date: gibsDate, live: gibsLive, error: gibsError, refreshing: gibsRefreshing };
}

/** Goruntu degistiginde cagirir; aboneligi iptal eden fonksiyon doner. */
export function onImageryChange(cb: () => void): () => void {
  imageryWaiters.push(cb);
  return () => {
    const i = imageryWaiters.indexOf(cb);
    if (i >= 0) imageryWaiters.splice(i, 1);
  };
}

/**
 * Mozaigi agdan tazeler. YALNIZCA operator dugmesinden cagrilir — acilista
 * asla, boylece "acilista sifir ag istegi" harfiyen dogru kalir.
 *
 * Basarisizlik pikselleri ASLA bozmaz: gomulu goruntu ekranda kalir, yalnizca
 * durum 'failed' olur ve sebep gorunur bicimde yazilir.
 */
export async function refreshCurrentImagery(daysBack: number = 1): Promise<void> {
  if (gibsRefreshing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    gibsError = 'çevrimdışı — gömülü mozaik gösteriliyor';
    notifyImagery();
    return;
  }

  gibsRefreshing = true;
  gibsError = null;
  notifyImagery();

  // Gun secimi: 1 = dun (tam kaplamasi beklenen en yeni gun), 2..7 = daha eski gunler.
  const date = availableDate(Date.now(), daysBack);
  try {
    const snap = await fetchSnapshot(snapshotUrl(date), { timeoutMs: DEFAULT_TIMEOUT_MS });
    if (!isPlausibleSnapshot(snap.bytes, snap.dataPresent)) {
      throw new Error('mozaik henüz tamamlanmamış (' + Math.round(snap.bytes / 1024) + ' kB)');
    }
    // createImageBitmap kokeni kirletmez: canvas WebGL'e guvenle yuklenir.
    const bmp = await createImageBitmap(snap.blob);
    redrawCurrent(bmp);
    bmp.close();
    gibsDate = snap.acquisitionDate ?? date;
    gibsLive = true;
    gibsStatus = 'ready';
    gibsError = null;
  } catch (err) {
    gibsError = trReason(err);
  } finally {
    gibsRefreshing = false;
    notifyImagery();
  }
}

function newCanvas(w: number = TEX_W, h: number = TEX_H): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { cv, g };
}

/** Turkiye dolgusu + anahati; her temada ustte durur. */
function drawTurkiyeOverlay(g: CanvasRenderingContext2D, fill: string | null, stroke: string, width: number): void {
  const trRings = (turkiye as { rings: number[][] }).rings;
  if (fill) {
    g.fillStyle = fill;
    for (const ring of trRings) {
      tracePolyline(g, ring, true);
      g.fill();
    }
  }
  g.strokeStyle = stroke;
  g.lineWidth = width;
  for (const ring of trRings) {
    tracePolyline(g, ring, true);
    g.stroke();
  }
}

/** Siyasi harita: ulke dolgulari, sinirlar, Turkce ulke adlari. */
function buildPoliticalCanvas(): HTMLCanvasElement {
  const { cv, g } = newCanvas();
  g.fillStyle = '#b9d3e6';
  g.fillRect(0, 0, TEX_W, TEX_H);

  const list = (countries as unknown as { countries: CountryRec[] }).countries;
  list.forEach((c, i) => {
    g.fillStyle = c.a3 === 'TUR' ? '#f0b83a' : POLITICAL_FILLS[i % POLITICAL_FILLS.length];
    for (const ring of c.rings) {
      tracePolyline(g, ring, true);
      g.fill();
    }
  });
  g.strokeStyle = '#5b6b78';
  g.lineWidth = 2;
  for (const c of list) {
    for (const ring of c.rings) {
      tracePolyline(g, ring, true);
      g.stroke();
    }
  }
  drawTurkiyeOverlay(g, null, '#2a3540', 5);

  // Ulke adlari: buyuklukle olcekli, kucuk ulkeler atlanir (okunmaz).
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const c of list) {
    if (c.s < 5) continue;
    const size = c.s > 30 ? 46 : c.s > 15 ? 34 : c.s > 8 ? 26 : 20;
    g.font = (c.a3 === 'TUR' ? '700 ' : '600 ') + size + 'px "Segoe UI", Arial, sans-serif';
    const x = lonToPx(c.c[0]);
    const y = latToPx(c.c[1]);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.strokeText(c.n, x, y);
    g.fillStyle = c.a3 === 'TUR' ? '#1a2430' : '#2c3a47';
    g.fillText(c.n, x, y);
  }
  return cv;
}

/** Fiziki: Blue Marble goruntusu + ince sinirlar + Turkiye anahati. */
function buildPhysicalCanvas(): HTMLCanvasElement {
  const { cv, g } = newCanvas();
  g.drawImage(bmngImage, 0, 0, TEX_W, TEX_H);
  const borderLines = (borders as { lines: number[][] }).lines;
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.5;
  for (const line of borderLines) {
    tracePolyline(g, line, false);
    g.stroke();
  }
  drawTurkiyeOverlay(g, TURKIYE_TINT, '#ffe08a', 5);
  return cv;
}

/**
 * GUNCEL tema canvas'i — GIBS kaynagi zaten 2048x1024 oldugu icin 4096'ya
 * gerilmez: var olmayan bilgi interpolasyondan uydurulmaz ve doku ~34 MB yerine
 * ~8 MB tutar. Bindirme koordinatlari TEX_W/TEX_H'ye gore hesaplandigindan
 * yariya olceklenir; cizgi kalinliklari da olcekle birlikte kuculur, bu yuzden
 * fiziki temadaki 1.5 / 5 sabitleri aynen korunur.
 */
const CURRENT_W = 2048;
const CURRENT_H = 1024;
let currentCanvas: HTMLCanvasElement | null = null;

function redrawCurrent(src: CanvasImageSource): void {
  if (!currentCanvas) currentCanvas = newCanvas(CURRENT_W, CURRENT_H).cv;
  const g = currentCanvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, CURRENT_W, CURRENT_H);
  g.drawImage(src, 0, 0, CURRENT_W, CURRENT_H);

  g.setTransform(CURRENT_W / TEX_W, 0, 0, CURRENT_H / TEX_H, 0, 0);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const borderLines = (borders as { lines: number[][] }).lines;
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.5;
  for (const line of borderLines) {
    tracePolyline(g, line, false);
    g.stroke();
  }
  drawTurkiyeOverlay(g, TURKIYE_TINT, '#ffe08a', 5);
  g.setTransform(1, 0, 0, 1, 0, 0);
}

function buildCurrentCanvas(): HTMLCanvasElement {
  redrawCurrent(gibsImage);
  return currentCanvas!;
}

/** OPS: koyu operasyon zemini — dolu kitalar, kiyi, sinirlar, Turkiye vurgulu. */
function buildOpsCanvas(): HTMLCanvasElement {
  const { cv, g } = newCanvas();
  g.fillStyle = TEX_COLORS.ocean;
  g.fillRect(0, 0, TEX_W, TEX_H);

  const landRings = (land as { rings: number[][] }).rings;
  const trRings = (turkiye as { rings: number[][] }).rings;
  const borderLines = (borders as { lines: number[][] }).lines;

  // 1) kara dolgusu
  g.fillStyle = TEX_COLORS.land;
  for (const ring of landRings) {
    tracePolyline(g, ring, true);
    g.fill();
  }
  // 2) Turkiye dolgusu — kara renginden belirgin sekilde ayrilir
  g.fillStyle = TEX_COLORS.trFill;
  for (const ring of trRings) {
    tracePolyline(g, ring, true);
    g.fill();
  }
  // 3) ulke kara sinirlari (sonuk)
  g.strokeStyle = TEX_COLORS.border;
  g.lineWidth = 2.5;
  for (const line of borderLines) {
    tracePolyline(g, line, false);
    g.stroke();
  }
  // 4) kiyi cizgisi (parlak)
  g.strokeStyle = TEX_COLORS.coast;
  g.lineWidth = 3;
  for (const ring of landRings) {
    tracePolyline(g, ring, true);
    g.stroke();
  }
  // 5) Turkiye anahati — ekrandaki en parlak yer cizgisi
  g.strokeStyle = TEX_COLORS.trStroke;
  g.lineWidth = 5;
  for (const ring of trRings) {
    tracePolyline(g, ring, true);
    g.stroke();
  }
  return cv;
}

/** Tema basina bir kez uretilir; kure ve 2B harita ayni canvas'i paylasir. */
const cache = new Map<EarthTheme, HTMLCanvasElement>();

/**
 * Tema canvas'ini dondurur. Asenkron goruntuye dayanan temalar (fiziki, guncel)
 * goruntu cozulmeden istenirse `null` doner; cagiran `onBmng` /
 * `onImageryChange` ile bekler ya da bir sonraki karede yeniden sorar.
 */
export function earthCanvas(theme: EarthTheme): HTMLCanvasElement | null {
  const hit = cache.get(theme);
  if (hit) return hit;
  if (theme === 'physical' && !bmngReady) return null;
  if (theme === 'current' && gibsStatus !== 'ready') return null;
  const cv =
    theme === 'ops'
      ? buildOpsCanvas()
      : theme === 'political'
        ? buildPoliticalCanvas()
        : theme === 'current'
          ? buildCurrentCanvas()
          : buildPhysicalCanvas();
  cache.set(theme, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// ANKARA YAKIN GORUNTUSU: NASA HLS S30 (Sentinel-2), 30 m
// ---------------------------------------------------------------------------

/**
 * Pakete gomulu bolgesel goruntu (scripts/fetch-ankara.mjs). Kure yakina
 * gelince bu goruntu ayri bir parca olarak cizilir (GlobeView). Ag istegi yok.
 */
export interface AnkaraMeta {
  date: string;
  layer: string;
  satellite: string;
  bbox: { south: number; west: number; north: number; east: number };
  width: number;
  height: number;
  resolution_m: number;
  doi: string;
  credit: string;
}
export const ankaraMeta = ankaraMetaJson as AnkaraMeta;

const ankaraImage = new Image();
let ankaraReady = false;
const ankaraWaiters: (() => void)[] = [];
ankaraImage.onload = () => {
  ankaraReady = true;
  ankaraWaiters.splice(0).forEach((f) => f());
};
// Cozulemezse parca hic gosterilmez; bekleyenler bosaltilir.
ankaraImage.onerror = () => {
  ankaraWaiters.splice(0);
};
ankaraImage.src = ankaraUrl; // derlemede base64 olarak gomulur; ag istegi yok

/** Goruntu hazir olunca (ya da hemen) cagirir; aboneligi iptal eden fonksiyon doner. */
export function onAnkara(cb: () => void): () => void {
  if (ankaraReady) {
    cb();
    return () => {};
  }
  ankaraWaiters.push(cb);
  return () => {
    const i = ankaraWaiters.indexOf(cb);
    if (i >= 0) ankaraWaiters.splice(i, 1);
  };
}

let ankaraCv: HTMLCanvasElement | null = null;

/**
 * Parca dokusu: goruntu + cevreyle ayni Turkiye tonu + kenarlarda yumusak
 * saydamlik. Cevre zemin ~20 km/piksel oldugu icin gecis kusursuz olamaz;
 * amac sert bir dikdortgen kenari yumusatmak. Istasyon ve Kizilay tamamen
 * opak ic bolgede kalir (bkz. yakinGoruntu.test.ts).
 */
export function ankaraCanvas(): HTMLCanvasElement | null {
  if (!ankaraReady) return null;
  if (ankaraCv) return ankaraCv;
  const w = ankaraImage.naturalWidth;
  const h = ankaraImage.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.drawImage(ankaraImage, 0, 0);
  // Ankara tamamen Turkiye icinde: cevre zeminle ayni vurgu.
  g.fillStyle = TURKIYE_TINT;
  g.fillRect(0, 0, w, h);

  // Kenar yumusatma: once yatay, sonra dikey alfa maskesi.
  g.globalCompositeOperation = 'destination-in';
  const mask = (grad: CanvasGradient) => {
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(FEATHER, 'rgba(0,0,0,1)');
    grad.addColorStop(1 - FEATHER, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  };
  mask(g.createLinearGradient(0, 0, w, 0));
  mask(g.createLinearGradient(0, 0, 0, h));
  g.globalCompositeOperation = 'source-over';

  ankaraCv = cv;
  return cv;
}
