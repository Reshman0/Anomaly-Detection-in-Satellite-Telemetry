import { useConsole } from '../store';
import { apidLabel } from '../engine/mib';

/**
 * Son uretilen paketin gercek bit alanlari ve oktet dizisi (yonerge §4).
 * Alan listesi dogrudan packetBuilder ciktisindan gelir.
 */
export default function PacketInspector() {
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);

  const pkt = sim.packets[sim.packets.length - 1];
  const counts = Array.from(sim.serviceCounts.entries()).sort();

  return (
    <section className="panel shrink-0">
      <div className="panel-title flex items-center justify-between">
        <span>Paket denetleyici · CCSDS 133.0-B / PUS-C</span>
        <span className="normal-case tracking-normal text-ops-faint num">
          {counts.map(([k, v]) => 'TM[' + k + ']:' + v).join('  ')} · toplam {sim.packetCount}
        </span>
      </div>
      {pkt ? (
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-3 mb-1">
            <span className="num text-[13px] text-ops-nominal">{pkt.label}</span>
            <span className="text-[11px] text-ops-dim">
              APID {pkt.apid} · {apidLabel(pkt.apid)}
            </span>
            <span className="text-[11px] text-ops-faint num">
              SEQ {pkt.sequenceCount} · MTC {pkt.messageTypeCounter} · LEN {pkt.dataLength} · {pkt.bytes.length} oktet
            </span>
          </div>
          <div className="num text-[11px] text-ops-dim leading-[1.35] break-all h-[30px] overflow-hidden">
            {pkt.hex}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-[3px] mt-1 h-[38px] overflow-hidden">
            {pkt.fields.map((f, i) => (
              <span
                key={i}
                className={
                  'text-3xs border px-1 py-[1px] leading-none ' +
                  (f.group === 'primary'
                    ? 'border-ops-line2 text-ops-dim'
                    : f.group === 'secondary'
                      ? 'border-ops-nominal/30 text-ops-nominal/80'
                      : f.group === 'data'
                        ? 'border-ops-ai/30 text-ops-ai/80'
                        : 'border-ops-soft/30 text-ops-soft/80')
                }
              >
                {f.name}
                {f.bits > 0 && <span className="text-ops-faint"> /{f.bits}b</span>}
                <span className="num ml-1">{f.binary ?? f.value}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-2 py-3 text-[11px] text-ops-faint">Paket bekleniyor…</div>
      )}
    </section>
  );
}
