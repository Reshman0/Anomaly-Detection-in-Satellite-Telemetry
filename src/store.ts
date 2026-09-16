import { create } from 'zustand';
import { Fleet } from './engine/fleet';
import type { Simulation } from './engine/simulation';
import type { Speed } from './engine/missionClock';
import { DEFAULT_SEVERITY_INDEX, NOMINAL_SCENARIO, type Scenario } from './engine/scenarioRunner';
import { DEFAULT_NORAD } from './engine/orbit';
import type { Alarm } from './engine/types';
import { applyA11y, buildPalette, clearA11y, loadA11y, saveA11y, type A11ySettings } from './ui/a11y';
import { setPalette } from './ui/colors';

/** Kure cerceveleme onayari: LEO'ya yakinlas ya da GEO halkasi dahil hepsini sigdir. */
export type GlobeView = 'LEO' | 'ALL';
/**
 * Dunya zemini temasi: operasyon (koyu), siyasi harita, fiziki (NASA Blue
 * Marble, Aralik 2004), guncel (NASA GIBS gunluk VIIRS mozaigi).
 */
export type EarthTheme = 'ops' | 'political' | 'physical' | 'current';
/** Dunya gorunumu: 3B kure ya da 2B esdikdortgen harita. */
export type MapMode = '3D' | '2D';
/** Alarm kuyrugu kapsami: yalnizca secili uydu ya da tum filo. */
export type AlarmScope = 'sat' | 'fleet';

/**
 * Filo tek ornektir ve gorev saatini o tutar. `sim` alani her zaman secili
 * uydunun simulasyonunu gosterir; boylece `useConsole((s) => s.sim)` yapan
 * bilesenler degismeden secili uydunun verisini okur.
 */
export const fleet = new Fleet(DEFAULT_NORAD);

interface ConsoleState {
  sim: Simulation;
  /** Her cizim turunda artar; bilesenler bunu izleyerek yeniden cizer. */
  version: number;
  speed: Speed;
  severityIndex: number;
  selectedAlarmId: number | null;
  /** Secili alarmin uydusu — alarm baska bir uydunun kuyrugundan gelmis olabilir. */
  selectedAlarmNorad: string | null;
  alarmScope: AlarmScope;
  /**
   * Ozet modu: yalnizca kritik bilgi. Paneller yerinde kalir, detay gizlenir
   * (bkz. index.css `html[data-summary]`, engine/summary.ts). Kalici degil —
   * diger gorunum modlari gibi her acilista kapali baslar.
   */
  summaryMode: boolean;
  xaiLevel: 1 | 2 | 3;
  /** Ust seritteki AOS/LOS, yorunge izi ve gorus vektorunu suren uydu. */
  selectedNorad: string;
  globeView: GlobeView;
  /** Kure cerceveleme istegi sayaci — GlobeView bunu izleyip kamerayi yeniden kurar. */
  globeFitNonce: number;
  /** Kamera secili uyduyu takip eder; dunya altinda doner. */
  followSat: boolean;
  earthTheme: EarthTheme;
  /** GUNCEL tema icin istenen gun: 1 = dun, 2, 3... (mozaik tazelenirken kullanilir). */
  imageryDaysBack: number;
  mapMode: MapMode;
  /** Paket denetleyici pencere (pop-up) acik mi. */
  packetOpen: boolean;
  /** Erisilebilirlik ayar paneli acik mi. */
  a11yOpen: boolean;
  a11y: A11ySettings;
  /** Palet her degistiginde artar; bir kez kurulan renkler (three.js) bunu izler. */
  paletteVersion: number;

  tick: (realDtMs: number) => void;
  setSpeed: (s: Speed) => void;
  setSeverity: (i: number) => void;
  runScenario: (s: Scenario) => void;
  backToNominal: () => void;
  selectAlarm: (a: Alarm | null) => void;
  ackAlarm: (id: number, norad: string) => void;
  setAlarmScope: (scope: AlarmScope) => void;
  setSummaryMode: (on: boolean) => void;
  setXaiLevel: (l: 1 | 2 | 3) => void;
  selectSatellite: (norad: string) => void;
  setGlobeView: (v: GlobeView) => void;
  setFollow: (on: boolean) => void;
  setEarthTheme: (t: EarthTheme) => void;
  setImageryDaysBack: (d: number) => void;
  setMapMode: (m: MapMode) => void;
  setPacketOpen: (open: boolean) => void;
  setA11yOpen: (open: boolean) => void;
  setA11y: (patch: Partial<A11ySettings>) => void;
  resetA11y: () => void;
}

