import { useEffect, useMemo, useRef } from 'react';
import { useConsole } from '../store';
import {
  GROUND_STATION,
  lookAnglesAt,
  predictPasses,
  satByNorad,
  skyTrack,
  upcomingPasses,
  type Pass,
  type SkyPoint,
} from '../engine/orbit';
import { fmtCountdown, fmtTime } from '../engine/missionClock';
import { COLOR, alpha } from '../ui/colors';

/**
 * Gecis plani tahtasi: secili uydunun siradaki gecisi icin kutupsal gokyuzu
 * grafigi + filo genelinde en yakin gecisler. Tamamen SGP4'ten hesaplanir.
 *
 * Gecis taramasi pahalidir (31 LEO uydu x ufuk); gercek zamanda en fazla
 * birkac saniyede bir ya da secim degisince yenilenir.
 */

const HORIZON_S = 4 * 3600;
const REFRESH_REAL_MS = 2500;

interface Board {
  selectedPass: Pass | null;
  track: SkyPoint[];
  fleet: Pass[];
  computedAtMs: number;
  norad: string;
}

function computeBoard(norad: string, utcMs: number): Board {
  const sat = satByNorad(norad);
  const own = sat.orbitClass === 'LEO' ? predictPasses(sat, utcMs, HORIZON_S, 1) : [];
  const selectedPass = own[0] ?? null;
  const track = selectedPass ? skyTrack(sat, selectedPass.aosMs, selectedPass.losMs) : [];
  return { selectedPass, track, fleet: upcomingPasses(utcMs, HORIZON_S, 7), computedAtMs: utcMs, norad };
}

