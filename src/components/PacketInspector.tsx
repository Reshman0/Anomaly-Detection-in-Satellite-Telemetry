import { memo, useMemo, useState } from 'react';
import { useConsole } from '../store';
import { apidLabel } from '../engine/mib';
import { buildCadu, buildTmFrame, packetView, type ByteRegion, type Framed, type RegionKind } from '../engine/frameBuilder';

/**
 * Paket denetleyici — uc katman:
 *   PACKET  CCSDS 133.0-B Space Packet + PUS-C
 *   FRAME   CCSDS 132.0-B TM Transfer Frame (baslik, veri alani, OCF, FECF)
 *   CADU    CCSDS 131.0-B ASM + RS(255,223) I=5 kodblogu
 *
 * Sol: bolge lejandi (renk, ad, ozet, oktet araligi). Sag: renkli hex dokumu.
 */

type Tab = 'CADU' | 'FRAME' | 'PACKET';

const REGION_STYLE: Record<RegionKind, { swatch: string; text: string; bg: string }> = {
  primary: { swatch: 'bg-[#6E8BF5]', text: 'text-[#9FB2FF]', bg: 'bg-[#6E8BF5]/[0.16]' },
  asm: { swatch: 'bg-[#6E8BF5]', text: 'text-[#9FB2FF]', bg: 'bg-[#6E8BF5]/[0.16]' },
  secondary: { swatch: 'bg-ops-soft', text: 'text-ops-soft', bg: 'bg-ops-soft/[0.16]' },
  ocf: { swatch: 'bg-ops-soft', text: 'text-ops-soft', bg: 'bg-ops-soft/[0.16]' },
  data: { swatch: 'bg-ops-nominal', text: 'text-ops-nominal', bg: 'bg-ops-nominal/[0.16]' },
  codeblock: { swatch: 'bg-ops-nominal', text: 'text-ops-nominal', bg: 'bg-ops-nominal/[0.16]' },
  trailer: { swatch: 'bg-ops-hard', text: 'text-ops-hard', bg: 'bg-ops-hard/[0.18]' },
};

function regionAt(regions: ByteRegion[], i: number): ByteRegion | undefined {
  for (const r of regions) if (i >= r.start && i <= r.end) return r;
  return undefined;
}

/** Bin baytlik dokum; yalnizca gorunum degisince yeniden kurulur. */
const HexDump = memo(function HexDump({ view }: { view: Framed }) {
  const rows: number[] = [];
  for (let off = 0; off < view.bytes.length; off += 16) rows.push(off);
  return (
    <div className="num text-[11px] leading-[17px]">
      {rows.map((off) => (
        <div key={off} className="flex items-center gap-[3px]">
          <span className="w-[34px] shrink-0 text-ops-faint">{off.toString(16).toUpperCase().padStart(4, '0')}</span>
          {Array.from({ length: Math.min(16, view.bytes.length - off) }, (_, k) => {
            const i = off + k;
            const r = regionAt(view.regions, i);
            const st = r ? REGION_STYLE[r.kind] : REGION_STYLE.data;
            return (
              <span
                key={i}
                title={(r ? r.name + ' · ' : '') + 'oktet ' + i}
                className={'inline-block w-[22px] text-center rounded-[2px] ' + st.text + ' ' + st.bg + (k === 8 ? ' ml-[6px]' : '')}
              >
                {view.bytes[i].toString(16).toUpperCase().padStart(2, '0')}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
});

export default function PacketInspector() {
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);
  const [tab, setTab] = useState<Tab>('PACKET');

  const pkt = sim.packets[sim.packets.length - 1];
  const frameIndex = sim.packetCount;

  const view = useMemo<Framed | null>(() => {
    if (!pkt) return null;
    if (tab === 'PACKET') return packetView(pkt);
    const frame = buildTmFrame(pkt, frameIndex);
    return tab === 'FRAME' ? frame : buildCadu(frame);
  }, [pkt, tab, frameIndex]);

  const counts = Array.from(sim.serviceCounts.entries()).sort();

  return (
    <section className="panel flex flex-col flex-1 min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Paket denetleyici</span>
        <span className="normal-case tracking-normal text-ops-faint num">
          {counts.map(([k, v]) => 'TM[' + k + ']:' + v).join('  ')} · toplam {sim.packetCount}
        </span>
      </div>

      <div className="flex items-center justify-between px-2 py-1 border-b border-ops-line">
        <div className="flex gap-[3px]">
          {(['CADU', 'FRAME', 'PACKET'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'num text-2xs px-[8px] py-[2px] border transition-colors tracking-[0.08em] ' +
                (tab === t ? 'border-ops-text text-ops-text bg-ops-sunken' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
              }
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-3xs text-ops-faint num">{view?.headline ?? '—'}</span>
      </div>

      {view && pkt ? (
        <div className="flex-1 min-h-0 flex">
          <div className="w-[300px] shrink-0 border-r border-ops-line px-2 py-1.5 overflow-y-auto flex flex-col">
            {view.regions.map((r) => {
              const st = REGION_STYLE[r.kind];
              return (
                <div key={r.kind + r.start} className="mb-[7px]">
                  <div className="flex items-center gap-1.5">
                    <span className={'inline-block w-[8px] h-[8px] ' + st.swatch} />
                    <span className="text-[11px] text-ops-text leading-tight">{r.name}</span>
                  </div>
                  <div className="num text-3xs ml-[14px] leading-tight text-ops-dim">{r.detail}</div>
                  <div className="num text-3xs ml-[14px] text-ops-faint leading-tight">
                    oktet {r.start}–{r.end}
                  </div>
                </div>
              );
            })}
            <div className="mt-auto num text-3xs text-ops-faint pt-1 border-t border-ops-line">
              {view.footer ?? pkt.label + ' · APID ' + pkt.apid + ' · ' + apidLabel(pkt.apid)}
            </div>
          </div>

          <div className="flex-1 min-w-0 px-2 py-1.5 overflow-auto">
            <HexDump view={view} />
          </div>
        </div>
      ) : (
        <div className="px-2 py-3 text-[11px] text-ops-faint">Paket bekleniyor…</div>
      )}
    </section>
  );
}
