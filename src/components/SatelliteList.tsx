import { useConsole } from '../store';
import {
  GROUND_STATION,
  SATELLITES,
  SAT_GROUPS,
  elevationAt,
  elementsOf,
  satByNorad,
  type SatelliteRecord,
} from '../engine/orbit';
import { fmtDate, fmtTime } from '../engine/missionClock';

/**
 * Kure uzerinde bindirme katalog listesi. Her satir gercek zamanli yukselti
 * acisini gosterir; istasyondan gorunen uydular vurgulanir.
 *
 * Firlatma yili, yorunge sinifi ve GEO istasyon tutumu TLE'den hesaplanir.
 */

function badge(sat: SatelliteRecord): { text: string; cls: string } | null {
  if (sat.orbitClass !== 'GEO') return null;
  return sat.stationKept
    ? { text: 'istasyon tutumlu', cls: 'text-ops-nominal/70' }
    : { text: 'yörünge tutumu yok', cls: 'text-ops-faint' };
}

export default function SatelliteList() {
  const sim = useConsole((s) => s.sim);
  const selected = useConsole((s) => s.selectedNorad);
  const selectSatellite = useConsole((s) => s.selectSatellite);
  useConsole((s) => s.version);

  const utcMs = sim.clock.utcMs();
  const selSat = satByNorad(selected);
  const el = elementsOf(selSat);

  return (
    <div className="absolute left-0 top-0 bottom-0 w-[196px] bg-ops-sunken border-r border-ops-line flex flex-col">
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-2 py-1 border-b border-ops-line sticky top-0 bg-ops-sunken z-10">
        <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Uydu kataloğu</div>
        <div className="text-3xs text-ops-faint mt-[1px]">
          gerçek zamanlı yükselti · ≥{GROUND_STATION.min_elevation_deg}° görünür
        </div>
      </div>

      {SAT_GROUPS.map((g) => {
        const sats = SATELLITES.filter((s) => s.group === g.id);
        if (sats.length === 0) return null;
        return (
          <div key={g.id}>
            <div className="px-2 py-[3px] bg-ops-panel/70 border-y border-ops-line flex items-center gap-1.5">
              <span style={{ color: g.color }} className="text-[9px] leading-none">
                ●
              </span>
              <span className="text-3xs uppercase tracking-[0.1em] text-ops-dim">{g.name}</span>
              <span className="num text-3xs text-ops-faint ml-auto">{sats.length}</span>
            </div>

            {sats.map((sat) => {
              const el = elevationAt(sat, utcMs);
              const visible = el >= GROUND_STATION.min_elevation_deg;
              const isSel = sat.norad === selected;
              const b = badge(sat);
              return (
                <button
                  key={sat.norad}
                  onClick={() => selectSatellite(sat.norad)}
                  title={sat.operator + ' · ' + sat.mission + ' · ' + sat.intlDes}
                  className={
                    'w-full text-left px-2 py-[3px] border-b border-ops-line/60 transition-colors ' +
                    (isSel ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]')
                  }
                >
                  <div className="flex items-baseline gap-1">
                    <span
                      className={'text-[11px] leading-tight truncate ' + (isSel ? 'text-ops-text' : 'text-ops-dim')}
                    >
                      {sat.name}
                    </span>
                    <span
                      className={
                        'num text-3xs ml-auto shrink-0 ' + (visible ? 'text-ops-nominal' : 'text-ops-faint')
                      }
                    >
                      {el >= 0 ? '+' : ''}
                      {el.toFixed(0)}°
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-3xs text-ops-faint leading-tight">
                    <span className="num">{sat.orbitClass}</span>
                    <span className="num">{sat.launchYear}</span>
                    {b ? <span className={b.cls}>{b.text}</span> : <span className="num">{sat.periodMin.toFixed(0)} dk</span>}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>

    {/* Secili uydunun Kepler elemanlari — dogrudan TLE'den okunur */}
    <div className="shrink-0 border-t border-ops-line2 bg-ops-panel px-2 py-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Yörünge elemanları</span>
        <span className="num text-3xs text-ops-faint">{selSat.intlDes}</span>
      </div>
      <div className="text-[11px] text-ops-text leading-tight mt-[2px] truncate">{selSat.name}</div>
      <div className="grid grid-cols-2 gap-x-2 mt-1 num text-3xs leading-[13px]">
        <Row k="i" v={el.inclinationDeg.toFixed(3) + '°'} />
        <Row k="e" v={el.eccentricity.toFixed(6)} />
        <Row k="Ω" v={el.raanDeg.toFixed(2) + '°'} />
        <Row k="ω" v={el.argPerigeeDeg.toFixed(2) + '°'} />
        <Row k="M" v={el.meanAnomalyDeg.toFixed(2) + '°'} />
        <Row k="n" v={el.meanMotionRevPerDay.toFixed(4)} />
        <Row k="T" v={el.periodMin.toFixed(1) + ' dk'} />
        <Row k="a" v={el.semiMajorAxisKm.toFixed(0) + ' km'} />
        <Row k="hp" v={el.perigeeKm.toFixed(0) + ' km'} />
        <Row k="ha" v={el.apogeeKm.toFixed(0) + ' km'} />
        <Row k="B*" v={el.bstar.toExponential(2)} />
        <Row k="epok" v={fmtDate(el.epochMs).slice(5) + ' ' + fmtTime(el.epochMs).slice(0, 5)} />
      </div>
    </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-1">
      <span className="text-ops-faint">{k}</span>
      <span className="text-ops-dim truncate">{v}</span>
    </div>
  );
}
