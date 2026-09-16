import { useConsole } from '../store';
import { MIB } from '../engine/mib';
import { SPEED_OPTIONS, fmtCountdown, fmtDate, fmtTime, fmtTimeMs } from '../engine/missionClock';
import { GROUND_STATION, elevationAt, isVisible, nextPassEvent, satByNorad } from '../engine/orbit';
import { useMemo, useRef } from 'react';
import UyduBilgiPenceresi from './UyduBilgiPenceresi';

/**
 * Ust serit alani: etiket, deger ve alt bilgi ALT ALTA yazilir. Alanlar artan
 * bosluktan esit pay alir (grow), boylece serit sagda bos bir seride birakmaz.
 *
 * Onceden deger ile alt bilgi tek satirdaydi ve dar ekranda "..." ile
 * kirpiliyordu. Uc satirda en genis parca kadar yer kaplar, hicbir sey
 * kirpilmaz; serit sigmazsa alanlar alt satira sarar.
 */
function Field({
  label,
  sub,
  title,
  className,
  children,
}: {
  label: string;
  sub?: React.ReactNode;
  title?: string;
  /** Ek sinif — ozet modunda alanin tamamini gizlemek icin `ozet-gizle`. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={'flex flex-col justify-center px-2 border-r border-ops-line shrink-0 grow whitespace-nowrap' + (className ? ' ' + className : '')}
      title={title}
    >
      <div className="text-3xs uppercase tracking-[0.14em] text-ops-faint leading-none">{label}</div>
      <div className="num text-[13px] leading-[15px] mt-[2px]">{children}</div>
      {sub !== undefined && <div className="num text-[10px] leading-[12px] text-ops-faint">{sub}</div>}
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
  const summaryMode = useConsole((s) => s.summaryMode);
  const setSummaryMode = useConsole((s) => s.setSummaryMode);
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

  // Serit sigmadiginda alanlar kirpilmaz, alt satira sarar.
  return (
    <header className="min-h-[52px] shrink-0 flex flex-wrap items-stretch bg-ops-panel border-b border-ops-line2">
      <div className="flex flex-col justify-center px-3 border-r border-ops-line2 bg-ops-sunken shrink-0 grow">
        <div className="text-3xs uppercase tracking-[0.18em] text-ops-faint leading-none">Görev</div>
        <div className="num text-[15px] leading-tight mt-[2px] text-ops-text">{MIB.mission}</div>
      </div>

      <Field label="UTC" sub={fmtDate(utcMs)}>
        <span className="text-ops-text">{fmtTimeMs(utcMs)}</span>
      </Field>

      <Field className="ozet-gizle" label="OBT" sub={'ofset ' + MIB.obt_offset_s.toFixed(3) + ' s'} title="Uydu üstü zaman: yer zamanından sabit ofset kadar kaymış">
        <span className="text-ops-dim">{fmtTimeMs(obtMs)}</span>
      </Field>

      {/* Hiz dugmeleri iki satira dizilir: serit tek satirda kalsin diye. */}
      <div className="flex flex-col justify-center px-2 border-r border-ops-line shrink-0 grow">
        <div className="text-3xs uppercase tracking-[0.14em] text-ops-faint leading-none">Hız</div>
        <div className="grid grid-cols-3 gap-[3px] mt-[3px]">
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

      <Field className="ozet-gizle" label="SLE RAF" sub="RCF: READY" title="SLE RAF/RCF · CCSDS 911.1 uzay bağlantısı">
        <span className={visible ? 'text-ops-nominal' : 'text-ops-dim'}>{visible ? 'ACTIVE' : 'READY'}</span>
      </Field>

      <Field className="ozet-gizle" label="İstasyon" sub={GROUND_STATION.lat_deg.toFixed(3) + '°N ' + GROUND_STATION.lon_deg.toFixed(3) + '°E'}>
        <span className="text-ops-text">{GROUND_STATION.name}</span>
      </Field>

      <Field
        label={pass ? (pass.kind === 'AOS' ? 'AOS geri sayım' : 'LOS geri sayım') : 'Görünürlük'}
        sub={pass ? '@ ' + fmtTime(pass.targetMs) : '6 sa içinde geçiş yok'}
      >
        {pass ? (
          <span className={pass.kind === 'LOS' ? 'text-ops-nominal' : 'text-ops-text'}>
            {fmtCountdown((pass.targetMs - utcMs) / 1000)}
          </span>
        ) : (
          // 6 saatlik ufukta gecis yok: istasyon boylamindaki GEO uydularinda beklenen durum.
          <span className={visible ? 'text-ops-nominal' : 'text-ops-dim'}>{visible ? 'sürekli görünür' : 'görüş dışı'}</span>
        )}
      </Field>

      <Field label="Yükselti" sub={'en az ' + GROUND_STATION.min_elevation_deg.toFixed(0) + '°'}>
        <span className={elevation >= GROUND_STATION.min_elevation_deg ? 'text-ops-nominal' : 'text-ops-dim'}>
          {elevation.toFixed(1)}°
        </span>
      </Field>

      {/* Model adi soldaki Gorev alaninda zaten yaziyor; burada tekrar edilmez. */}
      <Field
        label="Seçili uydu"
        sub={'NORAD ' + sat.norad + ' · ' + sat.intlDes}
        title={sat.name + ' · ' + sat.orbitClass + ' · TLE yaşı ' + tleAge + ' gün · model ' + MIB.mission}
      >
        <span className="text-ops-text">{sat.name}</span>
        <span className="ozet-gizle text-ops-faint ml-2 text-[11px]">
          {sat.orbitClass} · TLE {tleAge} gün
        </span>
      </Field>

      <div className="flex items-center gap-2 px-2 shrink-0 ml-auto">
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
        {/* "Mod" eki: AlarmDetail'deki ÖZET sekmesiyle karismasin. */}
        <button
          onClick={() => setSummaryMode(!summaryMode)}
          aria-pressed={summaryMode}
          title={summaryMode ? 'Özet mod açık — tüm detayı göster (O)' : 'Özet mod: yalnızca kritik bilgi, detay gizlenir (O)'}
          className={
            'num text-[10px] tracking-[0.12em] uppercase px-2 py-[3px] border leading-none whitespace-nowrap ' +
            (summaryMode ? 'border-ops-nominal text-ops-nominal' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
          }
        >
          Özet mod{summaryMode ? ' ●' : ''}
        </button>
        <UyduBilgiPenceresi />
        <div className="border border-ops-soft/60 text-ops-soft text-[10px] tracking-[0.14em] uppercase px-2 py-[3px] leading-none whitespace-nowrap" title="Simüle veri — kavramsal gösterim">
          Simüle veri
        </div>
      </div>
    </header>
  );
}
