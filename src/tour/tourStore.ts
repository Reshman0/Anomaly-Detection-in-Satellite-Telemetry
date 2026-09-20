import { create } from 'zustand';
import { useConsole } from '../store';
import { TUR_HIZI } from '../engine/missionClock';
import type { Speed } from '../engine/missionClock';
import { TOURS, type TourId } from './tourScript';

/**
 * Tanitim turu durumu. Konsolun ana deposundan (store.ts) bilerek ayri:
 * tur kapaliyken konsolun hicbir davranisini degistirmez.
 */
interface TourState {
  active: boolean;
  /** Oynayan tur: tam gorunum ya da Ozet gorunum. */
  tour: TourId;
  stepIndex: number;
  start: (tour?: TourId) => void;
  stop: () => void;
  /** G tusu: kapaliysa ekrandaki gorunumun turunu baslatir. */
  toggle: () => void;
  /** Son adimdan sonra basa doner (kiosk dongusu). */
  next: () => void;
}

/** Tur baslamadan onceki konsol hizi; tur bitince geri alinir. */
let turOncesiHiz: Speed | null = null;

export const useTour = create<TourState>((set, get) => ({
  active: false,
  tour: 'tam',
  stepIndex: 0,
  // Tur boyunca konsol 5x akar: anlatim beklerken telemetri ve senaryo
  // izlenebilir hizda ilerlesin. 5x ust seritteki dugmelerde yoktur; tur
  // bitince operatorun hizi geri gelir.
  start: (tour) => {
    const konsol = useConsole.getState();
    if (turOncesiHiz === null) turOncesiHiz = konsol.speed;
    konsol.setSpeed(TUR_HIZI);
    set({ active: true, stepIndex: 0, tour: tour ?? (konsol.summaryMode ? 'ozet' : 'tam') });
  },
  stop: () => {
    if (turOncesiHiz !== null) {
      useConsole.getState().setSpeed(turOncesiHiz);
      turOncesiHiz = null;
    }
    set({ active: false });
  },
  toggle: () => (get().active ? get().stop() : get().start()),
  next: () => set((s) => ({ stepIndex: (s.stepIndex + 1) % TOURS[s.tour].length })),
}));
