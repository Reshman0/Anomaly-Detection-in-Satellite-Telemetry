import { useState } from 'react';
import { useConsole } from '../store';
import { PARAMETERS } from '../engine/mib';
import { GROUND_STATION, satByNorad } from '../engine/orbit';
import { isHard, stateLabel, worstState } from '../engine/limitChecker';
import { interestingPids, summaryVerdict, type VerdictTone } from '../engine/summary';
import { deriveStage, type InfoStage } from '../engine/infoStage';
import { fmtCountdown, fmtTime } from '../engine/missionClock';
import { WINDOW_S, type Simulation } from '../engine/simulation';
import { stateTextClass } from '../ui/colors';
import { gaugeFrac, gaugeZones, type ZoneKind } from '../ui/gosterge';
import type { LimitState, MibParameter } from '../engine/types';
import TelemetryStrip, { ATTENTION_WINDOW_S } from './TelemetryStrip';
import OzetAlarmSeridi from './OzetAlarmSeridi';
import { useTemas } from './useTemas';

/**
 * Ozet panosu — ozet modunda sag sutunun tamami. Tam gorunumun panellerini
 * gizleyerek degil, kendi duzeniyle cizilir ("dark cockpit": nominalde sakin,
 * sapmada renkli). Yukaridan asagi operatorun soru sirasi:
 *
 *   1. Durum karti     her sey yolunda mi? (tek hukum) · temas ne zaman? · olay var mi?
 *   2. Parametreler    hangi kanal, limite ne kadar yakin?
 *   3. Grafikler       yalnizca sapan / sabitlenen ham kanallar + AI skorlari
 *   4. Oneri           ne yapmaliyim?
 *
 * Hicbir yeni veri uretilmez: hepsi tam gorunumun kullandigi kaynaklardan
 * (limit durumu, summary.ts, infoStage.ts, SGP4) okunur.
 */

const RAW = PARAMETERS.filter((p) => !p.derived);
const AI = PARAMETERS.filter((p) => p.derived);
const AI_LIMITS = AI[0]?.limits ?? {};

/** Sinif adlari harfiyen: Tailwind birlestirilmis ad uretmez. */
const TONE: Record<VerdictTone, { text: string; edge: string; wash: string }> = {
  nominal: { text: 'text-ops-nominal', edge: 'border-l-ops-nominal', wash: 'bg-ops-nominal/[0.04]' },
  soft: { text: 'text-ops-soft', edge: 'border-l-ops-soft', wash: 'bg-ops-soft/[0.07]' },
  hard: { text: 'text-ops-hard', edge: 'border-l-ops-hard', wash: 'bg-ops-hard/[0.08]' },
  ai: { text: 'text-ops-ai', edge: 'border-l-ops-ai', wash: 'bg-ops-ai/[0.08]' },
};

const STAGE: Record<InfoStage, { word: string; cls: string; hint: string }> = {
  0: { word: 'İZLEME', cls: 'text-ops-nominal', hint: 'tespit yok · kırılma yok · ST[12] sessiz' },
  1: { word: 'ŞÜPHE', cls: 'text-ops-soft', hint: 'imza eşleşmesi aday · doğrulama bekleniyor' },
  2: { word: 'DOĞRULANDI', cls: 'text-ops-hard', hint: 'AI skoru sert eşiği geçti · öneri hazır' },
};

const URGENCY: Record<string, { cls: string; label: string }> = {
  izle: { cls: 'border-ops-nominal text-ops-nominal', label: 'İZLE' },
  'planlı': { cls: 'border-ops-soft text-ops-soft', label: 'PLANLI' },
  acil: { cls: 'border-ops-hard text-ops-hard', label: 'ACİL' },
};

const ZONE_CLS: Record<ZoneKind, string> = {
  hard: 'bg-ops-hard/35',
  soft: 'bg-ops-soft/35',
  nominal: 'bg-ops-nominal/20',
};

function aiLabel(s: LimitState): string {
  if (isHard(s)) return 'ALARM';
  if (s !== 'NOMINAL') return 'İZLEME';
  return 'NOMİNAL';
}

function Etiket({ children }: { children: React.ReactNode }) {
  return <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint leading-none whitespace-nowrap">{children}</div>;
}

function stateOf(sim: Simulation, pid: string): LimitState {
  return sim.snapshot().states.get(pid) ?? 'NOMINAL';
}

