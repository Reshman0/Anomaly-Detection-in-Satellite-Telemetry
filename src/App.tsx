import { useEffect, useRef } from 'react';
import { useConsole } from './store';
import TopBar from './components/TopBar';
import OzetAlarmSeridi from './components/OzetAlarmSeridi';
import GlobeView from './components/GlobeView';
import TelemetryPanel from './components/TelemetryPanel';
import PacketInspector, { PacketInspectorBar } from './components/PacketInspector';
import StatusBand from './components/StatusBand';
import ScenarioConsole from './components/ScenarioConsole';
import AlarmQueue from './components/AlarmQueue';
import XaiPanel from './components/XaiPanel';
import PassBoard from './components/PassBoard';
import InfoPanel from './components/InfoPanel';
import AlarmDetail from './components/AlarmDetail';
import AccessibilityPanel from './components/AccessibilityPanel';
import AlarmAnnouncer from './components/AlarmAnnouncer';
import { SCENARIOS } from './engine/scenarioRunner';
import { SCALE_STEPS } from './ui/a11y';

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
  // Ek kisayollar: A erisilebilirlik, M 3B/2B harita, Ctrl +/-/0 arayuz olcegi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useConsole.getState();
      // Arayuz olcegi: tarayici yakinlastirmasi yerine konsolun kendi olcegi (WCAG 1.4.4).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0')) {
        const i = SCALE_STEPS.indexOf(st.a11y.scale as (typeof SCALE_STEPS)[number]);
        const cur = i < 0 ? 1 : i;
        const next = e.key === '0' ? 1 : e.key === '-' ? Math.max(0, cur - 1) : Math.min(SCALE_STEPS.length - 1, cur + 1);
        st.setA11y({ scale: SCALE_STEPS[next] });
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (st.selectedAlarmId !== null || st.a11yOpen) return; // pencere acik: Esc oradan islenir
      if (e.key === 'p' || e.key === 'P') {
        st.setPacketOpen(!st.packetOpen);
        e.preventDefault();
        return;
      }
      if (st.packetOpen) return; // paket denetleyici penceresi acik
      switch (e.key) {
        // Ozet modu. Pencere acikken calismaz (yukaridaki korumalar): arkadaki
        // ekran operator gormeden yeniden duzenlenmesin. Turkce klavyede Ö
        // tusu 'ö' gonderir; kucuk harfe cevirme yerel ayara bagli oldugu icin
        // durumlar acikca yazilir.
        case 'o':
        case 'O':
        case 'ö':
        case 'Ö':
          st.setSummaryMode(!st.summaryMode);
          break;
        case 'a':
        case 'A':
          st.setA11yOpen(true);
          break;
        case 'm':
        case 'M':
          st.setMapMode(st.mapMode === '3D' ? '2D' : '3D');
          break;
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
        case 'y':
        case 'Y':
          // "yakin": Ankara yakin goruntusu (NASA HLS, 30 m).
          st.setGlobeView('ANKARA');
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

  // Ozet modu <html>'e yazilir; CSS katmani (index.css) detayi oradan gizler.
  // Erisilebilirlik bayraklari da ayni yoldan gider (ui/a11y.ts applyA11y).
  const summaryMode = useConsole((s) => s.summaryMode);
  useEffect(() => {
    document.documentElement.dataset.summary = summaryMode ? '1' : '0';
  }, [summaryMode]);

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
      <main className="flex-1 min-h-0 grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] gap-px">
        {/* Kure tum sol sutunu alir. Paket denetleyici ust seritteki dugmeyle
            acilan bir pencere oldugu icin sag sutunda INFO paneline yer kaldi.
            Sutun ancak kure asgari yuksekligine sigmadiginda (cok yuksek arayuz
            olcegi) kendi icinde kayar; normalde ana ekran kaydirilmaz. */}
        <div className="flex flex-col min-h-0 overflow-y-auto">
          <GlobeView />
        </div>
        {/* Sag sutun kendi icinde kayar: yuksek arayuz olceginde Durum seridi
            kirpilmaz, kaydirilarak okunur. */}
        <div className="flex flex-col min-h-0 gap-px overflow-y-auto">
          {summaryMode && <OzetAlarmSeridi />}
          <TelemetryPanel />
          <PacketInspectorBar />
          {/* Ozet modunda InfoPanel yalnizca tespit + ONERI tasir; kazanilan yer
              telemetri seritlerine ve buyuyen Durum hukmune kalir. */}
          <div className={summaryMode ? 'h-[132px] shrink min-h-[100px] flex flex-col' : 'h-[196px] shrink min-h-[120px] flex flex-col'}>
            <InfoPanel />
          </div>
          <StatusBand />
        </div>
      </main>
      {/* Alt sira oransal: 1920'de eski sabit genisliklere (300/490/430/700) denk gelir,
          1536'da alarm kuyrugu 100 px'e sikismaz. */}
      <div className="h-[236px] shrink-0 grid grid-cols-[minmax(0,16%)_minmax(0,1fr)_minmax(0,22%)_minmax(0,36%)] gap-px">
        <ScenarioConsole />
        <AlarmQueue />
        <PassBoard />
        <XaiPanel />
      </div>
      <PacketInspector />
      <AlarmDetail />
      <AccessibilityPanel />
      <AlarmAnnouncer />
    </div>
  );
}
