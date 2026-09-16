import { create } from 'zustand';
import { TOUR_STEPS } from './tourScript';

/**
 * Tanitim turu durumu. Konsolun ana deposundan (store.ts) bilerek ayri:
 * tur kapaliyken konsolun hicbir davranisini degistirmez.
 */
interface TourState {
  active: boolean;
  stepIndex: number;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  /** Son adimdan sonra basa doner (kiosk dongusu). */
  next: () => void;
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  stepIndex: 0,
  start: () => set({ active: true, stepIndex: 0 }),
  stop: () => set({ active: false }),
  toggle: () => (get().active ? get().stop() : get().start()),
  next: () => set((s) => ({ stepIndex: (s.stepIndex + 1) % TOUR_STEPS.length })),
}));
