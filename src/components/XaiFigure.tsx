import { useEffect, useMemo, useRef } from 'react';
import { COLOR } from '../ui/colors';
import { SCENARIOS, resolveScenario } from '../engine/scenarioRunner';
import {
  FIGURE_CHANNELS,
  channelShares,
  deviationField,
  hashSeedText,
  signalPair,
  timeProfile,
} from '../engine/xaiFigures';

/**
 * Kanit gorseli. Onceden uretilmis PNG'lerin yerini aldi.
 *
 * Neden canli cizim: senaryo hedef kanali her kosuda havuzdan seciyor. Sabit
 * PNG'lerle gorseldeki kanal ile ekrandaki kanal birbirini tutmazdi; her kanal
 * icin ayri dosya uretmek ise paketi sisirirdi.
 *
 * Uc seviye BILEREK uc farkli gorsel dil kullanir (cizgi / cubuk / isi
 * haritasi). Ayni veriyi iki kez gosterirlerse panelin uc adimi birbirinden
 * ayirt edilemiyor.
 */
const W = 1120;
const H = 420;

interface Props {
  scenarioId: string;
  channels: string[];
  level: 1 | 2 | 3;
  model: string;
  /** Cizim cozunurlugu carpani. Buyutulmus gorunumde yukseltilir. */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
}

