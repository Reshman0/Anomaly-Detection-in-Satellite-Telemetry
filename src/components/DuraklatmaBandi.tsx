import { useConsole } from '../store';

/**
 * Akis duraklatildiginda beliren devam bandi.
 *
 * Ust seride konulamadi: serit dokuz alanla dolu ve boyle bir dugme onu ~60 px
 * genisletip seridi sikistiriyordu. Burasi hem yer
 * sikintisi cekmiyor hem de sunucunun ve izleyicinin bakisinin zaten oldugu
 * yere yakin: telemetri ile senaryo konsolunun arasi.
 *
 * Tasarim yuzeyinin icinde, ama hicbir panelin icinde degil — paneller
 * `overflow: hidden` oldugu icin icine konsa kirpilirdi.
 *
 * Dikey konum: durum bandinin hemen USTUNDE durur (paket panelinin uzerine
 * biner). Durum bandi demonun en degerli paneli — NOMINAL / ALARM kontrasti
 * orada — ve ustune bir sey binmemeli; paket paneli ise sahnede okunmuyor.
 * 470 px, 900 px'lik tasarim yuzeyinde durum bandinin ust kenarinin (438)
 * biraz uzerine denk gelir.
 */
export default function DuraklatmaBandi() {
  const durduruldu = useConsole((s) => s.durduruldu);
  const devamEt = useConsole((s) => s.devamEt);
  if (!durduruldu) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[470px] z-40">
      <button
        onClick={devamEt}
        title="Akışa devam et"
        className="flex items-center gap-4 px-7 py-3 bg-ops-sunken border-2 border-ops-ai shadow-xl hover:bg-ops-aiDim transition-colors"
      >
        <span className="text-ops-ai text-[24px] leading-none">▶</span>
        <span className="text-[22px] font-semibold text-ops-ai leading-none whitespace-nowrap">
          AKIŞ DURAKLATILDI
        </span>
        <span className="text-[18px] text-ops-text leading-none whitespace-nowrap">
          devam etmek için tıklayın
        </span>
      </button>
    </div>
  );
}
