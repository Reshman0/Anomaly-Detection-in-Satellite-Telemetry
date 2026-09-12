import { createPortal } from 'react-dom';
import type { Scenario } from '../engine/scenarioRunner';
import XaiFigure from './XaiFigure';
import { useModalKeys } from './useModalKeys';

export interface BuyutulenKanit {
  scenario: Scenario;
  channels: string[];
  level: 1 | 2 | 3;
  model: string;
  baslik: string;
}

/**
 * XAI kanit gorselinin buyutulmus gorunumu.
 *
 * Gorsel olceklenmez, daha yuksek cozunurlukte YENIDEN cizilir (scale=3);
 * boylece metinler ve egriler buyuk ekranda da keskin kalir. document.body'ye
 * portal ile basilir ki panelin overflow kirpmasina takilmasin.
 */
export default function KanitBuyutec({ kanit, onClose }: { kanit: BuyutulenKanit | null; onClose: () => void }) {
  useModalKeys(kanit !== null, onClose);
  if (!kanit) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-ops-bg/95 flex items-center justify-center p-8" onClick={onClose}>
      <div className="relative bg-ops-sunken border border-ops-line2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-6 px-5 py-3 border-b border-ops-line">
          <span className="text-[18px] font-semibold text-ops-text">{kanit.baslik}</span>
          <button
            onClick={onClose}
            aria-label="Kapat"
            title="Kapat (Esc)"
            className="shrink-0 w-9 h-9 flex items-center justify-center text-[20px] leading-none text-ops-dim border border-ops-line2 hover:text-ops-text hover:border-ops-dim transition-colors"
          >
            ✕
          </button>
        </div>
        <XaiFigure
          scenario={kanit.scenario}
          channels={kanit.channels}
          level={kanit.level}
          model={kanit.model}
          scale={3}
          style={{ maxWidth: 'min(92vw, 2240px)', maxHeight: 'calc(88vh - 60px)' }}
          className="block object-contain"
        />
      </div>
    </div>,
    document.body,
  );
}
