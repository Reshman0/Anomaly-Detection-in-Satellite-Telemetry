import { create } from 'zustand';
import { Simulation } from './engine/simulation';
import type { Speed } from './engine/missionClock';
import { DEFAULT_SEVERITY_INDEX, NOMINAL_SCENARIO, type Scenario } from './engine/scenarioRunner';
import { DEFAULT_NORAD } from './engine/orbit';

/** Kure cerceveleme onayari: LEO'ya yakinlas ya da GEO halkasi dahil hepsini sigdir. */
export type GlobeView = 'LEO' | 'ALL';
/** Dunya zemini temasi: operasyon (koyu), siyasi harita, fiziki (NASA Blue Marble). */
export type EarthTheme = 'ops' | 'political' | 'physical';

interface ConsoleState {
  sim: Simulation;
  /** Her cizim turunda artar; bilesenler bunu izleyerek yeniden cizer. */
  version: number;
  speed: Speed;
  severityIndex: number;
  selectedAlarmId: number | null;
  xaiLevel: 1 | 2 | 3;
  /** Ust seritteki AOS/LOS, yorunge izi ve gorus vektorunu suren uydu. */
  selectedNorad: string;
  globeView: GlobeView;
  /** Kure cerceveleme istegi sayaci — GlobeView bunu izleyip kamerayi yeniden kurar. */
  globeFitNonce: number;
  /** Kamera secili uyduyu takip eder; dunya altinda doner. */
  followSat: boolean;
  earthTheme: EarthTheme;

  tick: (realDtMs: number) => void;
  setSpeed: (s: Speed) => void;
  setSeverity: (i: number) => void;
  runScenario: (s: Scenario) => void;
  backToNominal: () => void;
  selectAlarm: (id: number | null) => void;
  ackAlarm: (id: number) => void;
  setXaiLevel: (l: 1 | 2 | 3) => void;
  selectSatellite: (norad: string) => void;
  setGlobeView: (v: GlobeView) => void;
  setFollow: (on: boolean) => void;
  setEarthTheme: (t: EarthTheme) => void;
}

export const useConsole = create<ConsoleState>((set, get) => ({
  sim: new Simulation(),
  version: 0,
  speed: 1,
  severityIndex: DEFAULT_SEVERITY_INDEX,
  selectedAlarmId: null,
  xaiLevel: 1,
  selectedNorad: DEFAULT_NORAD,
  globeView: 'ALL',
  globeFitNonce: 0,
  followSat: false,
  earthTheme: 'ops',

  tick: (realDtMs) => {
    get().sim.advance(realDtMs);
    set((s) => ({ version: s.version + 1 }));
  },

  setSpeed: (speed) => {
    get().sim.clock.setSpeed(speed);
    set({ speed });
  },

  setSeverity: (severityIndex) => {
    get().sim.setSeverity(severityIndex);
    set({ severityIndex });
  },

  runScenario: (scenario) => {
    const { sim } = get();
    // Senaryolar 90 gorev saniyesi surer; operator konsolu izleyebilsin diye
    // baslarken hiz 1x'e alinir (yonerge §10, "90 saniyede tamamlanir").
    sim.clock.setSpeed(1);
    sim.startScenario(scenario);
    set({ speed: 1, xaiLevel: 1, selectedAlarmId: null });
  },

  backToNominal: () => {
    get().sim.startScenario(NOMINAL_SCENARIO);
    set({ selectedAlarmId: null });
  },

  selectAlarm: (selectedAlarmId) => set({ selectedAlarmId }),
  ackAlarm: (id) => {
    get().sim.acknowledge(id);
    set((s) => ({ version: s.version + 1 }));
  },
  setXaiLevel: (xaiLevel) => set({ xaiLevel }),

  selectSatellite: (selectedNorad) => set({ selectedNorad }),
  setGlobeView: (globeView) => set((s) => ({ globeView, globeFitNonce: s.globeFitNonce + 1, followSat: false })),
  setFollow: (followSat) => set({ followSat }),
  setEarthTheme: (earthTheme) => set({ earthTheme }),
}));

// Gelistirme sirasinda konsoldan durum incelemek icin (yalnizca dev derlemesi).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__azs = useConsole;
}
