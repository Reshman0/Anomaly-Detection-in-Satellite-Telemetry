import { useEffect, useRef } from 'react';
import { useConsole } from '../store';
import { drawAttribution, drawResidual, drawSpectrogram, summarize } from '../ui/xaiRender';
import type { XaiEvidence } from '../engine/types';

/**
 * XAI paneli — uc seviyeli sekme. Her seviye farkli bir soruya cevap verir:
 *   1 Artik      NE ZAMAN?      AI skoru, esik gecisleri, ST[12]'ye onculuk
 *   2 Katki      HANGI KANAL?   isaretli kanal katkilari
 *   3 Grad-CAM   HANGI FREKANS? zaman x frekans spektrogrami, kanit bandi
 *
 * Oncelik: `src/assets/xai/` altinda gercek PNG varsa o gosterilir; yoksa
 * konsolun kendi telemetrisinden hesaplanan cizim (ui/xaiRender.ts).
 */
const ASSETS = import.meta.glob('../assets/xai/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function assetUrl(rel: string): string | null {
  const name = rel.replace(/^xai\//, '');
  const key = Object.keys(ASSETS).find((k) => k.endsWith('/' + name));
  return key ? ASSETS[key] : null;
}

const LEVELS: Record<1 | 2 | 3, { title: string; question: string }> = {
  1: { title: 'Artık', question: 'ne zaman?' },
  2: { title: 'Kanal katkısı', question: 'hangi kanal?' },
  3: { title: 'Grad-CAM', question: 'hangi frekans?' },
};

function SyntheticFigure({ ev }: { ev: XaiEvidence }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sim = useConsole((s) => s.sim);
  const version = useConsole((s) => s.version);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (ev.level === 1) drawResidual(cv, sim.buffers, ev, sim.alarms);
    else if (ev.level === 2) drawAttribution(cv, sim.buffers, ev);
    else drawSpectrogram(cv, sim.buffers, ev);
  }, [ev, sim, Math.floor(version / 8)]);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />;
}

export default function XaiPanel() {
  const sim = useConsole((s) => s.sim);
  const level = useConsole((s) => s.xaiLevel);
  const setLevel = useConsole((s) => s.setXaiLevel);
  useConsole((s) => s.version);

  const evidence = sim.xai;
  const current = evidence.find((e) => e.level === level) ?? null;
  const url = current ? assetUrl(current.asset) : null;

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>XAI paneli · açıklanabilirlik</span>
        <span className="normal-case tracking-normal text-ops-faint">{evidence.length}/3 seviye hazır</span>
      </div>

      <div className="flex border-b border-ops-line">
        {([1, 2, 3] as const).map((l) => {
          const ready = evidence.some((e) => e.level === l);
          const active = level === l;
          return (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={
                'flex-1 text-[11px] py-[3px] border-r border-ops-line last:border-r-0 transition-colors leading-tight ' +
                (active ? 'text-ops-ai bg-ops-ai/10' : ready ? 'text-ops-dim hover:text-ops-text' : 'text-ops-faint')
              }
            >
              <div>
                {l} · {LEVELS[l].title}
                {ready && <span className="ml-1 text-ops-ai">•</span>}
              </div>
              <div className={'text-3xs ' + (active ? 'text-ops-ai/80' : 'text-ops-faint')}>{LEVELS[l].question}</div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0 bg-ops-sunken">
          {!current ? (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-ops-faint text-center px-3 leading-relaxed">
              Bu seviye için kanıt yok.
              <br />
              Bir senaryo çalıştırın; model çıktıları zaman çizelgesine göre yüklenir.
            </div>
          ) : url ? (
            <div className="absolute inset-0 p-2 flex items-center justify-center">
              <img src={url} alt={current.caption} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <SyntheticFigure ev={current} />
          )}
        </div>

        <div className="w-[190px] shrink-0 border-l border-ops-line p-2 flex flex-col gap-2">
          {current ? (
            <>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Bu seviye</div>
                <div className="text-[11px] text-ops-ai leading-snug mt-[2px]">{summarize(current.level, sim.buffers, current, sim.alarms)}</div>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Model</div>
                <div className="num text-[12px] text-ops-text mt-[2px]">{current.model}</div>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">En yüksek katkı</div>
                <div className="flex flex-wrap gap-1 mt-[3px]">
                  {current.top_channels.map((c, i) => (
                    <span key={c} className={'num text-3xs px-1 py-[1px] border ' + (i === 0 ? 'border-ops-ai text-ops-ai' : 'border-ops-line2 text-ops-dim')}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              {current.band && (
                <div>
                  <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Frekans bandı</div>
                  <div className="num text-[12px] text-ops-text mt-[2px]">{current.band}</div>
                </div>
              )}
              <div className="mt-auto text-3xs text-ops-faint leading-snug">{url ? 'bildiri görseli' : 'gerçek görsel için: src/assets/' + current.asset}</div>
            </>
          ) : (
            <div className="text-3xs text-ops-faint leading-relaxed">Kanıt yüklendiğinde seviyenin cevabı, model adı, en yüksek katkılı kanallar ve frekans bandı burada listelenir.</div>
          )}
        </div>
      </div>
    </section>
  );
}
