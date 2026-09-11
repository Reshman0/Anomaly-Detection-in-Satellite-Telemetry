import { PARAMETERS, param } from '../engine/mib';
import { crestRatio, parseBand, peak, stft, windowMeans } from '../engine/spectral';
import type { Alarm, Sample, XaiEvidence } from '../engine/types';
import { COLOR, alpha } from './colors';

/**
 * XAI panelinde gercek bildiri gorseli yoksa gosterilen sentetik cizimler.
 * Hazir resim degildir: konsolun kendi telemetri tamponundan kanit aninda
 * hesaplanir. (Simulasyon uyarisi ust seritteki rozette; cizim ustune ayrica
 * yazilmaz.)
 *
 * Her seviye FARKLI bir operator sorusuna, FARKLI bir nicelikle cevap verir:
 *
 *   Seviye 1  NE ZAMAN?       zaman          kanal + rekonstruksiyon, AI skoru,
 *                                             esik gecis anlari, ST[12]'ye onculuk
 *   Seviye 2  HANGI KANAL?    kanal          isaretli TEPE sapma (yukari/asagi)
 *   Seviye 3  HANGI FREKANS?  zaman x frekans hedef kanal artiginin AC spektrogrami
 *                                             + ayri DC satiri, kanit bandi cerceveli
 */

export const XAI_WINDOW_S = 90;
const REF_S = 240;
const ATTENTION_S = 60;
const STFT_WIN = 32;
const STFT_HOP = 2;
/** Tepe/ortalama orani bunun altindaysa spektrum duz: genis bantli sicrama. */
const BROADBAND_CREST = 3;
const MONO = 'Consolas, "Cascadia Mono", monospace';

