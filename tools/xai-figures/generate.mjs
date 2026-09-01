/**
 * XAI panel gorsellerini uretir.
 *
 *   node tools/xai-figures/generate.mjs
 *
 * NE URETIR
 * Her senaryo icin panelin uc adimina karsilik gelen uc PNG:
 *   1) <id>_residual.png      "Nerede saptı"  — kanal x zaman sapma haritasi,
 *                             anomali ve normal pencere yan yana
 *   2) <id>_channel_attr.png  "Hangi kanal"   — kanal basina katki yuzdesi
 *   3) <id>_gradcam.png       "Isı haritası"  — sapma haritasi + ortalama sapma
 *                             + modelin dikkat egrisi
 *
 * VERI NEREDEN GELIYOR
 * Sekiller `src/data/mib.json` ve `src/data/scenario_*.json` dosyalarindan
 * okunur. Enjeksiyon sekilleri (rampa, tekil sicrama, iliskili kayma)
 * `src/engine/scenarioRunner.ts` icindeki tanimlarin aynisidir; boylece
 * gorseldeki kanal, zamanlama ve baskinlik ekrandaki seritlerle ayni hikayeyi
 * anlatir.
 *
 * DURUSTLUK NOTU
 * Bunlar bir modelin gercek ciktilari DEGILDIR; demonun kendi simule
 * verisinden turetilmis gorsellestirmelerdir. Her sekilin alt kosesinde bunu
 * soyleyen bir etiket vardir ve konsolun ustundeki "SIMULE VERI" rozeti zaten
 * surekli gorunur. Bildiriden alinmis gercek ciktilarla degistirilirlerse
 * `src/assets/xai/README.md` kunyesi de guncellenmelidir.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Canvas, heat } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'assets', 'xai');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// --- konsol paleti (tailwind.config.js / ui/colors.ts ile ayni) ---
const BG = [11, 16, 20];
const PANEL = [20, 28, 35];
const LINE = [30, 42, 51];
const LINE2 = [42, 58, 69];
const TEXT = [200, 214, 223];
const DIM = [120, 139, 152];
const FAINT = [74, 91, 102];
const AI = [161, 132, 245];
const NOMINAL = [47, 191, 135];

/*
 * Cizim 1120x420 tasarim biriminde yapilir; cikti OLCEK kati cozunurlukte
 * yazilir. Panelde kucuk gorunurler (kuculterek gostermek keskindir), ama
 * gorsele tiklandiginda ekranin ortasinda buyutulmus halleri acilir — orada
 * dogal boyutta gosterilip yukari olceklenmedikleri icin net kalirlar.
 */
const OLCEK = 2;
const W = 1120;
const H = 420;

const mib = readJson('src/data/mib.json');
const CHANNELS = mib.parameters.filter((p) => !p.derived).map((p) => p.pid);

/** Tohumlu gurultu — her calistirmada ayni sekil ciksin. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Senaryonun enjeksiyon adimlarindan kanal x zaman sapma alani uretir.
 * Donen deger: { grid: number[ch][t], dur: number }
 */
