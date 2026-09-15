import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Scenario } from '../engine/scenarioRunner';
import XaiFigure from './XaiFigure';
import { portalHedefi, useModalKeys } from './useModalKeys';

export interface BuyutulenKanit {
  scenario: Scenario;
  channels: string[];
  level: 1 | 2 | 3;
  model: string;
  /** Senaryonun t = 0 anina denk gelen gorev saniyesi (zaman ekseni icin). */
  baslangicT: number;
  baslik: string;
}

/**
 * XAI kanit gorselinin buyutulmus gorunumu.
 *
 * Gorsel olceklenmez, daha yuksek cozunurlukte YENIDEN cizilir (scale=3);
 * boylece metinler ve egriler buyuk ekranda da keskin kalir. #root'a portal ile
 * basilir: panelin overflow kirpmasina takilmaz ve erisilebilirlik olcegini izler.
 */
export default function KanitBuyutec({ kanit, onClose }: { kanit: BuyutulenKanit | null; onClose: () => void }) {
  useModalKeys(kanit !== null, onClose);
  const kapatRef = useRef<HTMLButtonElement>(null);
  // Diger pencerelerde oldugu gibi acilista odak kapat dugmesine gider.
  useEffect(() => {
    if (kanit) kapatRef.current?.focus();
  }, [kanit]);
  if (!kanit) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={onClose}>
      {/* Kabuk konsolun diger pencereleriyle ayni: card-in kutu, num 14 px baslik, sade ✕. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={'XAI kanıtı · ' + kanit.baslik}
        className="card-in bg-ops-panel border border-ops-line2 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-3 py-2 border-b border-ops-line2">
          <span className="num text-[14px] font-semibold text-ops-text">XAI KANITI · {kanit.baslik.toLocaleUpperCase('tr-TR')}</span>
          <span className="text-3xs text-ops-faint tracking-[0.1em]">{kanit.model}</span>
          <button
            ref={kapatRef}
            onClick={onClose}
            className="ml-auto text-ops-dim hover:text-ops-text text-[13px] leading-none px-1"
            title="Kapat (Esc)"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
        <XaiFigure
          scenario={kanit.scenario}
          channels={kanit.channels}
          level={kanit.level}
          model={kanit.model}
          baslangicT={kanit.baslangicT}
          scale={3}
          // Olcege bolunur: #root'un zoom'u altinda vw/vh de olcekle carpiliyor.
          style={{ maxWidth: 'min(calc(92vw / var(--ui-scale, 1)), 2240px)', maxHeight: 'calc(88vh / var(--ui-scale, 1) - 60px)' }}
          className="block object-contain"
        />
      </div>
    </div>,
    portalHedefi(),
  );
}