interface Series {
  pid: string;
  t: number[];
  x: number[];
  z: number[];
  baseline: number;
  sigma: number;
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Saglam taban cizgisi (pencere ONCESI 240 s medyani) ve MAD sigma; pencere z-skorlari. */
function analyse(pid: string, buf: Sample[], endT: number): Series | null {
  const startT = endT - XAI_WINDOW_S;
  const ref = buf.filter((s) => s.t >= startT - REF_S && s.t < startT).map((s) => s.eng);
  const win = buf.filter((s) => s.t >= startT && s.t <= endT);
  if (ref.length < 10 || win.length < 5) return null;
  const baseline = median(ref);
  const mad = median(ref.map((v) => Math.abs(v - baseline)));
  const sigma = Math.max(1e-6, 1.4826 * mad);
  return {
    pid,
    t: win.map((s) => s.t),
    x: win.map((s) => s.eng),
    z: win.map((s) => (s.eng - baseline) / sigma),
    baseline,
    sigma,
  };
}

function channelSeries(buffers: Map<string, Sample[]>, endT: number): Series[] {
  const out: Series[] = [];
  for (const p of PARAMETERS) {
    if (p.derived) continue;
    const s = analyse(p.pid, buffers.get(p.pid) ?? [], endT);
    if (s) out.push(s);
  }
  return out;
}

export interface Attribution {
  pid: string;
  /** Enerji payi: ortalama |z| / toplam. */
  share: number;
  meanAbsZ: number;
  /** Isaretli tepe sapma: |z| en buyuk orneklemin z'si. Sicramada ortalama seyreltir, tepe seyreltmez. */
  peakZ: number;
}

export function attribution(buffers: Map<string, Sample[]>, endT: number): Attribution[] {
  const series = channelSeries(buffers, endT);
  const scores = series.map((s) => {
    let peakZ = 0;
    for (const z of s.z) if (Math.abs(z) > Math.abs(peakZ)) peakZ = z;
    return { pid: s.pid, meanAbsZ: s.z.reduce((a, b) => a + Math.abs(b), 0) / s.z.length, peakZ };
  });
  const total = scores.reduce((a, b) => a + b.meanAbsZ, 0) || 1;
  return scores.map((s) => ({ ...s, share: s.meanAbsZ / total })).sort((a, b) => Math.abs(b.peakZ) - Math.abs(a.peakZ));
}

/** Kanitin hedef kanalina ait AI skoru parametresi (ayni alt sistem). */
function aiScorePid(pid: string): string | null {
  const sub = param(pid).subsystem;
  const p = PARAMETERS.find((q) => q.derived && q.pid === 'AI_SCORE_' + sub);
  return p ? p.pid : null;
}

export interface Timing {
  detectT: number | null;
  confirmT: number | null;
  st12T: number | null;
  softHigh: number;
  hardHigh: number;
  leadS: number | null;
}

export function timing(buffers: Map<string, Sample[]>, ev: XaiEvidence, alarms: Alarm[]): Timing {
  const startT = ev.missionT - XAI_WINDOW_S;
  const aiPid = aiScorePid(ev.top_channels[0]);
  const lim = aiPid ? param(aiPid).limits : { soft_high: 3, hard_high: 5 };
  const softHigh = lim.soft_high ?? 3;
  const hardHigh = lim.hard_high ?? 5;
  const ai = aiPid ? (buffers.get(aiPid) ?? []).filter((s) => s.t >= startT && s.t <= ev.missionT) : [];
  const detectT = ai.find((s) => s.eng >= softHigh)?.t ?? null;
  const confirmT = ai.find((s) => s.eng >= hardHigh)?.t ?? null;
  const st12 = alarms
    .filter(
      (a) =>
        a.source === 'ST12_LIMIT' &&
        ev.top_channels.includes(a.pid) &&
        a.transition &&
        a.transition.to !== 'NOMINAL' &&
        a.missionT >= startT - REF_S &&
        a.missionT <= ev.missionT + 5,
    )
    .map((a) => a.missionT);
  const st12T = st12.length ? Math.min(...st12) : null;
  return { detectT, confirmT, st12T, softHigh, hardHigh, leadS: detectT !== null && st12T !== null ? st12T - detectT : null };
}

interface Spectral {
  ac: ReturnType<typeof stft>;
  dc: number[];
  acMax: number;
  dcMax: number;
  acPeak: ReturnType<typeof peak>;
  broadband: boolean;
}

/** AC spektrogrami (pencere ortalamasi cikarilmis) + ayri DC satiri. */
function spectral(s: Series): Spectral | null {
  const resid = s.x.map((v) => v - s.baseline);
  const ac = stft(resid, STFT_WIN, STFT_HOP, 1, true);
  if (ac.times.length === 0) return null;
  const dc = windowMeans(resid, STFT_WIN, STFT_HOP);
  const acPeak = peak(ac, 1);
  const acMax = acPeak ? acPeak.power : 1;
  const dcMax = Math.max(1e-9, ...dc.map((v) => Math.abs(v)));
  const broadband = acPeak ? crestRatio(ac.power[acPeak.timeIdx], 1) < BROADBAND_CREST : false;
  return { ac, dc, acMax, dcMax, acPeak, broadband };
}

function prepare(cv: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } | null {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (w === 0 || h === 0) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext('2d');
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = COLOR.sunken;
  g.fillRect(0, 0, w, h);
  return { g, w, h };
}

function stamp(g: CanvasRenderingContext2D, w: number, h: number, question: string, title: string): void {
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.font = '700 10px ' + MONO;
  g.fillStyle = COLOR.ai;
  g.fillText(question, 8, 6);
  const qw = g.measureText(question).width;
  g.font = '600 10px ' + MONO;
  g.fillStyle = COLOR.text;
  g.fillText('  ' + title, 8 + qw, 6);
  void w;
  void h;
}

function vline(g: CanvasRenderingContext2D, x: number, y0: number, y1: number, color: string, label: string, above: boolean): void {
  g.strokeStyle = color;
  g.lineWidth = 1.2;
  g.setLineDash([2, 2]);
  g.beginPath();
  g.moveTo(x + 0.5, y0);
  g.lineTo(x + 0.5, y1);
  g.stroke();
  g.setLineDash([]);
  g.font = '600 8px ' + MONO;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = above ? 'bottom' : 'top';
  g.fillText(label, x, above ? y0 - 1 : y1 + 1);
}

function heat(v: number): string {
  const r = Math.round(18 + v * (v < 0.6 ? (143 * v) / 0.6 : 143 + ((v - 0.6) / 0.4) * 90));
  const gg = Math.round(26 + v * (v < 0.6 ? (106 * v) / 0.6 : 106 + ((v - 0.6) / 0.4) * 120));
  const bb = Math.round(38 + v * (v < 0.6 ? (207 * v) / 0.6 : 207 + ((v - 0.6) / 0.4) * 30));
  return 'rgb(' + r + ',' + gg + ',' + bb + ')';
}

/** Seviye 1 — NE ZAMAN? kanal + rekonstruksiyon, AI skoru, esik gecisleri, onculuk. */
export function drawResidual(cv: HTMLCanvasElement, buffers: Map<string, Sample[]>, ev: XaiEvidence, alarms: Alarm[]): void {
  const p = prepare(cv);
  if (!p) return;
  const { g, w, h } = p;
  const pid = ev.top_channels[0];
  const s = analyse(pid, buffers.get(pid) ?? [], ev.missionT);
  stamp(g, w, h, 'NE ZAMAN?', pid + ' · ' + ev.model + ' · AI skoru ve eşik geçişleri');
  if (!s) return;

  const left = 40;
  const right = w - 10;
  const top = 22;
  const mid = top + (h - top - 24) * 0.46;
  const bottom = h - 24;
  const t0 = s.t[0];
  const X = (t: number) => left + ((t - t0) / XAI_WINDOW_S) * (right - left);

  const lo = Math.min(...s.x, s.baseline) - s.sigma;
  const hi = Math.max(...s.x, s.baseline) + s.sigma;
  const Y1 = (v: number) => mid - 6 - ((v - lo) / (hi - lo || 1)) * (mid - 6 - top);
  g.strokeStyle = alpha(COLOR.dim, 0.6);
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(left, Y1(s.baseline));
  g.lineTo(right, Y1(s.baseline));
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = COLOR.text;
  g.lineWidth = 1.3;
  g.beginPath();
  s.t.forEach((t, i) => (i ? g.lineTo(X(t), Y1(s.x[i])) : g.moveTo(X(t), Y1(s.x[i]))));
  g.stroke();
  g.font = '8px ' + MONO;
  g.fillStyle = COLOR.faint;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText('x', left - 4, (top + mid) / 2);
  g.fillText('x̂', left - 4, Y1(s.baseline));

  const tm = timing(buffers, ev, alarms);
  const aiPid = aiScorePid(pid);
  const ai = aiPid ? (buffers.get(aiPid) ?? []).filter((q) => q.t >= t0 && q.t <= ev.missionT) : [];
  const ymax = Math.max(tm.hardHigh * 1.3, ...ai.map((q) => q.eng));
  const Y2 = (v: number) => bottom - (Math.max(0, v) / ymax) * (bottom - mid - 4);

  for (const [v, c, lab] of [
    [tm.softHigh, COLOR.soft, '3σ'],
    [tm.hardHigh, COLOR.hard, '5σ'],
  ] as [number, string, string][]) {
    g.strokeStyle = alpha(c, 0.6);
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(left, Y2(v));
    g.lineTo(right, Y2(v));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = c;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText(lab, left - 4, Y2(v));
  }
  g.fillStyle = COLOR.faint;
  g.fillText('AI', left - 4, (mid + bottom) / 2);

  if (ai.length > 1) {
    g.fillStyle = alpha(COLOR.ai, 0.3);
    g.beginPath();
    g.moveTo(X(ai[0].t), bottom);
    ai.forEach((q) => g.lineTo(X(q.t), Y2(q.eng)));
    g.lineTo(X(ai[ai.length - 1].t), bottom);
    g.closePath();
    g.fill();
    g.strokeStyle = COLOR.ai;
    g.lineWidth = 1.4;
    g.beginPath();
    ai.forEach((q, i) => (i ? g.lineTo(X(q.t), Y2(q.eng)) : g.moveTo(X(q.t), Y2(q.eng))));
    g.stroke();
  }

  if (tm.detectT !== null) vline(g, X(tm.detectT), top, bottom, COLOR.soft, 'tespit 3σ', true);
  if (tm.confirmT !== null) vline(g, X(tm.confirmT), top, bottom, COLOR.hard, 'doğrulama 5σ', false);
  if (tm.st12T !== null && tm.st12T >= t0) vline(g, X(tm.st12T), top, bottom, COLOR.hard, 'ST[12]', true);

  g.font = '600 9px ' + MONO;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  let lead: string;
  let leadColor: string;
  if (tm.detectT === null) {
    lead = 'AI eşiği geçmedi';
    leadColor = COLOR.dim;
  } else if (tm.st12T === null) {
    lead = 'öncülük ∞ — ST[12] limit aşılmadı';
    leadColor = COLOR.ai;
  } else {
    const d = Math.round(tm.leadS!);
    lead = d >= 0 ? 'öncülük +' + d + ' s (AI önce)' : 'öncülük ' + d + ' s (ST[12] önce)';
    leadColor = d >= 0 ? COLOR.ai : COLOR.hard;
  }
  g.fillStyle = leadColor;
  g.fillText(lead, left + 4, mid - 4);

  g.font = '8px ' + MONO;
  g.fillStyle = COLOR.faint;
  g.textAlign = 'center';
  for (const dt of [0, 30, 60, 90]) g.fillText('−' + (XAI_WINDOW_S - dt) + ' s', X(t0 + dt), bottom + 3);
}

/** Seviye 2 — HANGI KANAL? isaretli tepe sapma cubuklari. */
export function drawAttribution(cv: HTMLCanvasElement, buffers: Map<string, Sample[]>, ev: XaiEvidence): void {
  const p = prepare(cv);
  if (!p) return;
  const { g, w, h } = p;
  stamp(g, w, h, 'HANGİ KANAL?', ev.model + ' · işaretli tepe sapma · son ' + XAI_WINDOW_S + ' s');
  const rows = attribution(buffers, ev.missionT);
  if (rows.length === 0) return;

  const left = 60;
  const right = w - 118;
  const top = 24;
  const bottom = h - 20;
  const rowH = Math.min(22, (bottom - top) / rows.length);
  const centre = (left + right) / 2;
  const half = (right - left) / 2;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.peakZ)), 1e-6);

  g.strokeStyle = alpha(COLOR.dim, 0.6);
  g.beginPath();
  g.moveTo(centre + 0.5, top);
  g.lineTo(centre + 0.5, bottom);
  g.stroke();
  g.font = '8px ' + MONO;
  g.fillStyle = COLOR.faint;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillText('↓ aşağı sapma', left + half / 2, bottom + 3);
  g.fillText('0', centre, bottom + 3);
  g.fillText('yukarı sapma ↑', right - half / 2, bottom + 3);

  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const isTop = ev.top_channels.includes(r.pid);
    const len = (Math.abs(r.peakZ) / maxAbs) * half;
    g.fillStyle = alpha(COLOR.line2, 0.35);
    g.fillRect(left, y + 4, right - left, rowH - 8);
    g.fillStyle = isTop ? COLOR.ai : alpha(COLOR.dim, 0.55);
    if (r.peakZ >= 0) g.fillRect(centre, y + 4, len, rowH - 8);
    else g.fillRect(centre - len, y + 4, len, rowH - 8);

    g.font = (isTop ? '600 ' : '') + '10px ' + MONO;
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    g.fillStyle = isTop ? COLOR.text : COLOR.dim;
    g.fillText(r.pid, left - 6, y + rowH / 2);
    g.textAlign = 'left';
    g.fillStyle = isTop ? COLOR.ai : COLOR.faint;
    g.fillText('tepe ' + (r.peakZ >= 0 ? '+' : '') + r.peakZ.toFixed(1) + 'σ ' + (r.peakZ >= 0 ? '↑' : '↓') + '  %' + (r.share * 100).toFixed(0), right + 6, y + rowH / 2);
    if (i === 0) {
      g.font = '600 8px ' + MONO;
      g.fillStyle = COLOR.ai;
      g.fillText('baskın', right + 92, y + rowH / 2);
    }
  });
}