function deviationField(scenario, seedBase) {
  const dur = scenario.duration_s;
  const rnd = mulberry32(seedBase);
  const grid = CHANNELS.map(() => new Array(dur).fill(0));
  // taban gurultu: her kanalda kucuk, birbirinden bagimsiz
  for (let c = 0; c < CHANNELS.length; c++) {
    let prev = 0;
    for (let t = 0; t < dur; t++) {
      prev = prev * 0.85 + (rnd() - 0.5) * 0.16;
      grid[c][t] = Math.abs(prev) + 0.03;
    }
  }

  const idx = (pid) => CHANNELS.indexOf(pid);

  for (const step of scenario.timeline) {
    if (step.type === 'inject_drift') {
      const c = idx(step.pid);
      if (c < 0) continue;
      for (let t = 0; t < dur; t++) {
        const te = t - step.t;
        if (te < 0) continue;
        const ramp = Math.min(1, te / step.duration_s);
        grid[c][t] += Math.abs(step.magnitude) * ramp;
      }
    } else if (step.type === 'inject_point') {
      const c = idx(step.pid);
      if (c < 0) continue;
      const sigma = Math.max(1, step.width_s) / 2;
      for (let t = 0; t < dur; t++) {
        const d = (t - step.t) / sigma;
        grid[c][t] += Math.abs(step.magnitude) * Math.exp(-0.5 * d * d);
      }
    } else if (step.type === 'inject_collective') {
      for (const tg of step.targets) {
        const c = idx(tg.pid);
        if (c < 0) continue;
        for (let t = 0; t < dur; t++) {
          const te = t - step.t;
          if (te < 0 || te > step.duration_s) continue;
          const ramp = Math.min(1, te / step.ramp_s);
          const osc = 1 + 0.28 * Math.sin(2 * Math.PI * step.oscillation_hz * te);
          grid[c][t] += Math.abs(tg.magnitude) * ramp * osc;
        }
      }
    }
  }
  return { grid, dur };
}

/** Normal (anomalisiz) pencere: yalnizca taban gurultu. */
function nominalField(dur, seedBase) {
  const rnd = mulberry32(seedBase + 977);
  return CHANNELS.map(() => {
    let prev = 0;
    return Array.from({ length: dur }, () => {
      prev = prev * 0.85 + (rnd() - 0.5) * 0.16;
      return Math.abs(prev) + 0.03;
    });
  });
}

// ---------- ortak cizim parcalari ----------

function header(cv, title, subtitle) {
  cv.text(18, 14, title, TEXT, 2);
  if (subtitle) cv.textRight(W - 18, 16, subtitle, FAINT, 1);
  cv.rect(0, 36, W, 1, LINE);
}

/** Kanal x zaman isi haritasi cizer, kanal etiketleriyle. */
function heatmap(cv, grid, x, y, w, h, vmax, opts = {}) {
  const rows = grid.length;
  const cols = grid[0].length;
  const rowH = Math.floor(h / rows);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < w; i++) {
      const t = Math.min(cols - 1, Math.floor((i / w) * cols));
      const c = heat(grid[r][t] / vmax);
      cv.rect(x + i, y + r * rowH, 1, rowH - 1, c);
    }
    if (opts.labels !== false) {
      const isTarget = opts.highlight && opts.highlight.includes(CHANNELS[r]);
      cv.textRight(x - 8, y + r * rowH + Math.floor(rowH / 2) - 3, CHANNELS[r], isTarget ? AI : DIM, 1);
    }
  }
  cv.frame(x - 1, y - 1, w + 2, rows * rowH + 1, LINE2);
}

/** Renk olcegi (dikey). Etiketler cubugun ustune ve altina yazilir. */
function colorbar(cv, x, y, w, h) {
  for (let j = 0; j < h; j++) cv.rect(x, y + j, w, 1, heat(1 - j / h));
  cv.frame(x - 1, y - 1, w + 2, h + 2, LINE2);
  cv.text(x - 12, y - 12, 'yüksek', FAINT, 1);
  cv.text(x - 10, y + h + 5, 'düşük', FAINT, 1);
}

function timeAxis(cv, x, y, w, dur) {
  cv.rect(x, y, w, 1, LINE2);
  for (let s = 0; s <= dur; s += 15) {
    const px = x + Math.round((s / dur) * w);
    cv.rect(px, y, 1, 4, LINE2);
    cv.text(px - 6, y + 7, String(s), FAINT, 1);
  }
  cv.text(x + Math.floor(w / 2) - 26, y + 18, 'zaman (s)', FAINT, 1);
}

// ---------- Sekil 1: nerede saptı ----------

