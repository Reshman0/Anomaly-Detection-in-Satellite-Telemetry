import { useConsole } from '../store';
import { apidLabel } from '../engine/mib';

/**
 * Son uretilen paketin ham oktet dizisi ve okunabilir ozeti.
 *
 * Paket gercek CCSDS 133.0-B / PUS-C yapisiyla uretilir (bkz. packetBuilder);
 * ancak bit alani izgarasi kisa sureli bir gosterimde okunamayacak kadar
 * yogundu ve jargonla doluydu. Bu yuzden ekranda ham oktetler (gercek oldugu
 * hissini veren kisim) ve duz Turkce bir ozet kalir; bit alanlarinin tamami
 * `pkt.fields` icinde uretilmeye devam eder ve birim testleriyle dogrulanir.
 */
export default function PacketInspector() {
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);

  const pkt = sim.packets[sim.packets.length - 1];

  return (
    <section className="panel shrink-0">
      <div className="panel-title flex items-center justify-between">
        <span>Aşağı inen veri paketi</span>
        <span className="normal-case tracking-normal text-ops-faint num">
          bu oturumda {sim.packetCount.toLocaleString('tr-TR')} paket alındı
        </span>
      </div>
      {pkt ? (
        <div className="px-2 py-1">
          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-[12px] text-ops-nominal">{apidLabel(pkt.apid)}</span>
            <span className="text-[11px] text-ops-dim">
              sıra no <span className="num">{pkt.sequenceCount}</span>
            </span>
            <span className="text-[11px] text-ops-dim">
              <span className="num">{pkt.bytes.length}</span> bayt
            </span>
            <span className="text-[11px] text-ops-nominal">bütünlük doğrulandı ✓</span>
          </div>
          {/* Yukseklik telemetri seritlerine yer acmak icin kisildi: bu panel
              sahnede okunmaz, varligi yeterlidir. */}
          <div className="num text-[11px] text-ops-dim leading-[1.35] break-all h-[18px] overflow-hidden">
            {pkt.hex}
          </div>
          <div className="text-3xs text-ops-faint mt-1 leading-snug truncate">
            Uydudan inen ham baytları gösterir. Paket yapısı CCSDS standardına uyar.
          </div>
        </div>
      ) : (
        <div className="px-2 py-3 text-[11px] text-ops-faint">Paket bekleniyor…</div>
      )}
    </section>
  );
}