/** Seviye 3 — HANGI FREKANS? hedef kanal artiginin AC spektrogrami + DC satiri. */
export function drawSpectrogram(cv: HTMLCanvasElement, buffers: Map<string, Sample[]>, ev: XaiEvidence): void {
  const p = prepare(cv);
  if (!p) return;
  const { g, w, h } = p;
  const pid = ev.top_channels[0];
  const s = analyse(pid, buffers.get(pid) ?? [], ev.missionT);
  stamp(g, w, h, 'HANGİ FREKANS?', pid + ' · ' + ev.model + ' · zaman × frekans' + (ev.band ? ' · bant ' + ev.band : ''));
  if (!s) return;
  const sp = spectral(s);
  if (!sp) return;

  const left = 54;
  const right = w - 10;
  const top = 24;
  const bottom = h - 24;
  const nAc = sp.ac.freqs.length - 1; // bin 1..16
  const rows = nAc + 1; // + DC satiri
  const cellH = (bottom - top) / rows;
  const X = (sampleIdx: number) => left + (sampleIdx / XAI_WINDOW_S) * (right - left);
  /** satir 0 = DC (altta), satir k = bin k */
  const Yrow = (row: number) => bottom - (row + 1) * cellH;
  const colW = X(sp.ac.times[1] ?? sp.ac.times[0] + STFT_HOP) - X(sp.ac.times[0]);

  sp.ac.power.forEach((col, ti) => {
    const x = X(sp.ac.times[ti]) - colW / 2;
    // DC satiri: pencere ortalamasinin buyuklugu, kendi olcegiyle
    g.fillStyle = heat(Math.sqrt(Math.min(1, Math.abs(sp.dc[ti]) / sp.dcMax)));
    g.fillRect(x, Yrow(0), Math.ceil(colW), Math.ceil(cellH));
    for (let fi = 1; fi < col.length; fi++) {
      g.fillStyle = heat(Math.sqrt(Math.min(1, col[fi] / (sp.acMax || 1))));
      g.fillRect(x, Yrow(fi), Math.ceil(colW), Math.ceil(cellH));
    }
  });

  // DC ile AC arasina ayirici
  g.strokeStyle = alpha(COLOR.text, 0.35);
  g.beginPath();
  g.moveTo(left, Yrow(0) + 0.5);
  g.lineTo(right, Yrow(0) + 0.5);
  g.stroke();

  const step = sp.ac.freqs[1] || 1;
  g.font = '8px ' + MONO;
  g.fillStyle = COLOR.faint;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText('DC', left - 4, Yrow(0) + cellH / 2);
  for (const f of [0.1, 0.2, 0.3, 0.4, 0.5]) g.fillText(f.toFixed(1) + ' Hz', left - 4, Yrow(f / step) + cellH / 2);

  const band = parseBand(ev.band);
  if (band) {
    const y1 = Yrow(band[1] / step);
    const y2 = Yrow(band[0] / step) + cellH;
    g.strokeStyle = COLOR.soft;
    g.lineWidth = 1.5;
    g.setLineDash([4, 3]);
    g.strokeRect(left + 0.5, y1, right - left - 1, y2 - y1);
    g.setLineDash([]);
    g.font = '600 8px ' + MONO;
    g.fillStyle = COLOR.soft;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText('kanıt bandı ' + ev.band, left + 4, y1 - 1);
  }

  const ax = X(XAI_WINDOW_S - ATTENTION_S);
  g.strokeStyle = COLOR.ai;
  g.lineWidth = 1.5;
  g.strokeRect(ax + 0.5, top + 0.5, right - ax - 1, bottom - top - 1);

  if (sp.acPeak) {
    const px = X(sp.ac.times[sp.acPeak.timeIdx]);
    const py = Yrow(sp.acPeak.freqIdx) + cellH / 2;
    g.strokeStyle = COLOR.text;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(px, py, 4, 0, Math.PI * 2);
    g.stroke();
    g.font = '600 8px ' + MONO;
    g.fillStyle = COLOR.text;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(sp.broadband ? 'geniş bantlı' : 'tepe ' + sp.acPeak.freq.toFixed(3) + ' Hz', px + 7, py);
  }

  g.font = '8px ' + MONO;
  g.fillStyle = COLOR.faint;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (const dt of [0, 30, 60, 90]) g.fillText('−' + (XAI_WINDOW_S - dt) + ' s', X(dt), bottom + 3);
}

