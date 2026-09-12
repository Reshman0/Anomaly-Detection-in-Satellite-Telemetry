import land from '../data/land_110m.json';
import borders from '../data/borders_110m.json';
import turkiye from '../data/turkiye_110m.json';
import countries from '../data/countries_110m.json';
import bmngUrl from '../assets/earth/bmng_2048.jpg';
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
bmngImage.onload = () => {
  bmngReady = true;
  bmngWaiters.splice(0).forEach((f) => f());
};
bmngImage.src = bmngUrl; // derlemede base64 olarak gomulur; ag istegi yok

/** Blue Marble yuklendiginde (ya da hemen) cagirir. */
export function onBmng(cb: () => void): void {
  if (bmngReady) cb();
  else bmngWaiters.push(cb);
}

export function isBmngReady(): boolean {
  return bmngReady;
}

function newCanvas(): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
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
  drawTurkiyeOverlay(g, 'rgba(240,184,58,0.18)', '#ffe08a', 5);
  return cv;
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
 * Tema canvas'ini dondurur. Fiziki tema Blue Marble yuklenmeden istenirse
 * `null` doner; `onBmng` ile beklenir.
 */
export function earthCanvas(theme: EarthTheme): HTMLCanvasElement | null {
  const hit = cache.get(theme);
  if (hit) return hit;
  if (theme === 'physical' && !bmngReady) return null;
  const cv = theme === 'ops' ? buildOpsCanvas() : theme === 'political' ? buildPoliticalCanvas() : buildPhysicalCanvas();
  cache.set(theme, cv);
  return cv;
}
