import { useEffect, useRef } from 'react';
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

export default function App() {
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
    <div className="h-full w-full flex flex-col bg-ops-bg gap-px">
      <TopBar />
      <main className="flex-1 min-h-0 grid grid-cols-[minmax(0,35%)_minmax(0,1fr)] gap-px">
        <GlobeView />
        <div className="flex flex-col min-h-0 gap-px">
          <TelemetryPanel />
          <PacketInspector />
          <StatusBand />
        </div>
      </main>
      <div className="h-[236px] shrink-0 grid grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,720px)] gap-px">
        <ScenarioConsole />
        <AlarmQueue />
        <XaiPanel />
      </div>
    </div>
  );
}