/** En son XAI kanitinin sorumlu kanallari: kanal -> sira (1'den). */
function attentionRanks(sim: Simulation): Map<string, number> {
  const out = new Map<string, number>();
  const latest = sim.xai.length ? sim.xai[sim.xai.length - 1] : null;
  latest?.top_channels.forEach((pid, i) => out.set(pid, i + 1));
  return out;
}

export default function OzetPanosu() {
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);
  // Operatorun grafige sabitledigi ham kanallar (sapmasa da izlemek icin).
  const [sabit, setSabit] = useState<string[]>([]);

  const ilginc = new Set(interestingPids(sim));
  const ranks = attentionRanks(sim);
  const grafik = new Set([...ilginc, ...sabit]);
  const degistir = (pid: string) => setSabit((l) => (l.includes(pid) ? l.filter((x) => x !== pid) : [...l, pid]));

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-px">
      <DurumKarti />
      <ParametreKutulari ilginc={ilginc} sabit={sabit} ranks={ranks} onToggle={degistir} />
      <Grafikler pids={grafik} ranks={ranks} />
      <OneriKarti />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Durum karti
// ---------------------------------------------------------------------------

function DurumKarti() {
  const sim = useConsole((s) => s.sim);
  const norad = useConsole((s) => s.selectedNorad);

  const limit = worstState(RAW.map((p) => stateOf(sim, p.pid)));
  const ai = worstState(AI.map((p) => stateOf(sim, p.pid)));
  const v = summaryVerdict(limit, ai);
  const tone = TONE[v.tone];
  const sapanlar = PARAMETERS.filter((p) => stateOf(sim, p.pid) !== 'NOMINAL').map((p) => p.pid);

  const sat = satByNorad(norad);
  const utcMs = sim.clock.utcMs();
  const temas = useTemas(norad, utcMs);

  const sc = sim.activeScenario;
  const st = deriveStage(sim);
  const acikOneri = sim.notifications.length;

  return (
    <section aria-label="Genel durum" className={'panel shrink-0 border-l-4 ' + tone.edge}>
      <div className={'grid grid-cols-[minmax(0,1fr)_196px_236px] min-h-[124px] transition-colors ' + tone.wash}>
        {/* Hukum */}
        <div className="px-4 pt-3 pb-3 min-w-0 flex flex-col">
          <Etiket>
            Genel durum · <span className="text-ops-dim">{sat.name}</span> · NORAD {sat.norad}
          </Etiket>
          <div className="flex items-center gap-3 mt-2">
            {/* Anahtar hukme bagli: hukum degisince tek seferlik giris animasyonu. */}
            <span key={v.word + v.tone} className={'card-in num text-[42px] leading-none font-semibold tracking-[0.04em] whitespace-nowrap ' + tone.text}>
              <span className="text-[28px] align-[5px] mr-2.5">{v.glyph}</span>
              {v.word}
            </span>
            {v.contrast && (
              <span
                title="Sabit limitler sessiz, yalnızca model sapmayı görüyor"
                className="text-3xs tracking-[0.16em] text-ops-ai border border-ops-ai/60 bg-ops-ai/10 px-1.5 py-[3px] leading-none"
              >
                KONTRAST
              </span>
            )}
          </div>
          <div className="text-[12px] text-ops-dim mt-2 truncate" title={v.reason}>
            {v.reason}
            {sapanlar.length > 0 && <span className="num text-ops-text"> · {sapanlar.join(', ')}</span>}
          </div>
          <div className="flex flex-wrap gap-2 mt-auto pt-2">
            <Rozet etiket="▲ ST[12] sabit limit" deger={stateLabel(limit)} cls={stateTextClass(limit)} />
            <Rozet etiket="◆ AI tespiti" deger={aiLabel(ai)} cls={ai === 'NOMINAL' ? 'text-ops-nominal' : 'text-ops-ai'} />
          </div>
        </div>

        {/* Temas */}
        <div className="px-4 pt-3 pb-3 border-l border-ops-line flex flex-col min-w-0">
          <Etiket>Temas · {GROUND_STATION.name}</Etiket>
          {temas.pass ? (
            <>
              <div className="flex items-baseline gap-2 mt-2.5">
                <span className="num text-[10px] tracking-[0.14em] text-ops-faint">{temas.pass.kind}</span>
                <span className={'num text-[30px] leading-none ' + (temas.pass.kind === 'LOS' ? 'text-ops-nominal' : 'text-ops-text')}>
                  {fmtCountdown((temas.pass.targetMs - utcMs) / 1000)}
                </span>
              </div>
              <div className="num text-[11px] text-ops-faint mt-1.5">@ {fmtTime(temas.pass.targetMs)} UTC</div>
            </>
          ) : (
            <div className={'num text-[18px] leading-tight mt-2.5 ' + (temas.visible ? 'text-ops-nominal' : 'text-ops-dim')}>
              {temas.visible ? 'sürekli görünür' : 'görüş dışı'}
            </div>
          )}
          <div className="mt-auto pt-2 flex items-center gap-2 whitespace-nowrap">
            <span
              className={
                'text-3xs tracking-[0.14em] border px-1 leading-[13px] ' +
                (temas.visible ? 'border-ops-nominal text-ops-nominal' : 'border-ops-line2 text-ops-faint')
              }
            >
              {temas.visible ? 'GÖRÜNÜR' : 'GÖRÜŞ DIŞI'}
            </span>
            <span className="num text-[11px] text-ops-dim">yükselti {temas.elevation.toFixed(1)}°</span>
          </div>
        </div>

        {/* Olay */}
        <div className="px-4 pt-3 pb-3 border-l border-ops-line flex flex-col min-w-0">
          <Etiket>Anomali izleme</Etiket>
          {sc ? (
            <>
              <div className={'num text-[24px] leading-none mt-2.5 ' + STAGE[st.stage].cls}>{STAGE[st.stage].word}</div>
              <div className="text-[11px] text-ops-dim mt-1.5 truncate">
                {sc.name}
                {st.stage >= 1 && st.targetPid && <span className="num text-ops-text"> · {st.targetPid}</span>}
              </div>
              <div className="mt-auto pt-2">
                <div className="h-[3px] bg-ops-line2">
                  <div className="h-full bg-ops-ai" style={{ width: (sim.scenarioProgress * 100).toFixed(1) + '%' }} />
                </div>
                <div className="text-3xs text-ops-faint mt-1 truncate">{STAGE[st.stage].hint}</div>
              </div>
            </>
          ) : (
            <>
              <div className="num text-[24px] leading-none mt-2.5 text-ops-dim">OLAY YOK</div>
              <div className="text-[11px] text-ops-faint mt-1.5">aktif enjeksiyon yok</div>
              <div className="mt-auto pt-2 text-[11px]">
                {acikOneri > 0 ? (
                  <span className="text-ops-soft">
                    <span className="num">{acikOneri}</span> doğrulanmış anomalinin önerisi açık
                  </span>
                ) : (
                  <span className="text-ops-faint">açık öneri yok</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <OzetAlarmSeridi />
    </section>
  );
}

function Rozet({ etiket, deger, cls }: { etiket: string; deger: string; cls: string }) {
  return (
    <span className="inline-flex items-center gap-2 border border-ops-line2 bg-ops-sunken/70 px-2 py-[3px] leading-none whitespace-nowrap">
      <span className="text-3xs tracking-[0.1em] text-ops-faint">{etiket}</span>
      <span className={'num text-[11px] ' + cls}>{deger}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 2. Parametre kutucuklari
// ---------------------------------------------------------------------------

function ParametreKutulari({
  ilginc,
  sabit,
  ranks,
  onToggle,
}: {
  ilginc: Set<string>;
  sabit: string[];
  ranks: Map<string, number>;
  onToggle: (pid: string) => void;
}) {
  const sim = useConsole((s) => s.sim);
  return (
    <section className="panel shrink-0">
      <div className="panel-title flex items-center justify-between">
        <span>Parametreler · son değer ve limit konumu</span>
        <span className="normal-case tracking-normal text-ops-faint">ham kanala tıkla → grafiğe sabitle</span>
      </div>
      <div className="grid grid-cols-4 gap-px bg-ops-line">
        {PARAMETERS.map((p) => {
          const buf = sim.buffers.get(p.pid) ?? [];
          return (
            <Kutu
              key={p.pid}
              p={p}
              state={stateOf(sim, p.pid)}
              value={buf.length ? buf[buf.length - 1].eng : null}
              ilginc={ilginc.has(p.pid)}
              sabit={sabit.includes(p.pid)}
              rank={ranks.get(p.pid) ?? 0}
              onToggle={() => onToggle(p.pid)}
            />
          );
        })}
      </div>
    </section>
  );
}

function Kutu({
  p,
  state,
  value,
  ilginc,
  sabit,
  rank,
  onToggle,
}: {
  p: MibParameter;
  state: LimitState;
  value: number | null;
  ilginc: boolean;
  sabit: boolean;
  rank: number;
  onToggle: () => void;
}) {
  const sapma = state !== 'NOMINAL';
  // Limit icinde ama tespit edilmis ham kanal (suruklenmede ch_42): mor vurgu.
  const tespit = !p.derived && !sapma && ilginc;
  const edge = sapma ? (isHard(state) ? 'border-l-ops-hard' : 'border-l-ops-soft') : tespit ? 'border-l-ops-ai' : 'border-l-transparent';
  const wash = sapma ? (isHard(state) ? 'bg-ops-hard/[0.08]' : 'bg-ops-soft/[0.07]') : tespit ? 'bg-ops-ai/[0.07]' : 'bg-ops-panel';
  const valueCls = sapma ? stateTextClass(state) : 'text-ops-text';
  const text = value === null ? '—' : (value >= 0 ? '+' : '') + value.toFixed(3);

  const icerik = (
    <>
      <div className="flex items-center gap-1.5 h-[14px] whitespace-nowrap">
        {p.derived && <span className="text-ops-ai text-[11px] leading-none">◆</span>}
        <span className="num text-[12px] leading-none text-ops-text">{p.pid}</span>
        <span className="text-3xs text-ops-faint leading-none">{p.derived ? 'yer türetilmiş' : p.subsystem}</span>
        {rank > 0 && (
          <span className="text-3xs tracking-[0.08em] text-ops-ai border border-ops-ai/50 px-1 leading-[12px]">XAI #{rank}</span>
        )}
        <span className={'ml-auto text-3xs uppercase tracking-[0.12em] leading-none ' + (sapma ? stateTextClass(state) : 'text-ops-nominal/80')}>
          {stateLabel(state)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-[7px]">
        <span className={'num text-[22px] leading-none ' + valueCls}>{text}</span>
        <span className="num text-[11px] text-ops-faint">{p.eng_unit}</span>
        {!p.derived && (sabit || ilginc) && (
          <span className={'ml-auto text-3xs leading-none ' + (sabit ? 'text-ops-text' : 'text-ops-faint')}>
            {sabit ? '● sabitlendi' : 'grafikte'}
          </span>
        )}
      </div>
      <Gosterge p={p} value={value} state={state} />
    </>
  );

  const base = 'px-3 pt-2 pb-2.5 text-left border-l-2 transition-colors ' + edge + ' ' + wash;
  if (p.derived) return <div className={base}>{icerik}</div>;
  return (
    <button
      onClick={onToggle}
      aria-pressed={sabit}
      title={sabit ? 'Grafikten kaldır' : 'Sapmasa da grafikte göster'}
      className={base + ' hover:brightness-125 ' + (sabit ? 'outline outline-1 -outline-offset-1 outline-ops-line2' : '')}
    >
      {icerik}
    </button>
  );
}

/** Yatay limit gostergesi: sert / yumusak / nominal bolgeler ve son deger. */
function Gosterge({ p, value, state }: { p: MibParameter; value: number | null; state: LimitState }) {
  const imlec = state === 'NOMINAL' ? 'bg-ops-text' : isHard(state) ? 'bg-ops-hard' : 'bg-ops-soft';
  return (
    <div className="relative h-[6px] mt-[9px]" aria-hidden>
      {gaugeZones(p).map((z, i) => (
        <div
          key={i}
          className={'absolute inset-y-0 ' + ZONE_CLS[z.kind]}
          style={{ left: z.from * 100 + '%', width: (z.to - z.from) * 100 + '%' }}
        />
      ))}
      {value !== null && (
        <div
          className={'absolute -top-[3px] w-[3px] h-[12px] -ml-[1.5px] transition-[left] duration-200 ' + imlec}
          style={{ left: gaugeFrac(p, value) * 100 + '%' }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Grafikler
// ---------------------------------------------------------------------------

function Grafikler({ pids, ranks }: { pids: Set<string>; ranks: Map<string, number> }) {
  const sim = useConsole((s) => s.sim);
  const missionT = sim.clock.missionT;
  const latest = sim.xai.length ? sim.xai[sim.xai.length - 1] : null;

  const strip = (p: MibParameter, boxClass: string) => {
    const rank = ranks.get(p.pid) ?? 0;
    return (
      <TelemetryStrip
        key={p.pid}
        p={p}
        buf={sim.buffers.get(p.pid)!}
        state={stateOf(sim, p.pid)}
        missionT={missionT}
        attention={rank > 0 && latest ? [latest.missionT - ATTENTION_WINDOW_S, latest.missionT] : null}
        attentionRank={rank}
        breakT={sim.structuralBreak && sim.structuralBreak.pid === p.pid ? sim.structuralBreak.breakT : null}
        compact
        boxClass={boxClass}
      />
    );
  };

  const raw = RAW.filter((p) => pids.has(p.pid));

  return (
    // Kucuk ekranda (ornegin 1536x864) bolum kendi icinde kayar; sag sutun tasmaz.
    <section className="panel flex-1 min-h-[140px] flex flex-col">
      <div className="panel-title flex items-center justify-between">
        <span>Telemetri · sapan ve sabitlenen kanallar</span>
        <span className="normal-case tracking-normal text-ops-faint">son {WINDOW_S / 60} dk · dikey çizgiler 60 s</span>
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        {/* Ham seritler kalan yuksekligi paylasir; AI grubu altta sabit, hic kaymaz.
            Bes ham kanalin hepsi birden gorunurse alan kendi icinde kayar. */}
        <div className="flex-1 min-h-[88px] flex flex-col overflow-y-auto">
          {raw.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center px-6 bg-ops-sunken/50">
              <div className="text-ops-nominal text-[22px] leading-none">✓</div>
              <div className="text-[13px] text-ops-text">Ham kanalların hepsi limit içinde</div>
              <div className="text-[11px] text-ops-faint">
                Sapma ya da tespit olursa kanal burada kendiliğinden açılır · izlemek istediğiniz kanalı yukarıdan sabitleyin
              </div>
            </div>
          ) : (
            raw.map((p) => strip(p, 'flex-1 shrink-0 min-h-[44px]'))
          )}
        </div>
        <div className="shrink-0 border-t border-ops-line2">
          <div className="h-[20px] px-2 flex items-center gap-2 bg-ops-sunken border-b border-ops-line whitespace-nowrap">
            <span className="text-3xs uppercase tracking-[0.14em] text-ops-ai">◆ AI skorları</span>
            <span className="text-3xs text-ops-faint">
              yer türetilmiş · yumuşak {AI_LIMITS.soft_high ?? '—'}σ · sert {AI_LIMITS.hard_high ?? '—'}σ
            </span>
          </div>
          {AI.map((p) => strip(p, 'h-[48px] flex-none'))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Oneri
// ---------------------------------------------------------------------------

function OneriKarti() {
  const sim = useConsole((s) => s.sim);
  const sc = sim.activeScenario;
  const story = sc?.story ?? null;
  const st = deriveStage(sim);
  // Bildirimler en yeni once tutulur (Simulation unshift eder).
  const son = sim.notifications[0] ?? null;

  let rozet: { cls: string; label: string } | null = null;
  let baslik: string;
  let alt: string;
  if (sc && story && st.stage === 2) {
    rozet = URGENCY[story.recommendation.urgency];
    baslik = story.recommendation.action;
    alt = story.headline;
  } else if (sc && story && st.stage === 1) {
    baslik = 'Şu an: izlemeyi sürdür, komut gönderme.';
    alt = 'Eşleşen imza · aday: ' + story.headline;
  } else if (sc) {
    baslik = 'Şu an: izlemeyi sürdür, komut gönderme.';
    alt = 'Doğrulama bekleniyor: AI skoru sert eşiği geçince olası neden ve eylem önerisi açılır.';
  } else if (son) {
    rozet = URGENCY[son.urgency];
    baslik = son.action;
    alt = son.scenarioName + ' · ' + son.utc + ' UTC · ' + sim.notifications.length + ' açık öneri (tam görünümde BİLDİRİMLER)';
  } else {
    baslik = 'Açık öneri yok';
    alt = 'Doğrulanan bir anomali olursa eylem önerisi burada görünür.';
  }

  return (
    <section aria-label="Öneri" className="panel shrink-0 h-[58px] flex items-stretch">
      <div className="w-[108px] shrink-0 px-3 flex flex-col justify-center gap-1.5 border-r border-ops-line bg-ops-sunken">
        <Etiket>Öneri</Etiket>
        {rozet ? (
          <span className={'self-start text-3xs tracking-[0.14em] border px-1 leading-[13px] ' + rozet.cls}>{rozet.label}</span>
        ) : (
          <span className="text-3xs text-ops-faint leading-[13px]">—</span>
        )}
      </div>
      <div className="flex-1 min-w-0 px-3 flex flex-col justify-center gap-[3px]">
        <div key={baslik} className={'card-in text-[13px] truncate ' + (rozet ? 'text-ops-text font-semibold' : 'text-ops-dim')} title={baslik}>
          {baslik}
        </div>
        <div className="text-[11px] text-ops-faint truncate" title={alt}>
          {alt}
        </div>
      </div>
    </section>
  );
}
