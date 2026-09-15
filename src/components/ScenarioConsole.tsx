import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConsole } from '../store';
import { NOMINAL_SCENARIO, SCENARIOS, SEVERITY_STEPS } from '../engine/scenarioRunner';
import { satByNorad } from '../engine/orbit';
import { arayuzOlcegi, portalHedefi } from './useModalKeys';

const SEVERITY_GLYPHS = ['▁', '▂', '▃', '▄', '▅'];

/** Aciklama kartinin genisligi ve pencere kenarindan birakacagi pay (olceksiz px). */
const KART_W = 340;
const KENAR_PAYI = 8;

interface Ipucu {
  ad: string;
  metin: string;
  model: string;
  /** Konumlar #root'un zoom'u oncesi (olceksiz) koordinattadir. */
  x: number;
  y: number;
}

/**
 * Senaryo aciklamasi dugmenin ICINDE degil, fareyle uzerine gelince yaninda
 * acilan kartta durur. Dugmelerde iki satirlik aciklama varken uc dugme ve
 * alttaki siddet blogu panele sigmiyor, siddet ayari alttan kirpiliyordu.
 *
 * Kart #root'a portal ile basilir (erisilebilirlik olcegini izler, panel
 * kirpmasina takilmaz). Ekran koordinatlari olcege bolunur; kart pencere
 * kenarina kelepcelenir.
 */
function AciklamaKarti({ ipucu }: { ipucu: Ipucu }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ust, setUst] = useState(ipucu.y);
  useLayoutEffect(() => {
    const olcek = arayuzOlcegi();
    const h = ref.current?.offsetHeight ?? 0;
    setUst(Math.max(KENAR_PAYI, Math.min(ipucu.y, window.innerHeight / olcek - h - KENAR_PAYI)));
  }, [ipucu]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-50 bg-ops-panel border border-ops-line2 shadow-2xl px-3 py-2 pointer-events-none"
      style={{ left: ipucu.x, top: ust, width: KART_W }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-ops-ai">{ipucu.ad}</span>
        <span className="num text-3xs text-ops-faint shrink-0">{ipucu.model}</span>
      </div>
      <div className="text-[11px] text-ops-dim leading-snug mt-1">{ipucu.metin}</div>
    </div>,
    portalHedefi(),
  );
}

export default function ScenarioConsole() {
  const sim = useConsole((s) => s.sim);
  const runScenario = useConsole((s) => s.runScenario);
  const backToNominal = useConsole((s) => s.backToNominal);
  const severityIndex = useConsole((s) => s.severityIndex);
  const setSeverity = useConsole((s) => s.setSeverity);
  const selectedNorad = useConsole((s) => s.selectedNorad);
  useConsole((s) => s.version);

  const active = sim.activeScenario;
  const progress = sim.scenarioProgress;
  // Enjeksiyon her zaman SECILI uyduya gider; hedef basligin sagi'nda yazar.
  const target = satByNorad(selectedNorad);
  const [ipucu, setIpucu] = useState<Ipucu | null>(null);

  const goster = (el: HTMLElement, ad: string, metin: string, model: string) => {
    const olcek = arayuzOlcegi();
    const r = el.getBoundingClientRect();
    const x = Math.min(r.right / olcek + 10, window.innerWidth / olcek - KART_W - KENAR_PAYI);
    setIpucu({ ad, metin, model, x, y: r.top / olcek });
  };

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Senaryo konsolu</span>
        <span className="normal-case tracking-normal text-ops-faint">
          hedef: <span className="text-ops-dim">{target.name}</span>
        </span>
      </div>
      {/* Dar panelde icerik kirpilmasin: sigmazsa kaydirilir (yazi kesilmez). */}
      <div className="p-2 flex flex-col gap-1 min-h-0 flex-1 overflow-y-auto">
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
              {/* Model adi basligin YANINDA degil ALTINDA: yan yana iken dar
                  panelde baslik iki satira kirilip kutudan tasiyordu. */}
              <div className="min-w-0">
                <div className={'text-[12px] leading-tight ' + (isActive ? 'text-ops-ai' : 'text-ops-text')}>{s.button}</div>
                <div className="num text-3xs text-ops-faint leading-[12px]">{s.model}</div>
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
                  'flex-1 num text-[13px] leading-none py-[3px] border transition-colors ' +
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
            className="w-full mt-1 text-[11px] py-[2px] border border-ops-line2 text-ops-dim hover:text-ops-text hover:border-ops-dim transition-colors"
          >
            {NOMINAL_SCENARIO.button}
          </button>
          {/* Kisayol listesi buradan kaldirildi; tam listesi Erisilebilirlik penceresinde. */}
        </div>
      </div>
      {ipucu && <AciklamaKarti ipucu={ipucu} />}
    </section>
  );
}
