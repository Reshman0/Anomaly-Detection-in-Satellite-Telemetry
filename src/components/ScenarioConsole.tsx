import { useLayoutEffect, useRef, useState } from 'react';
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

  /*
   * Aciklamalar dugmenin icinde iki satira kirpiliyordu ("..." ile kesiliyordu).
   * Artik dugmede yok; fare dugmenin uzerine gelince YANDA, daha buyuk puntoyla
   * bir kartta beliriyor, fare cekilince kayboluyor.
   *
   * Kart `position: fixed` ile cizilir. Sebep: `.panel` sinifinda yapisal bir
   * `overflow: hidden` var (paneller birbirinin uzerine tasamasin diye) ve
   * `absolute` bir kart panelin disina cikamadan kirpiliyordu. Sabit
   * konumlandirilmis oge, donusum uygulanmis tasarim yuzeyini kapsayan blok
   * olarak alir; yani hem panelin kirpmasindan kurtulur hem de yuzeyle birlikte
   * olceklenir. Koordinatlar bu yuzden yuzey birimine cevrilir.
   */
  const [ipucu, setIpucu] = useState<{ ad: string; metin: string; x: number; y: number } | null>(
    null,
  );

  /** Dugmenin sag ust kosesini tasarim yuzeyi birimine cevirir. */
  function ipucuKonumu(el: HTMLElement): { x: number; y: number } {
    const yuzey = document.getElementById('yuzey');
    const b = el.getBoundingClientRect();
    if (!yuzey) return { x: b.right, y: b.top };
    const y = yuzey.getBoundingClientRect();
    const olcek = y.width / yuzey.offsetWidth || 1;
    return { x: (b.right - y.left) / olcek + 10, y: (b.top - y.top) / olcek };
  }

  /*
   * Kart, dugmenin ustune hizalanir; ama en alttaki dugmede uzun bir aciklama
   * yuzeyin altindan tasiyordu (olculdu: kolektif senaryoda 42 px). Kart
   * ciziltikten sonra yuksekligi olculur ve yuzeyin icine kelepcelenir.
   * `useLayoutEffect` boyamadan once calisir, yani ziplama gorunmez.
   */
  const kartRef = useRef<HTMLDivElement>(null);
  const [kartUst, setKartUst] = useState(0);

  useLayoutEffect(() => {
    const kart = kartRef.current;
    const yuzey = document.getElementById('yuzey');
    if (!ipucu || !kart || !yuzey) return;
    const olcek = yuzey.getBoundingClientRect().width / yuzey.offsetWidth || 1;
    const yukseklik = kart.getBoundingClientRect().height / olcek;
    const PAY = 12;
    const enFazla = yuzey.offsetHeight - yukseklik - PAY;
    setKartUst(Math.max(PAY, Math.min(ipucu.y, enFazla)));
  }, [ipucu]);

  return (
    <section className="panel flex flex-col min-h-0 relative">
      <div className="panel-title">Senaryo konsolu</div>

      {ipucu && (
        <div
          ref={kartRef}
          className="fixed z-50 w-[440px] bg-ops-sunken border border-ops-ai/60 px-4 py-3 shadow-xl pointer-events-none"
          style={{ left: ipucu.x, top: kartUst }}
        >
          <div className="text-[15px] font-semibold text-ops-ai leading-snug">{ipucu.ad}</div>
          <div className="text-[15px] text-ops-text leading-relaxed mt-1.5">{ipucu.metin}</div>
        </div>
      )}
      {/*
        flex-1 + min-h-0: icerik panelin kalan yuksekligine kelepcelenir.
        Bu olmadan blok panelin altindan tasar, sasma kaydiricisi ve nominale
        donus dugmesi 1080 px ekranin disinda kalirdi (bkz. §10 kabul kriteri).
      */}
      <div className="flex-1 min-h-0 p-2 flex flex-col gap-1">
        {SCENARIOS.map((s) => {
          const isActive = active?.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => runScenario(s)}
              onMouseEnter={(e) =>
                setIpucu({ ad: s.button, metin: s.description, ...ipucuKonumu(e.currentTarget) })
              }
              onMouseLeave={() => setIpucu(null)}
              aria-label={s.button}
              className={
                'shrink-0 text-left px-3 py-2 border transition-colors ' +
                (isActive
                  ? 'border-ops-ai bg-ops-ai/10'
                  : 'border-ops-line2 hover:border-ops-ai hover:bg-white/[0.03]')
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={
                    'text-[15px] font-semibold leading-tight ' +
                    (isActive ? 'text-ops-ai' : 'text-ops-text')
                  }
                >
                  {s.button}
                </span>
                <span className="num text-3xs text-ops-faint shrink-0">{s.model}</span>
              </div>
              {isActive && (
                <div className="h-[3px] bg-ops-line2 mt-2">
                  <div className="h-full bg-ops-ai" style={{ width: (progress * 100).toFixed(1) + '%' }} />
                </div>
              )}
            </button>
          );
        })}

        <div className="mt-auto shrink-0 pt-1 border-t border-ops-line">
          <div className="flex items-center justify-between">
            <span className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Şiddet</span>
            <span className="num text-3xs text-ops-dim">×{SEVERITY_STEPS[severityIndex].toFixed(2)}</span>
          </div>
          {/* Kaydirici ve nominale donus tek satirda — panel yuksekligi sinirli. */}
          <div className="flex items-stretch gap-1 mt-1">
            <div className="flex-1 flex items-stretch gap-1">
              {SEVERITY_GLYPHS.map((gl, i) => (
                <button
                  key={i}
                  onClick={() => setSeverity(i)}
                  title={'şiddet ×' + SEVERITY_STEPS[i]}
                  className={
                    'flex-1 num text-[14px] leading-none py-[3px] border transition-colors ' +
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
              className="shrink-0 px-2 text-[10px] leading-none border border-ops-line2 text-ops-dim hover:text-ops-text hover:border-ops-dim transition-colors"
            >
              {NOMINAL_SCENARIO.button}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