const initialA11y = loadA11y();
{
  const p = buildPalette(initialA11y);
  setPalette(p);
  applyA11y(initialA11y, p);
}

export const useConsole = create<ConsoleState>((set, get) => ({
  sim: fleet.active,
  version: 0,
  speed: 1,
  severityIndex: DEFAULT_SEVERITY_INDEX,
  selectedAlarmId: null,
  selectedAlarmNorad: null,
  alarmScope: 'sat',
  summaryMode: false,
  xaiLevel: 1,
  selectedNorad: DEFAULT_NORAD,
  globeView: 'ALL',
  globeFitNonce: 0,
  followSat: false,
  earthTheme: 'ops',
  imageryDaysBack: 1,
  mapMode: '3D',
  packetOpen: false,
  a11yOpen: false,
  a11y: initialA11y,
  paletteVersion: 1,

  tick: (realDtMs) => {
    fleet.advance(realDtMs);
    set((s) => ({ version: s.version + 1 }));
  },

  setSpeed: (speed) => {
    fleet.clock.setSpeed(speed);
    set({ speed });
  },

  setSeverity: (severityIndex) => {
    get().sim.setSeverity(severityIndex);
    set({ severityIndex });
  },

  runScenario: (scenario) => {
    const { sim } = get();
    // Hiz degistirilmez: operator hangi hizda izliyorsa senaryo o hizda akar.
    // 1x'e donmek icin ust seritteki dugme ya da 0 kisayolu kullanilir.
    sim.startScenario(scenario);
    set({ xaiLevel: 1, selectedAlarmId: null });
  },

  backToNominal: () => {
    get().sim.startScenario(NOMINAL_SCENARIO);
    set({ selectedAlarmId: null });
  },

  selectAlarm: (a) => set({ selectedAlarmId: a?.id ?? null, selectedAlarmNorad: a?.norad ?? null }),
  ackAlarm: (id, norad) => {
    fleet.peek(norad)?.acknowledge(id);
    set((s) => ({ version: s.version + 1 }));
  },
  setAlarmScope: (alarmScope) => set({ alarmScope }),
  setSummaryMode: (summaryMode) => set({ summaryMode }),
  setXaiLevel: (xaiLevel) => set({ xaiLevel }),

  // Uydu secimi artik simulasyonu da secer: senaryo bu uyduya enjekte edilir,
  // alarm kuyrugu bu uydunun hafizasini gosterir.
  selectSatellite: (selectedNorad) => {
    if (selectedNorad === fleet.selectedNorad) return;
    const sim = fleet.select(selectedNorad);
    // Siddet carpani konsolda tek kaydiraktir; yeni uydu da onu kullansin.
    sim.setSeverity(get().severityIndex);
    set((s) => ({
      selectedNorad,
      sim,
      selectedAlarmId: null,
      selectedAlarmNorad: null,
      version: s.version + 1,
    }));
  },
  setGlobeView: (globeView) => set((s) => ({ globeView, globeFitNonce: s.globeFitNonce + 1, followSat: false })),
  setFollow: (followSat) => set({ followSat }),
  setEarthTheme: (earthTheme) => set({ earthTheme }),
  setImageryDaysBack: (imageryDaysBack) => set({ imageryDaysBack }),
  // 2B haritaya ilk gecis: koyu OPS zemini 2B'de anlamsiz kalir; fiziki (gercek
  // renk + topografya golgesi) zemine gecilir. Kullanici sonra istedigini secer.
  setMapMode: (mapMode) =>
    set((s) => ({ mapMode, earthTheme: mapMode === '2D' && s.earthTheme === 'ops' ? 'physical' : s.earthTheme })),
  setPacketOpen: (packetOpen) => set({ packetOpen }),
  setA11yOpen: (a11yOpen) => set({ a11yOpen }),
  setA11y: (patch) => {
    const a11y = { ...get().a11y, ...patch };
    const p = buildPalette(a11y);
    setPalette(p);
    applyA11y(a11y, p);
    saveA11y(a11y);
    set((s) => ({ a11y, paletteVersion: s.paletteVersion + 1 }));
  },
  resetA11y: () => {
    // Sifirlama: depolanan ayari sil, varsayilanlara (sistem tercihi dahil) don.
    clearA11y();
    const fresh = loadA11y();
    const p = buildPalette(fresh);
    setPalette(p);
    applyA11y(fresh, p);
    set((s) => ({ a11y: fresh, paletteVersion: s.paletteVersion + 1 }));
  },
}));

// Gelistirme sirasinda konsoldan durum incelemek icin (yalnizca dev derlemesi).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__azs = useConsole;
}
