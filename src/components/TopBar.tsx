import { useConsole } from '../store';
import { MIB } from '../engine/mib';
import { SPEED_OPTIONS, fmtCountdown, fmtDate, fmtTime, fmtTimeMs } from '../engine/missionClock';
import { GROUND_STATION, TLE_EPOCH_MS, TLE_NAME, elevationAt, isVisible, nextPassEvent } from '../engine/orbit';
import { useMemo, useRef } from 'react';

function Field({ label, children, w }: { label: string; children: React.ReactNode; w?: string }) {
  return (
    <div className={'flex flex-col justify-center px-3 border-r border-ops-line ' + (w ?? '')}>
      <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint leading-none whitespace-nowrap">
        {label}
      </div>
      <div className="num text-[13px] leading-tight mt-[3px] whitespace-nowrap">{children}</div>
    </div>
  );
}

export default function TopBar() {
  const speed = useConsole((s) => s.speed);
  const setSpeed = useConsole((s) => s.setSpeed);
  // Duraklatilmisken secili hiz vurgusu sonuk gorunur: akis gercekten akmiyor.
  const durduruldu = useConsole((s) => s.durduruldu);
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

      {/*
        Saat ve tarih ayni satirda sigmiyordu: tarih alt satira sariyor ve
        seritten tasiyordu. Iki satira ayrildi. Genislik 161 px'e sabitlendi
        cunku seritte esneme payi 1 px; alan daralsa sagindaki yedi alanin
        tamami sola kayardi.
      */}
      <Field label="UTC" w="w-[161px] shrink-0">
        <div className="text-ops-text leading-none">{fmtTimeMs(utcMs)}</div>
        <div className="text-ops-faint text-[11px] leading-none mt-[4px]">{fmtDate(utcMs)}</div>
      </Field>

      <Field label={'Uydu saati (' + MIB.obt_offset_s.toFixed(3) + ' s)'} w="w-[168px] shrink-0">
        <span className="text-ops-dim">{fmtTimeMs(obtMs)}</span>
      </Field>

      <div className="flex flex-col justify-center px-3 border-r border-ops-line">
        <div className="text-2xs uppercase tracking-[0.16em] text-ops-faint leading-none">Hız</div>
        <div className="flex gap-1 mt-1.5">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={
                'num text-[15px] px-3 py-[3px] border transition-colors ' +
                (speed === s && !durduruldu
                  ? 'border-ops-nominal text-ops-nominal bg-ops-nominal/10'
                  : 'border-ops-line2 text-ops-dim hover:text-ops-text')
              }
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/*
        Akis, sistem uyari verdiginde kendiliginden durur. Bu dugme hem durumu
        gorunur kilar hem de devam ettirir; sunucu anlatmayi bitirdiginde tek
        tiklamayla akis surer.
      */}
      <Field label="Uydu bağlantısı" w="w-[132px] shrink-0">
        <span className={visible ? 'text-ops-nominal' : 'text-ops-dim'}>
          {visible ? 'VERİ AKIYOR' : 'BEKLEMEDE'}
        </span>
      </Field>

      <Field label="İstasyon">
        <span className="text-ops-text">{GROUND_STATION.name}</span>
        <span className="text-ops-faint ml-2 text-[11px]">
          {GROUND_STATION.lat_deg.toFixed(3)}°N {GROUND_STATION.lon_deg.toFixed(3)}°E
        </span>
      </Field>

      <Field
        label={pass ? (pass.kind === 'AOS' ? 'Görüşe girmesine' : 'Görüşten çıkmasına') : 'Görüş penceresi'}
        w="w-[168px] shrink-0"
      >
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

      <Field label="Yükselti / min" w="w-[124px] shrink-0">
        <span className={elevation >= GROUND_STATION.min_elevation_deg ? 'text-ops-nominal' : 'text-ops-dim'}>
          {elevation.toFixed(1)}°
        </span>
        <span className="text-ops-faint ml-2 text-[11px]">≥ {GROUND_STATION.min_elevation_deg.toFixed(0)}°</span>
      </Field>

      <Field label="Uydu">
        <span className="text-ops-text">{TLE_NAME}</span>
        <span className="text-ops-faint ml-2 text-[11px] whitespace-nowrap">
          yörünge verisi {tleAge} gün
        </span>
      </Field>

      <div className="flex-1" />
    </header>
  );
}
