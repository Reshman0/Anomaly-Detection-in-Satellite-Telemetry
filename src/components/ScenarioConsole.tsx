import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConsole } from '../store';
import { NOMINAL_SCENARIO, SCENARIOS, SEVERITY_STEPS } from '../engine/scenarioRunner';

const SEVERITY_GLYPHS = ['▁', '▂', '▃', '▄', '▅'];

/** Aciklama kartinin pencere kenarlarindan birakacagi en az bosluk (px). */
const KENAR_PAYI = 8;

interface Ipucu {
  ad: string;
  metin: string;
  model: string;
  x: number;
  y: number;
}

/**
 * Senaryo aciklamasi dugmenin ICINDE degil, fareyle uzerine gelince yaninda
 * acilan kartta durur. Dugmelerde iki satirlik aciklama varken uc dugme ve
 * alttaki siddet blogu ~290 px istiyordu, panel ~208 px veriyordu: siddet
 * ayari tamamen kirpiliyordu. Kart document.body'ye portal ile basilir ki
 * panelin kirpmasina takilmasin, pencere kenarina da kelepcelenir.
 */
function AciklamaKarti({ ipucu }: { ipucu: Ipucu }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ust, setUst] = useState(ipucu.y);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setUst(Math.max(KENAR_PAYI, Math.min(ipucu.y, window.innerHeight - h - KENAR_PAYI)));
  }, [ipucu]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-50 w-[380px] bg-ops-sunken border border-ops-line2 px-4 py-3 shadow-xl pointer-events-none"
      style={{ left: ipucu.x, top: ust }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-ops-ai">{ipucu.ad}</span>
        <span className="num text-3xs text-ops-faint shrink-0">{ipucu.model}</span>
      </div>
      <div className="text-[13px] text-ops-text leading-relaxed mt-1.5">{ipucu.metin}</div>
    </div>,
    document.body,
  );
}

export default function ScenarioConsole() {
  const sim = useConsole((s) => s.sim);
  const runScenario = useConsole((s) => s.runScenario);
  const backToNominal = useConsole((s) => s.backToNominal);
  const severityIndex = useConsole((s) => s.severityIndex);
  const setSeverity = useConsole((s) => s.setSeverity);
  useConsole((s) => s.version);

  const active = sim.activeScenario;
  const progress = sim.scenarioProgress;
  const [ipucu, setIpucu] = useState<Ipucu | null>(null);

  const goster = (el: HTMLElement, ad: string, metin: string, model: string) => {
    const r = el.getBoundingClientRect();
    setIpucu({ ad, metin, model, x: Math.min(r.right + 10, window.innerWidth - 380 - KENAR_PAYI), y: r.top });
  };

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
              onMouseEnter={(e) => goster(e.currentTarget, s.button, s.description, s.model)}
              onMouseLeave={() => setIpucu(null)}
              onFocus={(e) => goster(e.currentTarget, s.button, s.description, s.model)}
              onBlur={() => setIpucu(null)}
              aria-label={s.button}
              aria-description={s.description}
              className={
                'text-left px-2 py-1 border transition-colors ' +
                (isActive
                  ? 'border-ops-ai bg-ops-ai/10'
                  : 'border-ops-line2 hover:border-ops-dim hover:bg-white/[0.02]')
              }
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className={'text-[12px] font-semibold truncate ' + (isActive ? 'text-ops-ai' : 'text-ops-text')}>{s.button}</span>
                <span className="num text-3xs text-ops-faint shrink-0">{s.model}</span>
              </div>
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
            className="w-full mt-1 text-[11px] py-1 border border-ops-line2 text-ops-dim hover:text-ops-text hover:border-ops-dim transition-colors"
          >
            {NOMINAL_SCENARIO.button}
          </button>
          {/* Tek satir: iki satira kirildiginda yarisi panelin altindan kirpiliyordu. */}
          <div
            className="num text-3xs text-ops-faint mt-1 text-center tracking-wide truncate"
            title="1 2 3 senaryo · N nominal · L T küre · F takip · 0 hız 1×"
          >
            1 2 3 senaryo · N nominal · L T küre · F takip · 0 hız 1×
          </div>
        </div>
      </div>
      {ipucu && <AciklamaKarti ipucu={ipucu} />}
    </section>
  );
}