function fig(
  g: CanvasRenderingContext2D,
  level: 1 | 2 | 3,
  scenarioId: string,
  channels: string[],
  model: string,
): void {
  const sc0 = SCENARIOS.find((s) => s.id === scenarioId);
  if (!sc0) return;
  const sc = resolveScenario(sc0, channels);
  const seed = hashSeedText(scenarioId + '|' + channels.join(','));
  const hedef = channels[0] ?? FIGURE_CHANNELS[0];
  const left = 92;
  const plotW = W - left - 66;
  const FONT = 'px ui-monospace, Menlo, Consolas, monospace';

  g.fillStyle = COLOR.bg;
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';

  const yazi = (x: number, y: number, t: string, c: string, px = 12, w = '400') => {
    g.fillStyle = c;
    g.font = w + ' ' + px + FONT;
    g.fillText(t, x, y);
  };
  const cerceve = (x: number, y: number, w: number, h: number) => {
    g.strokeStyle = COLOR.line;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w, h);
  };

  const baslik = level === 1 ? 'NEREDE SAPTI' : level === 2 ? 'HANGİ KANAL' : 'ISI HARİTASI';
  yazi(18, 27, baslik + '  ·  ' + sc.name.toUpperCase(), COLOR.text, 19, '600');
  g.fillStyle = COLOR.faint;
  g.font = '12' + FONT;
  g.textAlign = 'right';
  g.fillText(model, W - 18, 24);
  g.textAlign = 'left';
  g.fillStyle = COLOR.line;
  g.fillRect(0, 36, W, 1);

  const zamanEkseni = (y: number, dur: number) => {
    const adimlar = [0, dur / 6, dur / 3, dur / 2, (2 * dur) / 3, (5 * dur) / 6, dur];
    for (const s of adimlar) {
      yazi(left + (s / dur) * plotW - 7, y + 13, String(Math.round(s)), COLOR.faint, 11);
    }
    yazi(left + plotW / 2 - 30, y + 27, 'zaman (s)', COLOR.faint, 11);
  };

  if (level === 1) {
    const { beklenen, olculen, fark, dur } = signalPair(sc, hedef, seed);
    const ustY = 62;
    const ustH = 150;
    const tumu = [...beklenen, ...olculen];
    const vlo = Math.min(...tumu) - 0.25;
    const vhi = Math.max(...tumu) + 0.25;
    const yv = (v: number) => ustY + ustH - ((v - vlo) / (vhi - vlo)) * ustH;
    const xt = (t: number) => left + (t / (dur - 1)) * plotW;

    yazi(left, ustY - 10, 'MODELİN BEKLEDİĞİ  /  ÖLÇÜLEN  ·  ' + hedef, COLOR.text, 13, '600');
    cerceve(left - 1, ustY - 1, plotW + 2, ustH + 2);

    // aradaki farki dikey taramayla goster
    g.strokeStyle = 'rgba(155,122,207,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (let t = 0; t < dur; t += 2) {
      g.moveTo(xt(t), yv(beklenen[t]));
      g.lineTo(xt(t), yv(olculen[t]));
    }
    g.stroke();

    g.strokeStyle = COLOR.dim;
    g.lineWidth = 1.5;
    g.setLineDash([6, 4]);
    g.beginPath();
    beklenen.forEach((v, t) => (t ? g.lineTo(xt(t), yv(v)) : g.moveTo(xt(t), yv(v))));
    g.stroke();
    g.setLineDash([]);

    g.strokeStyle = COLOR.text;
    g.lineWidth = 2.5;
    g.beginPath();
    olculen.forEach((v, t) => (t ? g.lineTo(xt(t), yv(v)) : g.moveTo(xt(t), yv(v))));
    g.stroke();

    // gosterge
    g.strokeStyle = COLOR.dim;
    g.lineWidth = 1.5;
    g.setLineDash([6, 4]);
    g.beginPath();
    g.moveTo(left + plotW - 214, ustY + 14);
    g.lineTo(left + plotW - 194, ustY + 14);
    g.stroke();
    g.setLineDash([]);
    yazi(left + plotW - 188, ustY + 18, 'beklenen', COLOR.dim, 12);
    g.strokeStyle = COLOR.text;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(left + plotW - 110, ustY + 14);
    g.lineTo(left + plotW - 90, ustY + 14);
    g.stroke();
    yazi(left + plotW - 84, ustY + 18, 'ölçülen', COLOR.text, 12);

    const altY = 258;
    const altH = 92;
    const fmax = Math.max(0.6, ...fark.map(Math.abs));
    const yf = (v: number) => altY + altH - (Math.abs(v) / fmax) * altH;
    yazi(left, altY - 10, 'ARADAKİ FARK  (modelin yakaladığı şey)', COLOR.dim, 13, '600');
    cerceve(left - 1, altY - 1, plotW + 2, altH + 2);
    g.fillStyle = 'rgba(155,122,207,0.35)';
    g.beginPath();
    g.moveTo(left, altY + altH);
    fark.forEach((v, t) => g.lineTo(xt(t), yf(v)));
    g.lineTo(left + plotW, altY + altH);
    g.closePath();
    g.fill();
    g.strokeStyle = COLOR.ai;
    g.lineWidth = 2;
    g.beginPath();
    fark.forEach((v, t) => (t ? g.lineTo(xt(t), yf(v)) : g.moveTo(xt(t), yf(v))));
    g.stroke();
    zamanEkseni(altY + altH + 4, dur);

    let tepe = 0;
    fark.forEach((v, i) => {
      if (Math.abs(v) > Math.abs(fark[tepe])) tepe = i;
    });
    yazi(
      left,
      H - 24,
      'Model ' +
        hedef +
        ' için üstteki kesikli seriyi bekliyordu. Ölçülen seri ondan ayrılıyor ve fark ' +
        tepe +
        '. saniyede en büyük değerine varıyor.',
      COLOR.dim,
      12,
    );
    return;
  }

  const field = deviationField(sc, seed);

  if (level === 2) {
    const pay = channelShares(field);
    const enBuyuk = Math.max(...pay);
    const tabanY = 330;
    const barH = 244;
    const adim = plotW / FIGURE_CHANNELS.length;
    yazi(left - 20, 58, 'SAPMANIN NE KADARI HANGİ KANALDAN GELİYOR', COLOR.dim, 13, '600');
    g.fillStyle = COLOR.line2;
    g.fillRect(left - 20, tabanY, plotW + 40, 1);
    FIGURE_CHANNELS.forEach((ch, i) => {
      const hedefMi = channels.includes(ch);
      const x = left - 20 + i * adim + adim * 0.24;
      const w = adim * 0.52;
      const h = Math.max(2, (pay[i] / enBuyuk) * barH);
      g.fillStyle = hedefMi ? COLOR.ai : 'rgba(92,107,128,0.5)';
      g.fillRect(x, tabanY - h, w, h);
      g.textAlign = 'center';
      yazi(x + w / 2, tabanY - h - 11, pay[i].toFixed(1) + '%', hedefMi ? COLOR.ai : COLOR.dim, 13, hedefMi ? '600' : '400');
      yazi(x + w / 2, tabanY + 22, ch, hedefMi ? COLOR.text : COLOR.faint, 13, hedefMi ? '600' : '400');
      g.textAlign = 'left';
    });
    const dom = FIGURE_CHANNELS[pay.indexOf(enBuyuk)];
    yazi(left - 20, H - 24, 'Baskın kanal: ' + dom + '  (' + enBuyuk.toFixed(1) + '%)', COLOR.text, 13, '600');
    return;
  }

  const vmax = Math.max(...field.grid.flat()) || 1;
  const mapY = 58;
  const mapH = 196;
  const satirH = mapH / FIGURE_CHANNELS.length;
  yazi(left, mapY - 10, 'TÜM KANALLAR  ×  ZAMAN', COLOR.text, 13, '600');
  for (let c = 0; c < FIGURE_CHANNELS.length; c++) {
    for (let i = 0; i < plotW; i++) {
      const t = Math.min(field.dur - 1, Math.floor((i / plotW) * field.dur));
      const v = Math.min(1, field.grid[c][t] / vmax);
      const r = Math.max(16, Math.round(255 * Math.min(1, v * 2.2)));
      const gr = Math.max(9, Math.round(255 * Math.max(0, Math.min(1, v * 2.0 - 0.75))));
      const b = Math.max(13, Math.round(255 * Math.max(0, v * 1.7 - 1.15)));
      g.fillStyle = 'rgb(' + r + ',' + gr + ',' + b + ')';
      g.fillRect(left + i, mapY + c * satirH, 1, satirH - 1);
    }
    const hedefMi = channels.includes(FIGURE_CHANNELS[c]);
    yazi(
      left - 58,
      mapY + c * satirH + satirH / 2 + 5,
      FIGURE_CHANNELS[c],
      hedefMi ? COLOR.ai : COLOR.dim,
      13,
      hedefMi ? '600' : '400',
    );
  }

  const prof = timeProfile(field);
  const attY = mapY + mapH + 44;
  const attH = 76;
  yazi(left, attY - 10, 'SAPMA ZAMAN İÇİNDE NASIL YOĞUNLAŞTI', COLOR.dim, 13, '600');
  cerceve(left - 1, attY - 1, plotW + 2, attH + 2);
  const xp = (t: number) => left + (t / (prof.length - 1)) * plotW;
  const yp = (v: number) => attY + attH - v * attH;
  g.fillStyle = 'rgba(155,122,207,0.4)';
  g.beginPath();
  g.moveTo(left, attY + attH);
  prof.forEach((v, t) => g.lineTo(xp(t), yp(v)));
  g.lineTo(left + plotW, attY + attH);
  g.closePath();
  g.fill();
  g.strokeStyle = COLOR.ai;
  g.lineWidth = 2;
  g.beginPath();
  prof.forEach((v, t) => (t ? g.lineTo(xp(t), yp(v)) : g.moveTo(xp(t), yp(v))));
  g.stroke();
  zamanEkseni(attY + attH + 4, field.dur);
}

export default function XaiFigure({ scenarioId, channels, level, model, scale = 2, className, style }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const anahtar = useMemo(
    () => scenarioId + '|' + channels.join(',') + '|' + level + '|' + scale,
    [scenarioId, channels, level, scale],
  );
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = W * scale;
    cv.height = H * scale;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    fig(g, level, scenarioId, channels, model);
    // `anahtar` degisince yeniden cizilir; bagimliliklar da listede.
  }, [anahtar, level, scenarioId, channels, model, scale]);

  return <canvas ref={ref} className={className} style={style} />;
}
