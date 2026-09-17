import { create } from 'zustand';
import { useConsole } from '../store';
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

export const useTour = create<TourState>((set, get) => ({
  active: false,
  tour: 'tam',
  stepIndex: 0,
  start: (tour) =>
    set({ active: true, stepIndex: 0, tour: tour ?? (useConsole.getState().summaryMode ? 'ozet' : 'tam') }),
  stop: () => set({ active: false }),
  toggle: () => (get().active ? get().stop() : get().start()),
  next: () => set((s) => ({ stepIndex: (s.stepIndex + 1) % TOURS[s.tour].length })),
}));
