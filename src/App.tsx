import { useEffect, useRef, useState } from 'react';
import { useConsole } from './store';
import TopBar from './components/TopBar';
import GlobeView from './components/GlobeView';
import TelemetryPanel from './components/TelemetryPanel';
import PacketInspector from './components/PacketInspector';
import StatusBand from './components/StatusBand';
import ScenarioConsole from './components/ScenarioConsole';
import AlarmQueue from './components/AlarmQueue';
import XaiPanel from './components/XaiPanel';

/** Arayuz tazeleme araligi (ms). Gorev saati bundan bagimsiz ilerler. */
const UI_INTERVAL_MS = 66;
/**
 * Tek turda islenecek en fazla gercek sure. Sekme arka plana alinip geri
 * gelirse gorev saati bir anda ileri firlamasin diye kelepcelenir.
 */
const MAX_DT_MS = 500;

/**
 * Konsolun tasarim yuzeyi. Duzen bu olcude sabittir; pencere baska boyuttaysa
 * yuzeyin tamami tek parca olarak olceklenir. Boylece hicbir cozunurlukte
 * panel sikismasi, kirpilma ya da ust uste binme olusmaz ve gelistirme
 * ekraninda gorunen sey projeksiyonda gorunecek seyin aynisidir.
 */
const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * Pencereye sigan tek tip olcek carpani (en-boy orani korunur).
 *
 * Olcum icin resize olayi degil ResizeObserver kullanilir: resize olayi
 * pencere disindaki boyut degisikliklerinde (tarayici cihaz emulasyonu,
 * bazi pencere yoneticileri, gomulu cerceveler) tetiklenmeyebiliyor ve
 * yuzey eski olcekte kalip ekrandan tasiyor.
 */
function useStageScale(): number {
  const [scale, setScale] = useState(() => {
    const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    return s > 0 ? s : 1;
  });
  useEffect(() => {
    const fit = () => {
      const el = document.documentElement;
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      // Pencere gizliyken (sekme arka planda, panel kapali) olcum 0 gelebilir;
      // bu durumda olcegi 0'a dusurup konsolu yok etmek yerine sonuncuyu koru.
      if (w <= 0 || h <= 0) return;
      setScale(Math.min(w / STAGE_W, h / STAGE_H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);
  return scale;
}

export default function App() {
  const scale = useStageScale();
  const tick = useConsole((s) => s.tick);
  const last = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = now - last.current;
      if (dt < UI_INTERVAL_MS) return;
      last.current = now;
      tick(Math.min(dt, MAX_DT_MS));
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  return (
    <div className="fixed inset-0 bg-ops-bg overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 flex flex-col bg-ops-bg gap-px"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <TopBar />
        <main className="flex-1 min-h-0 grid grid-cols-[minmax(0,35%)_minmax(0,1fr)] gap-px">
          <GlobeView />
          <div className="flex flex-col min-h-0 gap-px">
            <TelemetryPanel />
            <PacketInspector />
            <StatusBand />
          </div>
        </main>
        {/* 256 px: senaryo konsolunun sasma kaydiricisi + nominale donus satiri
            tasarim yuzeyine tam sigsin diye 236'dan yukseltildi. */}
        <div className="h-[256px] shrink-0 grid grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,720px)] gap-px">
          <ScenarioConsole />
          <AlarmQueue />
          <XaiPanel />
        </div>
      </div>
    </div>
  );
}
