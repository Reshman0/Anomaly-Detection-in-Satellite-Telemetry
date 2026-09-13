import { useConsole } from '../store';
import { MIB } from '../engine/mib';
import { SPEED_OPTIONS, fmtCountdown, fmtDate, fmtTime, fmtTimeMs } from '../engine/missionClock';
import { GROUND_STATION, elevationAt, isVisible, nextPassEvent, satByNorad } from '../engine/orbit';
import { useMemo, useRef } from 'react';

function Field({ label, children, w }: { label: string; children: React.ReactNode; w?: string }) {
  return (
    <div className={'flex flex-col justify-center px-3 border-r border-ops-line min-w-0 ' + (w ?? '')}>
      {/* Dar pencerede alanlar alt satira kaymaz, kirpilir: ust serit tek satir kalir. */}
      <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint leading-none whitespace-nowrap overflow-hidden text-ellipsis">{label}</div>
      <div className="num text-[13px] leading-tight mt-[3px] whitespace-nowrap overflow-hidden text-ellipsis">{children}</div>
    </div>
  );
}

export default function TopBar() {
  const speed = useConsole((s) => s.speed);
  const setSpeed = useConsole((s) => s.setSpeed);
  const sim = useConsole((s) => s.sim);
  const selectedNorad = useConsole((s) => s.selectedNorad);
  const setPacketOpen = useConsole((s) => s.setPacketOpen);
  const setA11yOpen = useConsole((s) => s.setA11yOpen);
  const a11y = useConsole((s) => s.a11y);
  const a11yActive =
    a11y.contrast !== 'normal' || a11y.colorVision !== 'normal' || a11y.scale !== 1 || a11y.reduceMotion || a11y.boldText || a11y.patternCoding;
  useConsole((s) => s.version);

  const utcMs = sim.clock.utcMs();
  const obtMs = sim.clock.obtMs();
  const sat = satByNorad(selectedNorad);

  // AOS/LOS aramasi pahalidir; birkac saniyede bir tazelenir.
  const passRef = useRef<{ atMs: number; norad: string; kind: 'AOS' | 'LOS'; targetMs: number } | null>(null);
  if (
    !passRef.current ||
    passRef.current.norad !== selectedNorad ||
    Math.abs(utcMs - passRef.current.atMs) > 4000 ||
    utcMs > passRef.current.targetMs
  ) {
    const ev = nextPassEvent(sat, utcMs);
    passRef.current = ev ? { atMs: utcMs, norad: selectedNorad, kind: ev.kind, targetMs: ev.unixMs } : null;
  }
  const pass = passRef.current;
  const visible = isVisible(sat, utcMs);
  const elevation = elevationAt(sat, utcMs);

  const tleAge = useMemo(
    () => Math.round((Date.parse(MIB.epoch) - sat.epochMs) / 86400000),
    [sat.epochMs],
  );

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
                'num text-[11px] px-[5px] py-[1px] border transition-colors ' +
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

      <Field label={pass ? (pass.kind === 'AOS' ? 'AOS geri sayım' : 'LOS geri sayım') : 'Görünürlük'}>
        {pass ? (
          <>
            <span className={pass.kind === 'LOS' ? 'text-ops-nominal' : 'text-ops-text'}>
              {fmtCountdown((pass.targetMs - utcMs) / 1000)}
            </span>
            <span className="text-ops-faint ml-2 text-[11px]">@ {fmtTime(pass.targetMs)}</span>
          </>
        ) : (
          // 6 saatlik ufukta gecis yok: istasyon boylamindaki GEO uydularinda beklenen durum.
          <span className={visible ? 'text-ops-nominal' : 'text-ops-dim'}>
            {visible ? 'sürekli görünür' : 'görüş dışı'}
            <span className="text-ops-faint ml-2 text-[11px]">6 sa içinde geçiş yok</span>
          </span>
        )}
      </Field>

      <Field label="Yükselti / min">
        <span className={elevation >= GROUND_STATION.min_elevation_deg ? 'text-ops-nominal' : 'text-ops-dim'}>
          {elevation.toFixed(1)}°
        </span>
        <span className="text-ops-faint ml-2 text-[11px]">≥ {GROUND_STATION.min_elevation_deg.toFixed(0)}°</span>
      </Field>

      <Field label={'Seçili uydu · NORAD ' + sat.norad}>
        <span className="text-ops-text">{sat.name}</span>
        <span className="text-ops-faint ml-2 text-[11px]">
          {sat.orbitClass} · TLE {tleAge} gün · {sat.intlDes} · model AZS-DEMO
        </span>
      </Field>

      <div className="flex-1 min-w-0 border-r border-ops-line" />

      <div className="flex items-center gap-2 px-3 shrink-0">
        <button
          onClick={() => setPacketOpen(true)}
          title="Paket denetleyici penceresi: CADU · FRAME · PACKET (P)"
          className="num text-[10px] tracking-[0.12em] uppercase px-2 py-[3px] border border-ops-line2 text-ops-dim hover:text-ops-text leading-none"
        >
          Paket
        </button>
        <button
          onClick={() => setA11yOpen(true)}
          title="Erişilebilirlik: kontrast, renk görme, ölçek, hareket, ses (A)"
          aria-label="Erişilebilirlik ayarları"
          className={
            'num text-[10px] tracking-[0.12em] uppercase px-2 py-[3px] border leading-none ' +
            (a11yActive ? 'border-ops-nominal text-ops-nominal' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
          }
        >
          Erişim{a11yActive ? ' ●' : ''}
        </button>
        <div className="border border-ops-soft/60 text-ops-soft text-[10px] tracking-[0.14em] uppercase px-2 py-[3px] leading-none whitespace-nowrap" title="Simüle veri — kavramsal gösterim">
          Simüle veri
        </div>
      </div>
    </header>
  );
}