/** Yan sutun icin seviyeye ozel tek satirlik ozet. */
export function summarize(level: 1 | 2 | 3, buffers: Map<string, Sample[]>, ev: XaiEvidence, alarms: Alarm[]): string {
  if (level === 1) {
    const tm = timing(buffers, ev, alarms);
    if (tm.detectT === null) return 'AI skoru pencere içinde 3σ eşiğini geçmedi.';
    if (tm.st12T === null) return 'AI 3σ eşiğini geçti; ST[12] sabit limit hiç tetiklenmedi → öncülük ∞.';
    const d = Math.round(tm.leadS!);
    return d >= 0 ? 'AI, ST[12]’den ' + d + ' s önce tespit etti.' : 'ST[12], AI’dan ' + -d + ' s önce tetiklendi.';
  }
  if (level === 2) {
    const rows = attribution(buffers, ev.missionT);
    if (!rows.length) return '—';
    const r = rows[0];
    return 'Baskın kanal ' + r.pid + ': tepe ' + (r.peakZ >= 0 ? '+' : '') + r.peakZ.toFixed(1) + 'σ ' + (r.peakZ >= 0 ? 'yukarı' : 'aşağı') + ', enerji payı %' + (r.share * 100).toFixed(0) + '.';
  }
  const pid = ev.top_channels[0];
  const s = analyse(pid, buffers.get(pid) ?? [], ev.missionT);
  const sp = s ? spectral(s) : null;
  if (!sp || !sp.acPeak) return '—';
  const dcDominant = sp.dcMax * sp.dcMax > 8 * sp.acMax;
  if (sp.broadband) return 'Spektrum düz — geniş bantlı sıçrama; tek bir frekans yok.';
  const band = parseBand(ev.band);
  const inBand = band ? sp.acPeak.freq >= band[0] && sp.acPeak.freq <= band[1] : null;
  const f = sp.acPeak.freq.toFixed(3) + ' Hz';
  const where = inBand === null ? '' : inBand ? ' — kanıt bandının içinde' : ' — kanıt bandının dışında';
  return (dcDominant ? 'Enerji ağırlıkla DC’de (sürekli kayma); salınım tepesi ' : 'Salınım tepesi ') + f + where + '.';
}
