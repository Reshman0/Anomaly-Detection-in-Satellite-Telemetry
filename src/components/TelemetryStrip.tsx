import { useEffect, useRef } from 'react';
import { useConsole } from '../store';
import { WINDOW_S } from '../engine/simulation';
import { stateLabel } from '../engine/limitChecker';
import { subsystemName } from '../engine/mib';
import { COLOR, alpha, stateHex, stateTextClass } from '../ui/colors';
import type { LimitState, MibParameter, Sample } from '../engine/types';

interface Props {
  p: MibParameter;
  buf: Sample[];
  state: LimitState;
  missionT: number;
  /** XAI kaniti bu kanali en yuksek katkililar arasinda saydiysa: [baslangic, bitis] gorev saniyesi. */
  attention: [number, number] | null;
  attentionRank: number;
  /** CUSUM ile bulunan yapisal kirilma ani (gorev saniyesi); yalnizca hedef kanalda. */
  breakT?: number | null;
}

/** Kanit yuklenmeden once modelin baktigi pencere (saniye). */
export const ATTENTION_WINDOW_S = 60;

/** Serit dusey araligi: sert limit bandinin biraz disi. */
function range(p: MibParameter): [number, number] {
  const l = p.limits;
  const hi = l.hard_high ?? 5;
  const lo = l.hard_low ?? 0;
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

function drawStrip(
  cv: HTMLCanvasElement,
  p: MibParameter,
  buf: Sample[],
  state: LimitState,
  missionT: number,
  attention: [number, number] | null,
  breakT: number | null,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (w === 0 || h === 0) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const [lo, hi] = range(p);
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  const t0 = missionT - WINDOW_S;
  const x = (t: number) => ((t - t0) / WINDOW_S) * w;

  g.fillStyle = COLOR.sunken;
  g.fillRect(0, 0, w, h);

  const l = p.limits;
  // Sert limitin disi: kirmizi golge
  if (l.hard_high !== undefined) {
    g.fillStyle = alpha(COLOR.hard, 0.1);
    g.fillRect(0, 0, w, Math.max(0, y(l.hard_high)));
  }
  if (l.hard_low !== undefined) {
    g.fillStyle = alpha(COLOR.hard, 0.1);
    g.fillRect(0, y(l.hard_low), w, h - y(l.hard_low));
  }
  // Yumusak ile sert arasi: amber golge
  if (l.soft_high !== undefined && l.hard_high !== undefined) {
    g.fillStyle = alpha(COLOR.soft, 0.09);
    g.fillRect(0, y(l.hard_high), w, y(l.soft_high) - y(l.hard_high));
  }
  if (l.soft_low !== undefined && l.hard_low !== undefined) {
    g.fillStyle = alpha(COLOR.soft, 0.09);
    g.fillRect(0, y(l.soft_low), w, y(l.hard_low) - y(l.soft_low));
  }

  // Limit cizgileri
  g.lineWidth = 1;
  g.setLineDash([3, 3]);
  for (const [v, c] of [
    [l.soft_high, COLOR.soft],
    [l.soft_low, COLOR.soft],
    [l.hard_high, COLOR.hard],
    [l.hard_low, COLOR.hard],
  ] as [number | undefined, string][]) {
    if (v === undefined) continue;
    g.strokeStyle = alpha(c, 0.5);
    g.beginPath();
    g.moveTo(0, Math.round(y(v)) + 0.5);
    g.lineTo(w, Math.round(y(v)) + 0.5);
    g.stroke();
  }
  g.setLineDash([]);

  // Dakikalik dusey isaretler
  g.strokeStyle = alpha(COLOR.line2, 0.55);
  for (let t = Math.ceil(t0 / 60) * 60; t <= missionT; t += 60) {
    const px = Math.round(x(t)) + 0.5;
    g.beginPath();
    g.moveTo(px, 0);
    g.lineTo(px, h);
    g.stroke();
  }

  // XAI dikkat penceresi: modelin karara dayanak yaptigi aralik (mor parantez).
  if (attention) {
    const x0 = Math.max(0, x(attention[0]));
    const x1 = Math.min(w, x(attention[1]));
    if (x1 > x0) {
      g.fillStyle = alpha(COLOR.ai, 0.13);
      g.fillRect(x0, 0, x1 - x0, h);
      g.strokeStyle = alpha(COLOR.ai, 0.85);
      g.lineWidth = 1.5;
      for (const px of [x0, x1]) {
        const tick = px === x0 ? 4 : -4;
        g.beginPath();
        g.moveTo(px + tick, 1);
        g.lineTo(px, 1);
        g.lineTo(px, h - 1);
        g.lineTo(px + tick, h - 1);
        g.stroke();
      }
    }
  }

  // Yapisal kirilma: CUSUM'un sapmanin basladigini hesapladigi an.
  if (breakT !== null && breakT >= t0 && breakT <= missionT) {
    const bx = Math.round(x(breakT)) + 0.5;
    g.strokeStyle = COLOR.warn;
    g.lineWidth = 1.5;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(bx, 0);
    g.lineTo(bx, h);
    g.stroke();
    g.setLineDash([]);
    g.font = '600 9px Consolas, monospace';
    g.fillStyle = COLOR.warn;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('yapısal kırılma', bx + 4, 3);
  }

  if (buf.length < 2) return;

  // Iz
  const traceColor = stateHex(state);
  g.strokeStyle = traceColor;
  g.lineWidth = 1.35;
  g.lineJoin = 'round';
  g.beginPath();
  let started = false;
  for (const s of buf) {
    const px = x(s.t);
    const py = y(s.eng);
    if (!started) {
      g.moveTo(px, py);
      started = true;
    } else {
      g.lineTo(px, py);
    }
  }
  g.stroke();

  // Iz altini hafif doldur (turetilmis parametrede AI rengi vurgusu)
  const last = buf[buf.length - 1];
  g.fillStyle = p.derived ? alpha(COLOR.ai, 0.12) : alpha(traceColor, 0.07);
  g.lineTo(x(last.t), h);
  g.lineTo(x(buf[0].t), h);
  g.closePath();
  g.fill();

  // Son deger imleci
  g.fillStyle = traceColor;
  g.beginPath();
  g.arc(x(last.t), y(last.eng), 2.2, 0, Math.PI * 2);
  g.fill();
}

export default function TelemetryStrip({ p, buf, state, missionT, attention, attentionRank, breakT = null }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useConsole((s) => s.version);

  useEffect(() => {
    if (ref.current) drawStrip(ref.current, p, buf, state, missionT, attention, breakT);
  }, [version, p, buf, state, missionT, attention, breakT]);

  const last = buf[buf.length - 1];
  const [lo, hi] = range(p);

  return (
    <div className="flex items-stretch flex-1 min-h-[54px] border-b border-ops-line">
      <div className="w-[228px] shrink-0 px-2 py-1 border-r border-ops-line flex flex-col justify-between">
        <div className="flex items-center gap-1.5">
          {p.derived && <span className="text-ops-ai text-[11px] leading-none">◆</span>}
          <span className="num text-[13px] text-ops-text">{p.pid}</span>
          <span className="text-3xs text-ops-faint">
            {p.subsystem} · APID {p.apid}
          </span>
          {attention && (
            <span className="ml-auto text-3xs tracking-[0.1em] text-ops-ai border border-ops-ai/50 px-1 leading-[13px]">
              XAI #{attentionRank}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <div className="flex flex-col">
            <span className="text-3xs uppercase tracking-wider text-ops-faint leading-none">ham</span>
            <span className="num text-[12px] text-ops-dim leading-tight">
              {last && last.raw !== null ? String(last.raw).padStart(5, ' ') : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xs uppercase tracking-wider text-ops-faint leading-none">müh.</span>
            <span className={'num text-[14px] leading-tight ' + stateTextClass(state)}>
              {last ? (last.eng >= 0 ? '+' : '') + last.eng.toFixed(3) : '—'}
              <span className="text-ops-faint text-[11px] ml-1">{p.eng_unit}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={'text-3xs uppercase tracking-[0.12em] ' + stateTextClass(state)}>{stateLabel(state)}</span>
          <span className="text-3xs text-ops-faint">
            {p.derived ? 'GND türetilmiş · ' + p.source_model : subsystemName(p.subsystem) + ' · ' + p.sampling_period_s + ' s'}
          </span>
        </div>
      </div>
      <div className="relative flex-1 min-w-0">
        <canvas ref={ref} className="absolute inset-0 w-full h-full" />
        <span className="absolute right-1 top-0 num text-3xs text-ops-faint">{hi.toFixed(1)}</span>
        <span className="absolute right-1 bottom-0 num text-3xs text-ops-faint">{lo.toFixed(1)}</span>
      </div>
    </div>
  );
}
