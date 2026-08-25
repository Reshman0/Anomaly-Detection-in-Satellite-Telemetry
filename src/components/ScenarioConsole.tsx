import { useConsole } from '../store';
import { NOMINAL_SCENARIO, SCENARIOS, SEVERITY_STEPS } from '../engine/scenarioRunner';

const SEVERITY_GLYPHS = ['▁', '▂', '▃', '▄', '▅'];

export default function ScenarioConsole() {
  const sim = useConsole((s) => s.sim);
  const runScenario = useConsole((s) => s.runScenario);
  const backToNominal = useConsole((s) => s.backToNominal);
  const severityIndex = useConsole((s) => s.severityIndex);
  const setSeverity = useConsole((s) => s.setSeverity);
  useConsole((s) => s.version);

  const active = sim.activeScenario;
  const progress = sim.scenarioProgress;

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title">Senaryo konsolu</div>
      <div className="p-2 flex flex-col gap-1.5 min-h-0">
        {SCENARIOS.map((s) => {
          const isActive = active?.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => runScenario(s)}
              aria-label={s.button}
              className={
                'text-left px-2 py-1.5 border transition-colors ' +
                (isActive
                  ? 'border-ops-ai bg-ops-ai/10'
                  : 'border-ops-line2 hover:border-ops-dim hover:bg-white/[0.02]')
              }
            >
              <div className="flex items-center justify-between">
                <span className={'text-[12px] ' + (isActive ? 'text-ops-ai' : 'text-ops-text')}>{s.button}</span>
                <span className="num text-3xs text-ops-faint">{s.model}</span>
              </div>
              <div className="text-3xs text-ops-faint mt-[2px] leading-snug line-clamp-2">{s.description}</div>
              {isActive && (
                <div className="h-[2px] bg-ops-line2 mt-1.5">
                  <div className="h-full bg-ops-ai" style={{ width: (progress * 100).toFixed(1) + '%' }} />
                </div>
              )}
            </button>
          );
        })}

        <div className="mt-auto pt-1.5 border-t border-ops-line">
          <div className="flex items-center justify-between">
            <span className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Şiddet</span>
            <span className="num text-3xs text-ops-dim">×{SEVERITY_STEPS[severityIndex].toFixed(2)}</span>
          </div>
          <div className="flex items-end gap-1 mt-1">
            {SEVERITY_GLYPHS.map((gl, i) => (
              <button
                key={i}
                onClick={() => setSeverity(i)}
                title={'şiddet ×' + SEVERITY_STEPS[i]}
                className={
                  'flex-1 num text-[15px] leading-none py-[2px] border transition-colors ' +
                  (i === severityIndex
                    ? 'border-ops-ai text-ops-ai bg-ops-ai/10'
                    : 'border-ops-line2 text-ops-faint hover:text-ops-dim')
                }
              >
                {gl}
              </button>
            ))}
          </div>
          <button
            onClick={backToNominal}
            className="w-full mt-1.5 text-[11px] py-1 border border-ops-line2 text-ops-dim hover:text-ops-text hover:border-ops-dim transition-colors"
          >
            {NOMINAL_SCENARIO.button}
          </button>
        </div>
      </div>
    </section>
  );
}
