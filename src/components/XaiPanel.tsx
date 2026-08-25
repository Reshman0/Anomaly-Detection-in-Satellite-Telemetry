import { useConsole } from '../store';

/**
 * XAI paneli — uc seviyeli sekme.
 *
 * Gorseller `src/assets/xai/` altindaki BILDIRIDEN ALINMIS gercek ciktilardir.
 * Sentetik olarak yeniden cizilmez (yonerge §7). Dosya konulmamissa panel,
 * beklenen dosya adini gosteren bos bir yuva cizer — uydurma grafik uretmez.
 */
const ASSETS = import.meta.glob('../assets/xai/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function assetUrl(rel: string): string | null {
  const name = rel.replace(/^xai\//, '');
  const key = Object.keys(ASSETS).find((k) => k.endsWith('/' + name));
  return key ? ASSETS[key] : null;
}

const LEVEL_TITLES: Record<1 | 2 | 3, string> = {
  1: 'Seviye 1 · Artık',
  2: 'Seviye 2 · Kanal katkısı',
  3: 'Seviye 3 · Grad-CAM',
};

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
        <span className="normal-case tracking-normal text-ops-faint">
          {evidence.length}/3 seviye hazır
        </span>
      </div>

      <div className="flex border-b border-ops-line">
        {([1, 2, 3] as const).map((l) => {
          const ready = evidence.some((e) => e.level === l);
          return (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={
                'flex-1 text-[11px] py-1 border-r border-ops-line last:border-r-0 transition-colors ' +
                (level === l
                  ? 'text-ops-ai bg-ops-ai/10'
                  : ready
                    ? 'text-ops-dim hover:text-ops-text'
                    : 'text-ops-faint')
              }
            >
              {LEVEL_TITLES[l]}
              {ready && <span className="ml-1 text-ops-ai">•</span>}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 p-2 flex items-center justify-center bg-ops-sunken">
          {!current ? (
            <div className="text-[11px] text-ops-faint text-center px-3 leading-relaxed">
              Bu seviye için kanıt yok.
              <br />
              Bir senaryo çalıştırın; model çıktıları zaman çizelgesine göre yüklenir.
            </div>
          ) : url ? (
            <img src={url} alt={current.caption} className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="w-full h-full border border-dashed border-ops-line2 flex flex-col items-center justify-center gap-1 px-3">
              <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Görsel yuvası boş</div>
              <div className="num text-[11px] text-ops-dim text-center break-all">src/assets/{current.asset}</div>
              <div className="text-3xs text-ops-faint text-center leading-snug max-w-[280px]">
                Bildiriden alınmış gerçek {current.model} çıktısını bu yola koyun. Yerine sentetik grafik çizilmez.
              </div>
            </div>
          )}
        </div>

        <div className="w-[190px] shrink-0 border-l border-ops-line p-2 flex flex-col gap-2">
          {current ? (
            <>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Başlık</div>
                <div className="text-[11px] text-ops-text leading-snug mt-[2px]">{current.caption}</div>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Model</div>
                <div className="num text-[12px] text-ops-ai mt-[2px]">{current.model}</div>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">En yüksek katkı</div>
                <div className="flex flex-wrap gap-1 mt-[3px]">
                  {current.top_channels.map((c, i) => (
                    <span
                      key={c}
                      className={
                        'num text-3xs px-1 py-[1px] border ' +
                        (i === 0 ? 'border-ops-ai text-ops-ai' : 'border-ops-line2 text-ops-dim')
                      }
                    >
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
            </>
          ) : (
            <div className="text-3xs text-ops-faint leading-relaxed">
              Kanıt yüklendiğinde model adı, en yüksek katkılı kanallar ve frekans bandı burada listelenir.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