function figResidual(sc, field, nominal, targets) {
  const cv = new Canvas(W, H, BG, OLCEK);
  header(cv, 'NEREDE SAPTI  ·  ' + sc.name.toUpperCase(), sc.model);

  const vmax = Math.max(...field.grid.flat()) || 1;
  const left = 92;
  const plotW = W - left - 66;
  const mapH = 112;

  cv.text(left, 50, 'ANOMALİ PENCERESİ', TEXT, 1);
  heatmap(cv, field.grid, left, 62, plotW, mapH, vmax, { highlight: targets });
  timeAxis(cv, left, 62 + mapH + 4, plotW, field.dur);

  const y2 = 226;
  cv.text(left, y2 - 12, 'NORMAL PENCERE  (karşılaştırma)', DIM, 1);
  heatmap(cv, nominal, left, y2, plotW, mapH, vmax, { highlight: targets });
  timeAxis(cv, left, y2 + mapH + 4, plotW, field.dur);

  colorbar(cv, left + plotW + 16, 62, 12, mapH);

  const say =
    'İki panel aynı renk ölçeğinde. Sapma ' +
    [...new Set(targets)].join(' / ') +
    ' kanalında yoğunlaşıyor; normal pencerede karşılığı yok.';
  cv.text(left, H - 34, say, DIM, 1);
  return cv;
}

// ---------- Sekil 2: hangi kanal ----------

function figChannelAttr(sc, field, targets) {
  const cv = new Canvas(W, H, BG, OLCEK);
  header(cv, 'HANGI KANAL  ·  ' + sc.name.toUpperCase(), sc.model);

  // Kanal basina toplam sapma enerjisi -> yuzde katki
  const energy = field.grid.map((row) => row.reduce((a, b) => a + b * b, 0));
  const total = energy.reduce((a, b) => a + b, 0) || 1;
  const pct = energy.map((e) => (e / total) * 100);

  const left = 120;
  const baseY = 330;
  const barW = 110;
  const step = Math.floor((W - left - 90) / pct.length);
  const maxPct = Math.max(...pct);
  const scale = 240 / maxPct;

  cv.rect(left - 20, baseY, W - left - 80, 1, LINE2);

  pct.forEach((v, i) => {
    const x = left + i * step;
    const hgt = Math.max(2, Math.round(v * scale));
    const isTarget = targets.includes(CHANNELS[i]);
    const col = isTarget ? AI : [58, 76, 88];
    cv.rect(x, baseY - hgt, barW, hgt, col);
    cv.frame(x, baseY - hgt, barW, hgt, isTarget ? [190, 170, 255] : LINE2);
    cv.text(x + 18, baseY - hgt - 16, v.toFixed(1) + '%', isTarget ? AI : DIM, 1);
    cv.text(x + 22, baseY + 10, CHANNELS[i], isTarget ? TEXT : FAINT, 1);
  });

  cv.text(left - 20, 52, 'PENCERE BOYUNCA TOPLAM SAPMA ENERJİSİNİN KANALLARA DAĞILIMI', DIM, 1);
  const dom = CHANNELS[pct.indexOf(maxPct)];
  cv.text(left - 20, H - 34, 'Baskın kanal: ' + dom + '  (' + maxPct.toFixed(1) + '%)', TEXT, 1);
  return cv;
}

// ---------- Sekil 3: isi haritasi ----------

