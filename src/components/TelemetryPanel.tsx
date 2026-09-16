import { useConsole } from '../store';
import { PARAMETERS } from '../engine/mib';
import { WINDOW_S } from '../engine/simulation';
import { interestingPids } from '../engine/summary';
import type { MibParameter } from '../engine/types';
import TelemetryStrip, { ATTENTION_WINDOW_S } from './TelemetryStrip';

export default function TelemetryPanel() {
  const sim = useConsole((s) => s.sim);
  const summaryMode = useConsole((s) => s.summaryMode);
  useConsole((s) => s.version);

  const states = sim.snapshot().states;
  const missionT = sim.clock.missionT;

  // En son yuklenen XAI kaniti: en yuksek katkili kanallara dikkat penceresi.
  const latest = sim.xai.length ? sim.xai[sim.xai.length - 1] : null;
  const attentionFor = (pid: string): { win: [number, number]; rank: number } | null => {
    if (!latest) return null;
    const rank = latest.top_channels.indexOf(pid);
    if (rank < 0) return null;
    return { win: [latest.missionT - ATTENTION_WINDOW_S, latest.missionT], rank: rank + 1 };
  };

  const strip = (p: MibParameter) => (
    <TelemetryStrip
      key={p.pid}
      p={p}
      buf={sim.buffers.get(p.pid)!}
      state={states.get(p.pid) ?? 'NOMINAL'}
      missionT={missionT}
      attention={attentionFor(p.pid)?.win ?? null}
      attentionRank={attentionFor(p.pid)?.rank ?? 0}
      breakT={sim.structuralBreak && sim.structuralBreak.pid === p.pid ? sim.structuralBreak.breakT : null}
      compact={summaryMode}
    />
  );

  return (
    // min-h dusuk tutulur: dar ekranda seritler kendi icinde kayar, alttaki
    // INFO ve Durum panellerini ekranin disina itmez.
    <section className="panel flex flex-col flex-1 min-h-[150px]">
      <div className="panel-title flex items-center justify-between">
        <span>Telemetri şeritleri · TM[3,25] HK Parameter Report</span>
        <span className="ozet-gizle normal-case tracking-normal text-ops-faint">
          pencere {WINDOW_S / 60} dk · dikey çizgiler 60 s · ◆ yer türetilmiş
        </span>
      </div>
      {summaryMode ? <SummaryStrips strip={strip} pids={interestingPids(sim)} /> : (
        // Seritler kalan yuksekligi esit paylasir: mib.json'a parametre eklendiginde
        // duzen kendini ayarlar, sabit satir yuksekligi yuzunden kirpilma olmaz.
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">{PARAMETERS.map(strip)}</div>
      )}
    </section>
  );
}

/**
 * Ozet modu — istisna tabanli serit duzeni. Hicbir serit, bir baskasi
 * belirdigi ya da kayboldugu an yerinden oynamaz:
 *
 *   1. daraltma satiri (sabit yukseklik): gizlenen parametreler
 *   2. ilginc ham seritler, PARAMETERS sirasinda (sabit yukseklik)
 *   3. AI skor grubu, ALTA sabitli — ustune serit eklense de kaymaz
 */
function SummaryStrips({ strip, pids }: { strip: (p: MibParameter) => JSX.Element; pids: string[] }) {
  const shown = new Set(pids);
  const raw = PARAMETERS.filter((p) => !p.derived && shown.has(p.pid));
  const ai = PARAMETERS.filter((p) => p.derived);
  // Gizlenenler tanim geregi limit icindedir: limit disi olan her kanal ilginctir.
  const quiet = PARAMETERS.filter((p) => !p.derived && !shown.has(p.pid));

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="h-[24px] shrink-0 flex items-center gap-2 px-2 border-b border-ops-line text-3xs whitespace-nowrap overflow-hidden">
        {quiet.length > 0 ? (
          <>
            <span className="text-ops-nominal leading-none">●</span>
            <span className="text-ops-dim">
              <span className="num text-ops-text">{quiet.length}</span> parametre limit içinde — gizli:
            </span>
            <span className="num text-ops-faint truncate">{quiet.map((p) => p.pid).join(' · ')}</span>
          </>
        ) : (
          <span className="text-ops-dim">tüm ham parametreler gösteriliyor</span>
        )}
      </div>
      {raw.map(strip)}
      <div className="mt-auto flex flex-col">{ai.map(strip)}</div>
    </div>
  );
}
