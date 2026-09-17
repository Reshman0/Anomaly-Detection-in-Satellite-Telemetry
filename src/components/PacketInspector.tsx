import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useConsole } from '../store';
import { apidLabel } from '../engine/mib';
import { crc16Ccitt, type BuiltPacket } from '../engine/packetBuilder';
import { buildCadu, buildTmFrame, packetView, type ByteRegion, type Framed, type RegionKind } from '../engine/frameBuilder';

/**
 * Paket denetleyici — telemetri ile INFO arasindaki seritten (ya da P tusuyla)
 * acilan pencere.
 * Surekli yer kaplamasi yerine istendiginde acilir; boylece kure ve INFO paneli
 * ana ekranda daha genis yer bulur.
 *
 *   PACKET  CCSDS 133.0-B Space Packet + PUS-C
 *   FRAME   CCSDS 132.0-B TM Transfer Frame (baslik, veri alani, OCF, FECF)
 *   CADU    CCSDS 131.0-B ASM + RS(255,223) I=5 kodblogu
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

/**
 * Telemetri seritleri ile INFO paneli arasindaki ince acma seridi. Kapaliyken
 * bile son paketin etiketini, APID/sekansini ve oktet dizisini gosterir;
 * tiklaninca tam denetleyici penceresi acilir.
 */
/** Serit onizlemesi: ilk 6 oktet ve kalan oktet sayisi. */
function onIlkOktet(hex: string, adet = 6): string {
  const parcalar = hex.split(' ').filter(Boolean);
  const bas = parcalar.slice(0, adet).join(' ');
  const kalan = parcalar.length - adet;
  return kalan > 0 ? bas + '  · +' + kalan + ' oktet' : bas;
}

export function PacketInspectorBar() {
  const sim = useConsole((s) => s.sim);
  const open = useConsole((s) => s.packetOpen);
  const setOpen = useConsole((s) => s.setPacketOpen);
  useConsole((s) => s.version);
  const pkt = sim.packets[sim.packets.length - 1];
  const counts = Array.from(sim.serviceCounts.entries()).sort();
  // Packet Error Control dogrulamasi: son iki oktet CRC-16-CCITT, ustu kapsam (ECSS-E-ST-70-41C §7.4.4).
  const pecOk = pkt ? crc16Ccitt(pkt.bytes.subarray(0, pkt.bytes.length - 2)) === ((pkt.bytes[pkt.bytes.length - 2] << 8) | pkt.bytes[pkt.bytes.length - 1]) : null;

  return (
    <button
      data-tour="paket"
      onClick={() => setOpen(!open)}
      aria-label="Paket denetleyici penceresini aç"
      title="CCSDS paket / çerçeve / CADU denetleyicisini aç (P)"
      className={
        // Sigmayan parcalar alt satira sarar: yuksek arayuz olceginde de hicbiri kirpilmaz.
        'panel shrink-0 min-h-[26px] flex flex-wrap items-center gap-x-3 px-2 py-[2px] text-left transition-colors ' +
        (open ? 'border-ops-text bg-ops-sunken' : 'hover:bg-white/[0.035]')
      }
    >
      <span className="text-3xs uppercase tracking-[0.16em] text-ops-faint shrink-0">Paket denetleyici</span>
      {pkt ? (
        <>
          <span className="num text-[11px] text-ops-nominal shrink-0">{pkt.label}</span>
          <span className="num text-3xs text-ops-faint shrink-0">
            APID {pkt.apid} · SEQ {pkt.sequenceCount} · {pkt.bytes.length} oktet
          </span>
          <span className={'num text-3xs shrink-0 ' + (pecOk ? 'text-ops-nominal' : 'text-ops-hard')} title="Packet Error Control: CRC-16-CCITT yeniden hesaplandı">
            PEC {pecOk ? 'OK' : 'HATA'}
          </span>
          {/* Serit dar: tam dokum pencerede. Burada ilk oktetler ve kalan sayisi
              yazilir, yazi "..." ile yarida kesilmez. */}
          <span className="num text-3xs text-ops-dim shrink-0">{onIlkOktet(pkt.hex)}</span>
        </>
      ) : (
        <span className="text-3xs text-ops-faint flex-1">paket bekleniyor…</span>
      )}
      {/* Servis sayaclari dar seritte gizlenir (pencerede tam listesi var): serit tek satir, kirpilmadan. */}
      <span className="num text-3xs text-ops-faint shrink-0">{counts.map(([k, v]) => 'TM[' + k + ']:' + v).join('  ')}</span>
      <span className="flex-1 min-w-[4px]" />
      <span className={'text-2xs tracking-[0.12em] shrink-0 ' + (open ? 'text-ops-text' : 'text-ops-nominal')}>
        {open ? '▾ AÇIK' : '▸ AÇ  ·  P'}
      </span>
    </button>
  );
}

