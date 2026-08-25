import { useConsole } from '../store';
import { MIB } from '../engine/mib';
import { SPEED_OPTIONS, fmtCountdown, fmtDate, fmtTime, fmtTimeMs } from '../engine/missionClock';
import { GROUND_STATION, NORAD_ID, TLE_EPOCH_MS, TLE_NAME, elevationAt, isVisible, nextPassEvent } from '../engine/orbit';
import { useMemo, useRef } from 'react';

function Field({ label, children, w }: { label: string; children: React.ReactNode; w?: string }) {
  return (
    <div className={'flex flex-col justify-center px-3 border-r border-ops-line ' + (w ?? '')}>
      <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint leading-none">{label}</div>
      <div className="num text-[13px] leading-tight mt-[3px]">{children}</div>
    </div>
  );
}

export default function TopBar() {
  const speed = useConsole((s) => s.speed);
  const setSpeed = useConsole((s) => s.setSpeed);
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);

  const utcMs = sim.clock.utcMs();
  const obtMs = sim.clock.obtMs();

  // AOS/LOS aramasi pahalidir; birkac saniyede bir tazelenir.
  const passRef = useRef<{ atMs: number; kind: 'AOS' | 'LOS'; targetMs: number } | null>(null);
  if (!passRef.current || Math.abs(utcMs - passRef.current.atMs) > 4000 || utcMs > passRef.current.targetMs) {
    const ev = nextPassEvent(utcMs);
    passRef.current = ev ? { atMs: utcMs, kind: ev.kind, targetMs: ev.unixMs } : null;
  }
  const pass = passRef.current;
  const visible = isVisible(utcMs);
  const elevation = elevationAt(utcMs);

  const tleAge = useMemo(() => Math.round((Date.parse(MIB.epoch) - TLE_EPOCH_MS) / 86400000), []);

  return (
    <header className="h-[52px] shrink-0 flex items-stretch bg-ops-panel border-b border-ops-line2">
      <div className="flex flex-col justify-center px-3 border-r border-ops-line2 bg-ops-sunken min-w-[150px]">
        <div className="text-3xs uppercase tracking-[0.18em] text-ops-faint leading-none">Görev</div>
        <div className="num text-[15px] leading-tight mt-[2px] text-ops-text">{MIB.mission}</div>
      </div>

      <Field label="UTC">
        <span className="text-ops-text">{fmtTimeMs(utcMs)}</span>
        <span className="text-ops-faint ml-2 text-[11px]">{fmtDate(utcMs)}</span>
      </Field>

      <Field label={'OBT (ofset ' + MIB.obt_offset_s.toFixed(3) + ' s)'}>
        <span className="text-ops-dim">{fmtTimeMs(obtMs)}</span>
      </Field>

      <div className="flex flex-col justify-center px-3 border-r border-ops-line">
        <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint leading-none">Hız</div>
        <div className="flex gap-[3px] mt-[3px]">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={
                'num text-[11px] px-[7px] py-[1px] border transition-colors ' +
                (speed === s
                  ? 'border-ops-nominal text-ops-nominal bg-ops-nominal/10'
                  : 'border-ops-line2 text-ops-dim hover:text-ops-text')
              }
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <Field label="SLE RAF · CCSDS 911.1">
        <span className={visible ? 'text-ops-nominal' : 'text-ops-dim'}>{visible ? 'ACTIVE' : 'READY'}</span>
        <span className="text-ops-faint ml-2 text-[11px]">RCF: READY</span>
      </Field>

      <Field label="İstasyon">
        <span className="text-ops-text">{GROUND_STATION.name}</span>
        <span className="text-ops-faint ml-2 text-[11px]">
          {GROUND_STATION.lat_deg.toFixed(3)}°N {GROUND_STATION.lon_deg.toFixed(3)}°E
        </span>
      </Field>

      <Field label={pass ? (pass.kind === 'AOS' ? 'AOS geri sayım' : 'LOS geri sayım') : 'AOS/LOS'}>
        {pass ? (
          <>
            <span className={pass.kind === 'LOS' ? 'text-ops-nominal' : 'text-ops-text'}>
              {fmtCountdown((pass.targetMs - utcMs) / 1000)}
            </span>
            <span className="text-ops-faint ml-2 text-[11px]">@ {fmtTime(pass.targetMs)}</span>
          </>
        ) : (
          <span className="text-ops-faint">—</span>
        )}
      </Field>

      <Field label="Yükselti / min">
        <span className={elevation >= GROUND_STATION.min_elevation_deg ? 'text-ops-nominal' : 'text-ops-dim'}>
          {elevation.toFixed(1)}°
        </span>
        <span className="text-ops-faint ml-2 text-[11px]">≥ {GROUND_STATION.min_elevation_deg.toFixed(0)}°</span>
      </Field>

      <Field label={'Uydu · NORAD ' + NORAD_ID}>
        <span className="text-ops-text">{TLE_NAME}</span>
        <span className="text-ops-faint ml-2 text-[11px]">son yayınlanmış TLE, {tleAge} gün</span>
      </Field>

      <div className="flex-1 border-r border-ops-line" />

      <div className="flex items-center px-3">
        <div className="border border-ops-soft/60 text-ops-soft text-[10px] tracking-[0.14em] uppercase px-2 py-[3px] leading-none">
          Simüle veri — kavramsal gösterim
        </div>
      </div>
    </header>
  );
}