function figGradcam(sc, field, targets) {
  const cv = new Canvas(W, H, BG, OLCEK);
  header(cv, 'ISI HARITASI  ·  ' + sc.name.toUpperCase(), sc.model);

  const vmax = Math.max(...field.grid.flat()) || 1;
  const left = 92;
  const plotW = W - left - 66;
  const mapH = 130;
  const mapY = 56;

  heatmap(cv, field.grid, left, mapY, plotW, mapH, vmax, { highlight: targets });
  colorbar(cv, left + plotW + 16, mapY, 12, mapH);

  // ortalama sapma egrisi
  const dur = field.dur;
  const mean = Array.from({ length: dur }, (_, t) => {
    let s = 0;
    for (let c = 0; c < field.grid.length; c++) s += field.grid[c][t];
    return s / field.grid.length;
  });
  const mmax = Math.max(...mean) || 1;
  const curveY = mapY + mapH + 26;
  const curveH = 70;
  cv.text(left, curveY - 12, 'ORTALAMA SAPMA (tüm kanallar)', DIM, 1);
  cv.frame(left - 1, curveY - 1, plotW + 2, curveH + 2, LINE);
  let px = left;
  let py = curveY + curveH - Math.round((mean[0] / mmax) * curveH);
  for (let t = 1; t < dur; t++) {
    const nx = left + Math.round((t / (dur - 1)) * plotW);
    const ny = curveY + curveH - Math.round((mean[t] / mmax) * curveH);
    cv.thickLine(px, py, nx, ny, [226, 74, 95], 2);
    px = nx;
    py = ny;
  }

  // modelin dikkat egrisi (normalize edilmis, yumusatilmis)
  const att = mean.map((v) => v / mmax);
  for (let k = 0; k < 3; k++) {
    for (let t = 1; t < dur - 1; t++) att[t] = (att[t - 1] + att[t] + att[t + 1]) / 3;
  }
  const attY = curveY + curveH + 26;
  // 54: zaman ekseni etiketi (y+18) alt bilgi seridine degmesin diye kisildi.
  const attH = 54;
  cv.text(left, attY - 12, 'MODELİN DİKKATİ', DIM, 1);
  cv.frame(left - 1, attY - 1, plotW + 2, attH + 2, LINE);
  for (let i = 0; i < plotW; i++) {
    const t = Math.min(dur - 1, Math.floor((i / plotW) * dur));
    const hgt = Math.round(att[t] * attH);
    cv.rect(left + i, attY + attH - hgt, 1, hgt, [90, 74, 150]);
  }
  px = left;
  py = attY + attH - Math.round(att[0] * attH);
  for (let t = 1; t < dur; t++) {
    const nx = left + Math.round((t / (dur - 1)) * plotW);
    const ny = attY + attH - Math.round(att[t] * attH);
    cv.thickLine(px, py, nx, ny, AI, 2);
    px = nx;
    py = ny;
  }
  timeAxis(cv, left, attY + attH + 4, plotW, dur);
  return cv;
}

// ---------- ana akis ----------

const SENARYOLAR = [
  { file: 'src/data/scenario_point.json', prefix: 'specae_ss5', seed: 101 },
  { file: 'src/data/scenario_drift.json', prefix: 'tcn_ss3', seed: 202 },
  { file: 'src/data/scenario_collective.json', prefix: 'collective', seed: 303 },
];

mkdirSync(OUT, { recursive: true });
let toplam = 0;

for (const { file, prefix, seed } of SENARYOLAR) {
  const sc = readJson(file);
  const field = deviationField(sc, seed);
  const nominal = nominalField(field.dur, seed);

  // hedef kanallar: enjeksiyon adimlarindan
  const targets = [];
  for (const s of sc.timeline) {
    if (s.type === 'inject_drift' || s.type === 'inject_point') targets.push(s.pid);
    if (s.type === 'inject_collective') for (const t of s.targets) targets.push(t.pid);
  }

  const figs = [
    [prefix + '_residual.png', figResidual(sc, field, nominal, targets)],
    [prefix + '_channel_attr.png', figChannelAttr(sc, field, targets)],
    [prefix + '_gradcam.png', figGradcam(sc, field, targets)],
  ];
  for (const [name, cv] of figs) {
    const buf = cv.toPng();
    writeFileSync(join(OUT, name), buf);
    console.log(
      '  ' + name.padEnd(32) + String(Math.round(buf.length / 1024)).padStart(4) + ' kB',
    );
    toplam++;
  }
  console.log('  ^ ' + sc.name + ' — hedef: ' + [...new Set(targets)].join(', ') + '\n');
}

console.log(toplam + ' gorsel uretildi -> src/assets/xai/');