/** Kutupsal gokyuzu grafigi: merkez zenit, dis cember ufuk, kuzey yukarida. */
function drawSky(
  cv: HTMLCanvasElement,
  track: SkyPoint[],
  now: { azimuthDeg: number; elevationDeg: number } | null,
  minEl: number,
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

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 12;
  const toXY = (azDeg: number, elDeg: number) => {
    const r = R * (1 - Math.max(0, Math.min(90, elDeg)) / 90);
    const a = ((azDeg - 90) * Math.PI) / 180; // kuzey yukari, dogu saga
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  // Yukselti halkalari 0/30/60 ve minimum yukselti
  g.lineWidth = 1;
  for (const el of [0, 30, 60]) {
    g.strokeStyle = el === 0 ? COLOR.line2 : COLOR.line;
    g.beginPath();
    g.arc(cx, cy, R * (1 - el / 90), 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = alpha(COLOR.soft, 0.45);
  g.setLineDash([3, 3]);
  g.beginPath();
  g.arc(cx, cy, R * (1 - minEl / 90), 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  // Azimut cizgileri ve yon etiketleri
  g.strokeStyle = COLOR.line;
  for (let az = 0; az < 360; az += 45) {
    const [x, y] = toXY(az, 0);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(x, y);
    g.stroke();
  }
  g.fillStyle = COLOR.dim;
  g.font = '600 9px Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [label, az] of [
    ['K', 0],
    ['D', 90],
    ['G', 180],
    ['B', 270],
  ] as const) {
    const [x, y] = toXY(az, -10);
    g.fillText(label, x, y);
  }
  g.fillStyle = COLOR.faint;
  g.font = '8px Consolas, monospace';
  g.textAlign = 'left';
  g.fillText('30°', cx + 2, cy - R * (1 - 30 / 90) - 5);
  g.fillText('60°', cx + 2, cy - R * (1 - 60 / 90) - 5);

  if (track.length < 2) return;

  // Gecis izi
  g.strokeStyle = COLOR.text;
  g.lineWidth = 1.6;
  g.beginPath();
  track.forEach((p, i) => {
    const [x, y] = toXY(p.azimuthDeg, p.elevationDeg);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();

  // AOS / LOS uclari
  const [ax, ay] = toXY(track[0].azimuthDeg, track[0].elevationDeg);
  const [lx, ly] = toXY(track[track.length - 1].azimuthDeg, track[track.length - 1].elevationDeg);
  g.fillStyle = COLOR.nominal;
  g.beginPath();
  g.arc(ax, ay, 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = COLOR.hard;
  g.beginPath();
  g.arc(lx, ly, 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = COLOR.dim;
  g.font = '8px Consolas, monospace';
  g.textAlign = 'center';
  g.fillText('AOS', ax, ay - 8);
  g.fillText('LOS', lx, ly - 8);

  // Anlik konum (gecis icindeyse)
  if (now && now.elevationDeg >= 0) {
    const [x, y] = toXY(now.azimuthDeg, now.elevationDeg);
    g.fillStyle = COLOR.nominal;
    g.beginPath();
    g.arc(x, y, 4.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = COLOR.bg;
    g.lineWidth = 1.5;
    g.stroke();
  }
}

export default function PassBoard() {
  const sim = useConsole((s) => s.sim);
  const selectedNorad = useConsole((s) => s.selectedNorad);
  const selectSatellite = useConsole((s) => s.selectSatellite);
  useConsole((s) => s.version);

  const utcMs = sim.clock.utcMs();
  const sat = satByNorad(selectedNorad);

  // Tahta onbellegi: gercek zamanda REFRESH_REAL_MS'de bir ya da secim/gecis degisince.
  const boardRef = useRef<Board | null>(null);
  const lastRealRef = useRef(0);
  const nowReal = performance.now();
  const b = boardRef.current;
  const stale =
    !b ||
    b.norad !== selectedNorad ||
    nowReal - lastRealRef.current > REFRESH_REAL_MS ||
    utcMs < b.computedAtMs ||
    (b.selectedPass !== null && utcMs > b.selectedPass.losMs);
  if (stale) {
    boardRef.current = computeBoard(selectedNorad, utcMs);
    lastRealRef.current = nowReal;
  }
  const board = boardRef.current!;

  const look = useMemo(() => lookAnglesAt(sat, utcMs), [sat, utcMs]);
  const inPass =
    board.selectedPass !== null && utcMs >= board.selectedPass.aosMs && utcMs <= board.selectedPass.losMs;

  const skyRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (skyRef.current) {
      drawSky(
        skyRef.current,
        board.track,
        inPass && look ? { azimuthDeg: (look.azimuthDeg + 360) % 360, elevationDeg: look.elevationDeg } : null,
        GROUND_STATION.min_elevation_deg,
      );
    }
  });

  const p = board.selectedPass;

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Geçiş planı · {GROUND_STATION.name}</span>
        <span className="ozet-gizle normal-case tracking-normal text-ops-faint num">SGP4 · ufuk {HORIZON_S / 3600} sa</span>
      </div>
      <div className="flex-1 min-h-0 flex">
        {/* Gokyuzu grafigi */}
        <div className="ozet-genis w-[196px] shrink-0 border-r border-ops-line flex flex-col">
          <div className="relative flex-1 min-h-0">
            <canvas ref={skyRef} className="absolute inset-0 w-full h-full" />
          </div>
          <div className="px-2 py-1 border-t border-ops-line text-3xs leading-snug">
            {sat.orbitClass !== 'LEO' ? (
              <div className="text-ops-faint">
                <span className="text-ops-text">{sat.name}</span> · GEO — geçiş yok, sürekli görüş
              </div>
            ) : p ? (
              <>
                <div className="flex justify-between">
                  <span className="text-ops-text">{sat.name}</span>
                  <span className={'num ' + (inPass ? 'text-ops-nominal' : 'text-ops-dim')}>
                    {inPass ? 'GEÇİŞTE' : 'AOS ' + fmtCountdown((p.aosMs - utcMs) / 1000)}
                  </span>
                </div>
                <div className="num text-ops-dim">
                  {fmtTime(p.aosMs)}–{fmtTime(p.losMs)} · tepe {p.maxElDeg.toFixed(0)}° · {Math.round(p.durationS / 60)} dk
                </div>
                <div className="ozet-gizle num text-ops-faint">
                  AOS az {p.aosAzDeg.toFixed(0)}° → LOS az {p.losAzDeg.toFixed(0)}°
                </div>
              </>
            ) : (
              <div className="text-ops-faint">{sat.name} · {HORIZON_S / 3600} saat içinde geçiş yok</div>
            )}
          </div>
        </div>

        {/* Filo gecis listesi */}
        <div className="ozet-gizle flex-1 min-w-0 overflow-y-auto">
          <div className="grid grid-cols-[1fr_52px_46px_40px_40px] gap-x-1 px-2 py-[3px] text-3xs uppercase tracking-[0.1em] text-ops-faint border-b border-ops-line sticky top-0 bg-ops-sunken">
            <span>Uydu</span>
            <span className="text-right">AOS</span>
            <span className="text-right">Süre</span>
            <span className="text-right">Tepe</span>
            <span className="text-right">Kalan</span>
          </div>
          {board.fleet.length === 0 && (
            <div className="px-2 py-2 text-3xs text-ops-faint">Ufuk içinde geçiş yok.</div>
          )}
          {board.fleet.map((f) => {
            const active = utcMs >= f.aosMs && utcMs <= f.losMs;
            const isSel = f.sat.norad === selectedNorad;
            return (
              <button
                key={f.sat.norad + ':' + Math.round(f.aosMs / 1000)}
                onClick={() => selectSatellite(f.sat.norad)}
                className={
                  'w-full grid grid-cols-[1fr_52px_46px_40px_40px] gap-x-1 px-2 py-[3px] text-3xs border-b border-ops-line/60 text-left transition-colors ' +
                  (isSel ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]')
                }
              >
                <span className={'leading-tight break-words min-w-0 ' + (isSel ? 'text-ops-text' : 'text-ops-dim')}>{f.sat.name}</span>
                <span className="num text-right text-ops-dim">{fmtTime(f.aosMs)}</span>
                <span className="num text-right text-ops-faint">{Math.round(f.durationS / 60)} dk</span>
                <span className={'num text-right ' + (f.maxElDeg >= 30 ? 'text-ops-nominal' : 'text-ops-faint')}>
                  {f.maxElDeg.toFixed(0)}°
                </span>
                <span className={'num text-right ' + (active ? 'text-ops-nominal' : 'text-ops-faint')}>
                  {active ? 'ŞİMDİ' : fmtCountdown((f.aosMs - utcMs) / 1000)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
