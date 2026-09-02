import { useEffect } from 'react';
import { useConsole } from '../store';
import XaiFigure from './XaiFigure';

/**
 * XAI gorselinin buyutulmus gorunumu.
 *
 * ONEMLI: Bu bilesen, olceklenen tasarim yuzeyinin DISINDA render edilir
 * (bkz. `App.tsx`). Yuzeyin icinde olsaydi CSS `transform` onu da olcekler ve
 * gorsel yukari olceklenip bulaniklasirdi. Disarida oldugu icin gercek pencere
 * pikselleriyle calisir.
 *
 * Netlik icin gorsel DOGAL boyutunun uzerine cikarilmaz: sekiller 2240x840
 * uretilir, burada en fazla o boyutta gosterilir. Kucultmek keskindir,
 * buyutmek degildir.
 */
export default function GorselBuyutec() {
  const buyuk = useConsole((s) => s.buyukGorsel);
  const kapat = useConsole((s) => s.gorselKapat);

  // Esc ile de kapansin — fareye uzanmadan.
  useEffect(() => {
    if (!buyuk) return;
    const bas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') kapat();
    };
    addEventListener('keydown', bas);
    return () => removeEventListener('keydown', bas);
  }, [buyuk, kapat]);

  if (!buyuk) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-ops-bg/95 flex items-center justify-center p-8"
      onClick={kapat}
    >
      <div
        className="relative bg-ops-sunken border border-ops-line2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-6 px-5 py-3 border-b border-ops-line">
          <span className="text-[18px] font-semibold text-ops-text">{buyuk.baslik}</span>
          <button
            onClick={kapat}
            aria-label="Kapat"
            title="Kapat (Esc)"
            className="shrink-0 w-9 h-9 flex items-center justify-center text-[20px] leading-none text-ops-dim border border-ops-line2 hover:text-ops-text hover:border-ops-dim transition-colors"
          >
            ✕
          </button>
        </div>
        {/* Buyutulmus gorunum daha yuksek cozunurlukte YENIDEN cizilir;
            olcekleme yapilmadigi icin metinler ve egriler keskin kalir. */}
        <XaiFigure
          scenarioId={buyuk.kanit.scenarioId}
          channels={buyuk.kanit.channels}
          level={buyuk.kanit.level}
          model={buyuk.kanit.model}
          scale={3}
          style={{ maxWidth: 'min(92vw, 2240px)', maxHeight: 'calc(88vh - 60px)' }}
          className="block object-contain"
        />
      </div>
    </div>
  );
}
