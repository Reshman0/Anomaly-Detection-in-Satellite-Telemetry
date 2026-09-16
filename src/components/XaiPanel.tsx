import { useCallback, useEffect, useRef, useState } from 'react';
import { useConsole } from '../store';
import { injectedChannels, scenarioByAsset, scenarioStartT } from '../engine/xaiFigures';
import XaiFigure from './XaiFigure';
import KanitBuyutec, { type BuyutulenKanit } from './KanitBuyutec';

/**
 * XAI paneli — uc seviyeli sekme. Her seviye farkli bir soruya cevap verir ve
 * BILEREK farkli bir gorsel dil kullanir:
 *   1 Nerede saptı   cizgi   — modelin bekledigi seri, olculen seri, aradaki fark
 *   2 Hangi kanal    cubuk   — sapmanin kanallara dagilimi
 *   3 Isı haritası   harita  — tum kanallar x zaman ve sapmanin zaman profili
 * Ayni veriyi iki kez gosterirlerse panelin uc adimi birbirinden ayirt edilemiyor.
 *
 * Gorseller calisma aninda cizilir (bkz. XaiFigure); gorsele tiklayinca ekranin
 * ortasinda buyutulmus hali acilir.
 */

const LEVEL_TITLES: Record<1 | 2 | 3, string> = {
  1: '1 · Nerede saptı',
  2: '2 · Hangi kanal',
  3: '3 · Isı haritası',
};

/**
 * Yan sutundaki "ne gosteriyor" metni seviyeden gelir, senaryo basligindan
 * degil: cizilen sey her senaryoda ayni turdendir ve basligin gorselle
 * birebir ortusmesi gerekir.
 */
const LEVEL_ANLAM: Record<1 | 2 | 3, string> = {
  1: 'Model ne bekliyordu, ne ölçüldü',
  2: 'Hangi kanal ne kadar pay aldı',
  3: 'Sapma zamanla nasıl yayıldı',
};

export default function XaiPanel() {
  const sim = useConsole((s) => s.sim);
  const level = useConsole((s) => s.xaiLevel);
  const setLevel = useConsole((s) => s.setXaiLevel);
  useConsole((s) => s.version);

  const [buyuk, setBuyuk] = useState<BuyutulenKanit | null>(null);
  const kapat = useCallback(() => setBuyuk(null), []);

  const evidence = sim.xai;
  const current = evidence.find((e) => e.level === level) ?? null;
  const scenario = current ? scenarioByAsset(current.asset) : null;
  const channels = scenario ? injectedChannels(scenario) : (current?.top_channels ?? []);
  // Sekillerin zaman ekseni simulasyon saatini yazsin diye senaryonun basladigi gorev saniyesi.
  const baslangicT = current && scenario ? scenarioStartT(scenario, current.asset, current.missionT) : 0;

  /*
   * Yeni kanit geldiginde panel kendiliginden o adima gecer; sunucunun sekmeye
   * tiklamasi gerekmez. Elle secilen adim, yeni kanit gelene kadar korunur.
   */
  const sonSayi = useRef(evidence.length);
  useEffect(() => {
    if (evidence.length > sonSayi.current) {
      setLevel(evidence[evidence.length - 1].level);
    }
    sonSayi.current = evidence.length;
  }, [evidence.length, evidence, setLevel]);

  return (
    <section data-tour="xai" className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Model neden alarm verdi</span>
        <span className="normal-case tracking-normal text-ops-faint">{evidence.length}/3 kanıt hazır</span>
      </div>

      <div className="flex border-b border-ops-line">
        {([1, 2, 3] as const).map((l) => {
          const ready = evidence.some((e) => e.level === l);
          return (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={
                'flex-1 text-[11px] py-[3px] border-r border-ops-line last:border-r-0 transition-colors leading-tight ' +
                (level === l ? 'text-ops-ai bg-ops-ai/10' : ready ? 'text-ops-dim hover:text-ops-text' : 'text-ops-faint')
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
              Bu adımda henüz bir şey gelmedi.
              <br />
              Bir senaryo başlatın, model çıktıları sırayla gelir.
            </div>
          ) : !scenario ? (
            <div className="text-[11px] text-ops-faint text-center px-3 leading-relaxed">
              Bu kanıtın ait olduğu senaryo bulunamadı.
            </div>
          ) : (
            <button
              onClick={() =>
                setBuyuk({
                  scenario,
                  channels,
                  level: current.level,
                  model: current.model,
                  baslangicT,
                  baslik: LEVEL_TITLES[current.level],
                })
              }
              title="Büyütmek için tıklayın"
              className="w-full h-full min-h-0 flex items-center justify-center cursor-zoom-in group"
            >
              <XaiFigure
                scenario={scenario}
                channels={channels}
                level={current.level}
                model={current.model}
                baslangicT={baslangicT}
                className="max-w-full max-h-full object-contain transition-opacity group-hover:opacity-80"
              />
            </button>
          )}
        </div>

        <div className="w-[190px] shrink-0 border-l border-ops-line p-2 flex flex-col gap-2 overflow-hidden">
          {current ? (
            <>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Ne gösteriyor</div>
                <div className="text-[11px] text-ops-ai leading-snug mt-[2px]">{LEVEL_ANLAM[current.level]}</div>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Model</div>
                <div className="num text-[12px] text-ops-text mt-[2px]">{current.model}</div>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Sorumlu kanal</div>
                <div className="flex flex-wrap gap-1 mt-[3px]">
                  {channels.map((c, i) => (
                    <span
                      key={c}
                      className={'num text-3xs px-1 py-[1px] border ' + (i === 0 ? 'border-ops-ai text-ops-ai' : 'border-ops-line2 text-ops-dim')}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              {current.band && (
                <div>
                  <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Sapmanın sıklığı</div>
                  <div className="num text-[12px] text-ops-text mt-[2px]">{current.band}</div>
                </div>
              )}
            </>
          ) : (
            <div className="text-3xs text-ops-faint leading-relaxed">
              Kanıt gelince model adını, öne çıkan kanalları ve frekans bandını burada göreceksiniz.
            </div>
          )}
        </div>
      </div>

      <KanitBuyutec kanit={buyuk} onClose={kapat} />
    </section>
  );
}
