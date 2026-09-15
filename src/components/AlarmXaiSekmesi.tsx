import { useCallback, useEffect, useState } from 'react';
import { MIB } from '../engine/mib';
import { fmtTime } from '../engine/missionClock';
import { SCENARIOS } from '../engine/scenarioRunner';
import { injectedChannels } from '../engine/xaiFigures';
import type { XaiRun } from '../engine/simulation';
import XaiFigure from './XaiFigure';
import KanitBuyutec, { type BuyutulenKanit } from './KanitBuyutec';

/**
 * Alarm detayindaki XAI sekmesi: alarm dustugunde kosan senaryonun kanitlari.
 *
 * Sagdaki canli XAI paneli yeni anomali enjekte edilince temizlenir. Buradaki
 * kanitlar simulasyonun kosu arsivinden (`Simulation.xaiRunFor`) okunur;
 * boylece eski bir alarmi acan operator o anomalinin sekillerini de gorur.
 * Sekiller paneldeki ile ayni cizimdir (XaiFigure), tiklayinca buyutulur.
 */

const SEVIYE_BASLIK: Record<1 | 2 | 3, string> = {
  1: '1 · Nerede saptı',
  2: '2 · Hangi kanal',
  3: '3 · Isı haritası',
};

const SEVIYE_ANLAM: Record<1 | 2 | 3, string> = {
  1: 'Model ne bekliyordu, ne ölçüldü',
  2: 'Hangi kanal ne kadar pay aldı',
  3: 'Sapma zamanla nasıl yayıldı',
};

const EPOCH_MS = Date.parse(MIB.epoch);

function Baslik({ children }: { children: React.ReactNode }) {
  return <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">{children}</div>;
}

export default function AlarmXaiSekmesi({ run, alarmId }: { run: XaiRun | null; alarmId: number }) {
  const [seviye, setSeviye] = useState<1 | 2 | 3>(1);
  const [buyuk, setBuyuk] = useState<BuyutulenKanit | null>(null);
  const kapat = useCallback(() => setBuyuk(null), []);

  // Baska bir alarm acilinca ilk seviyeye don.
  useEffect(() => {
    setSeviye(1);
    setBuyuk(null);
  }, [alarmId]);

  const senaryo = run ? (SCENARIOS.find((s) => s.id === run.scenarioId) ?? null) : null;
  if (!run || !senaryo) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6">
        <div className="text-[11px] text-ops-faint text-center leading-relaxed max-w-[460px]">
          Bu alarm bir anomali senaryosu çalışmıyorken düştü, bu yüzden modelin ürettiği bir XAI çıktısı yok.
          <br />
          XAI kanıtları yalnızca enjekte edilen anomalilerin alarmlarında saklanır.
        </div>
      </div>
    );
  }

  const kanallar = injectedChannels(senaryo);
  const kanit = run.evidence.find((e) => e.level === seviye) ?? null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_220px] flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-col min-h-0 border-r border-ops-line">
        <div className="flex border-b border-ops-line" role="tablist" aria-label="XAI seviyeleri">
          {([1, 2, 3] as const).map((l) => {
            const hazir = run.evidence.some((e) => e.level === l);
            return (
              <button
                key={l}
                role="tab"
                aria-selected={seviye === l}
                onClick={() => setSeviye(l)}
                className={
                  'flex-1 text-[11px] py-[3px] border-r border-ops-line last:border-r-0 transition-colors leading-tight ' +
                  (seviye === l ? 'text-ops-ai bg-ops-ai/10' : hazir ? 'text-ops-dim hover:text-ops-text' : 'text-ops-faint')
                }
              >
                {SEVIYE_BASLIK[l]}
                {hazir && <span className="ml-1 text-ops-ai">•</span>}
              </button>
            );
          })}
        </div>
        <div className="flex-1 min-h-0 p-2 flex items-center justify-center bg-ops-sunken">
          {kanit ? (
            <button
              onClick={() =>
                setBuyuk({
                  scenario: senaryo,
                  channels: kanallar,
                  level: kanit.level,
                  model: kanit.model,
                  baslangicT: run.startT,
                  baslik: SEVIYE_BASLIK[kanit.level],
                })
              }
              title="Büyütmek için tıklayın"
              className="w-full h-full min-h-0 flex items-center justify-center cursor-zoom-in group"
            >
              <XaiFigure
                scenario={senaryo}
                channels={kanallar}
                level={kanit.level}
                model={kanit.model}
                baslangicT={run.startT}
                className="max-w-full max-h-full object-contain transition-opacity group-hover:opacity-80"
              />
            </button>
          ) : (
            <div className="text-[11px] text-ops-faint text-center px-3 leading-relaxed">
              Bu adımın kanıtı henüz gelmedi.
              <br />
              Model çıktıları senaryo ilerledikçe sırayla gelir.
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 overflow-y-auto">
        <Baslik>Anomali</Baslik>
        <div className="text-[12px] text-ops-text leading-snug">{senaryo.name}</div>
        <div className="num text-3xs text-ops-dim mt-[2px]">
          {run.runNo}. çalıştırma · başlangıç {fmtTime(EPOCH_MS + run.startT * 1000)} UTC
        </div>

        <div className="mt-3">
          <Baslik>Ne gösteriyor</Baslik>
          <div className="text-[11px] text-ops-ai leading-snug">{SEVIYE_ANLAM[seviye]}</div>
        </div>

        {kanit && (
          <>
            <div className="mt-3">
              <Baslik>Model</Baslik>
              <div className="num text-[12px] text-ops-text">{kanit.model}</div>
            </div>
            <div className="mt-3">
              <Baslik>Sorumlu kanal</Baslik>
              <div className="flex flex-wrap gap-1">
                {kanallar.map((c, i) => (
                  <span
                    key={c}
                    className={'num text-3xs px-1 py-[1px] border ' + (i === 0 ? 'border-ops-ai text-ops-ai' : 'border-ops-line2 text-ops-dim')}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            {kanit.band && (
              <div className="mt-3">
                <Baslik>Sapmanın sıklığı</Baslik>
                <div className="num text-[12px] text-ops-text">{kanit.band}</div>
              </div>
            )}
          </>
        )}

        <div className="mt-3">
          <Baslik>Gelen kanıtlar</Baslik>
          {([1, 2, 3] as const).map((l) => {
            const e = run.evidence.find((x) => x.level === l);
            return (
              <div key={l} className="flex justify-between gap-2 text-[11px] leading-[16px]">
                <span className={e ? 'text-ops-dim' : 'text-ops-faint'}>{SEVIYE_BASLIK[l]}</span>
                <span className={'num ' + (e ? 'text-ops-text' : 'text-ops-faint')}>
                  {e ? fmtTime(EPOCH_MS + e.missionT * 1000) : 'bekleniyor'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="text-3xs text-ops-faint leading-snug mt-3 border-t border-ops-line pt-2">
          Yeni bir anomali enjekte edilince sağdaki XAI paneli temizlenir; bu alarmın kanıtları burada saklanır.
        </div>
      </div>

      <KanitBuyutec kanit={buyuk} onClose={kapat} />
    </div>
  );
}
