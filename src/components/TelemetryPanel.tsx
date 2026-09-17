import { useConsole } from '../store';
import { PARAMETERS } from '../engine/mib';
import { WINDOW_S } from '../engine/simulation';
import TelemetryStrip, { ATTENTION_WINDOW_S } from './TelemetryStrip';

export default function TelemetryPanel() {
  const sim = useConsole((s) => s.sim);
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

  // 1920x1080'de 8 serit x ~56 px tam sigar. Daha kisa pencerelerde once paket
  // denetleyici daralir (o esneyebilir); yine yetmezse serit kutusu kaydirir.
  return (
    // min-h dusuk tutulur: dar ekranda seritler kendi icinde kayar, alttaki
    // INFO ve Durum panellerini ekranin disina itmez.
    <section data-tour="telemetri" className="panel flex flex-col flex-1 min-h-[150px]">
      <div className="panel-title flex items-center justify-between">
        <span>Telemetri şeritleri · TM[3,25] HK Parameter Report</span>
        <span className="normal-case tracking-normal text-ops-faint">
          pencere {WINDOW_S / 60} dk · dikey çizgiler 60 s · ◆ yer türetilmiş
        </span>
      </div>
      {/* Seritler kalan yuksekligi esit paylasir: mib.json'a parametre eklendiginde
          duzen kendini ayarlar, sabit satir yuksekligi yuzunden kirpilma olmaz. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        {PARAMETERS.map((p) => (
          <TelemetryStrip
            key={p.pid}
            p={p}
            buf={sim.buffers.get(p.pid)!}
            state={states.get(p.pid) ?? 'NOMINAL'}
            missionT={missionT}
            attention={attentionFor(p.pid)?.win ?? null}
            attentionRank={attentionFor(p.pid)?.rank ?? 0}
            breakT={sim.structuralBreak && sim.structuralBreak.pid === p.pid ? sim.structuralBreak.breakT : null}
          />
        ))}
      </div>
    </section>
  );
}
