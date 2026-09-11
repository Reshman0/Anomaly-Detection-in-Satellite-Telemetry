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
import PassBoard from './components/PassBoard';
import InfoPanel from './components/InfoPanel';
import AlarmDetail from './components/AlarmDetail';
import { SCENARIOS } from './engine/scenarioRunner';

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

  // Sunucu kisayollari: 1/2/3 senaryo, N nominal, L/T kure gorunumu, F takip, 0 hiz 1x.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const st = useConsole.getState();
      if (st.selectedAlarmId !== null) return; // alarm detay penceresi acik
      switch (e.key) {
        case '1':
        case '2':
        case '3': {
          const sc = SCENARIOS[Number(e.key) - 1];
          if (sc) st.runScenario(sc);
          break;
        }
        case 'n':
        case 'N':
          st.backToNominal();
          break;
        case 'l':
        case 'L':
          st.setGlobeView('LEO');
          break;
        case 't':
        case 'T':
          st.setGlobeView('ALL');
          break;
        case 'f':
        case 'F':
          st.setFollow(!st.followSat);
          break;
        case '0':
          st.setSpeed(1);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        <div className="flex flex-col min-h-0 gap-px">
          <GlobeView />
          <div className="h-[250px] shrink-0 flex flex-col">
            <InfoPanel />
          </div>
        </div>
        <div className="flex flex-col min-h-0 gap-px">
          <TelemetryPanel />
          <div className="h-[212px] shrink-0 flex flex-col">
            <PacketInspector />
          </div>
          <StatusBand />
        </div>
      </main>
      <div className="h-[236px] shrink-0 grid grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,430px)_minmax(0,700px)] gap-px">
        <ScenarioConsole />
        <AlarmQueue />
        <PassBoard />
        <XaiPanel />
      </div>
      <AlarmDetail />
    </div>
  );
}
