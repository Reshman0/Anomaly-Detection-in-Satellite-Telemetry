import { create } from 'zustand';
import type { XaiEvidence } from './engine/types';
import { Simulation } from './engine/simulation';
import type { Speed } from './engine/missionClock';
import { DEFAULT_SEVERITY_INDEX, NOMINAL_SCENARIO, type Scenario } from './engine/scenarioRunner';

interface ConsoleState {
  sim: Simulation;
  /** Her cizim turunda artar; bilesenler bunu izleyerek yeniden cizer. */
  version: number;
  speed: Speed;
  severityIndex: number;
  selectedAlarmId: number | null;
  xaiLevel: 1 | 2 | 3;
  /** Motorun XAI sayacinin en son gorulen degeri; sekme ilerletmeyi tetikler. */
  lastXaiSeq: number;

  /**
   * Akis duraklatildi mi. Sistem uyari verdiginde kendiliginden true olur;
   * sunucu hazir oldugunda hiz dugmesine basarak devam ettirir.
   */
  durduruldu: boolean;
  /** Bu senaryo kosusunda duraklatma yapildi mi — bir kereden fazla durmaz. */
  duraklatmaYapildi: boolean;

  /** Ekranin ortasinda buyutulmus gosterilen XAI gorseli (yoksa null). */
  buyukGorsel: { kanit: XaiEvidence; baslik: string } | null;
  gorselAc: (kanit: XaiEvidence, baslik: string) => void;
  gorselKapat: () => void;

  devamEt: () => void;

  tick: (realDtMs: number) => void;
  setSpeed: (s: Speed) => void;
  setSeverity: (i: number) => void;
  runScenario: (s: Scenario) => void;
  backToNominal: () => void;
  selectAlarm: (id: number | null) => void;
  setXaiLevel: (l: 1 | 2 | 3) => void;
}

/** Aktif senaryonun kac XAI kanit adimi uretecegi. */
function xaiAdimSayisi(sim: Simulation): number {
  const sc = sim.activeScenario;
  if (!sc) return 0;
  return sc.timeline.filter((st) => st.type === 'show_xai').length;
}

export const useConsole = create<ConsoleState>((set, get) => ({
  sim: new Simulation(),
  version: 0,
  speed: 1,
  severityIndex: DEFAULT_SEVERITY_INDEX,
  selectedAlarmId: null,
  xaiLevel: 1,
  lastXaiSeq: 0,
  durduruldu: false,
  duraklatmaYapildi: false,
  buyukGorsel: null,

  gorselAc: (kanit, baslik) => set({ buyukGorsel: { kanit, baslik } }),
  gorselKapat: () => set({ buyukGorsel: null }),

  devamEt: () => set({ durduruldu: false }),

  tick: (realDtMs) => {
    const { sim } = get();
    // Duraklatildiysa gorev saati de durur: seritler, paketler, her sey donar.
    if (get().durduruldu) return;
    sim.advance(realDtMs);

    /*
     * Akis, MODELIN GEREKCESI TAMAMEN EKRANA GELDIKTEN SONRA durur.
     *
     * Senaryo uc kanit adimi uretir: nerede saptI -> hangi kanal -> isi
     * haritasi. Duraklatma, bunlarin SONUNCUSU dustugu anda gerceklesir.
     * Boylece donan karede aciklamanin tamami hazir olur ve sunucu uc adimi
     * tek nefeste gezebilir.
     *
     * Ara adimlarda durulmaz: her kanitta durmak sunumu kesik kesik yapardi.
     * Senaryo kosusu basina yalnizca BIR kez durulur.
     */
    const toplamKanit = xaiAdimSayisi(sim);
    if (
      !get().duraklatmaYapildi &&
      toplamKanit > 0 &&
      sim.xai.length >= toplamKanit
    ) {
      set({ durduruldu: true, duraklatmaYapildi: true });
    }

    set((s) => {
      // Senaryo yeni bir XAI kaniti urettiyse panel o seviyeye gecer; boylece
      // uc seviye sunum sirasinda kendiliginden sirayla acilir (README §5).
      if (sim.xaiSeq !== s.lastXaiSeq) {
        return { version: s.version + 1, lastXaiSeq: sim.xaiSeq, xaiLevel: sim.xaiLatestLevel };
      }
      return { version: s.version + 1 };
    });
  },

  setSpeed: (speed) => {
    get().sim.clock.setSpeed(speed);
    // Hiz dugmesine basmak ayni zamanda "devam et" demektir: duraklamis
    // akisi surdurmek icin ayrica baska bir yere tiklamak gerekmez.
    set({ speed, durduruldu: false });
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
    // Kanitlar sifirlandi: panel 1. seviyeye doner ve sayac yeniden hizalanir.
    set({
      speed: 1,
      xaiLevel: 1,
      selectedAlarmId: null,
      lastXaiSeq: sim.xaiSeq,
      durduruldu: false,
      duraklatmaYapildi: false,
    });
  },

  backToNominal: () => {
    get().sim.startScenario(NOMINAL_SCENARIO);
    set({ selectedAlarmId: null, durduruldu: false, duraklatmaYapildi: false });
  },

  selectAlarm: (selectedAlarmId) => set({ selectedAlarmId }),
  setXaiLevel: (xaiLevel) => set({ xaiLevel }),
}));

// Gelistirme sirasinda konsoldan durum incelemek icin (yalnizca dev derlemesi).
// `typeof window` kontrolu: store birim testlerinde tarayici olmadan yuklenir.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__azs = useConsole;
}