export default function PacketInspector() {
  const sim = useConsole((s) => s.sim);
  const open = useConsole((s) => s.packetOpen);
  const setOpen = useConsole((s) => s.setPacketOpen);
  useConsole((s) => s.version);
  const [tab, setTab] = useState<Tab>('PACKET');
  // DONDUR: goruntulenen paket sabitlenir, akis arka planda surer (hex okunurken kaymasin).
  const [frozen, setFrozen] = useState(false);
  const frozenRef = useRef<{ pkt: BuiltPacket; index: number } | null>(null);

  // Uydu degisince dondurulmus cerceve cozulur: eski paket yeni uydunun
  // cerceve sayacina yamanmasin.
  useEffect(() => {
    setFrozen(false);
    frozenRef.current = null;
  }, [sim]);

  const live = sim.packets[sim.packets.length - 1];
  if (frozen && !frozenRef.current && live) frozenRef.current = { pkt: live, index: sim.packetCount };
  if (!frozen) frozenRef.current = null;
  const pkt = frozen && frozenRef.current ? frozenRef.current.pkt : live;
  const frameIndex = frozen && frozenRef.current ? frozenRef.current.index : sim.packetCount;

  const view = useMemo<Framed | null>(() => {
    if (!pkt || !open) return null;
    if (tab === 'PACKET') return packetView(pkt);
    const frame = buildTmFrame(pkt, frameIndex);
    return tab === 'FRAME' ? frame : buildCadu(frame);
  }, [pkt, tab, frameIndex, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const counts = Array.from(sim.serviceCounts.entries()).sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paket denetleyici"
        onClick={(e) => e.stopPropagation()}
        className="card-in w-[1220px] max-w-[calc(95vw/var(--ui-scale,1))] h-[calc(70vh/var(--ui-scale,1))] bg-ops-panel border border-ops-line2 shadow-2xl flex flex-col"
      >
        <div className="panel-title flex items-center justify-between">
          <span>Paket denetleyici · CCSDS</span>
          <span className="normal-case tracking-normal text-ops-faint num flex items-center gap-3">
            <span>
              {counts.map(([k, v]) => 'TM[' + k + ']:' + v).join('  ')} · toplam {sim.packetCount}
            </span>
            <button onClick={() => setOpen(false)} className="text-ops-dim hover:text-ops-text text-[13px] leading-none px-1" title="Kapat (Esc)">
              ✕
            </button>
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
            <button
              onClick={() => setFrozen((f) => !f)}
              aria-pressed={frozen}
              title="Görüntülenen paketi sabitle; akış arka planda sürer"
              className={
                'num text-2xs px-[8px] py-[2px] border tracking-[0.08em] ml-2 ' +
                (frozen ? 'border-ops-soft text-ops-soft bg-ops-soft/10' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
              }
            >
              {frozen ? '■ DONDURULDU' : '▶ CANLI'}
            </button>
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

        <div className="px-3 py-2 border-t border-ops-line2 text-3xs text-ops-faint">
          Esc ya da dışına tıklama kapatır · P tuşu açar/kapatır
        </div>
      </div>
    </div>
  );
}
