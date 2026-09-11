import { useState } from 'react';
import { useConsole } from '../store';
import { MIB } from '../engine/mib';
import { fmtCountdown, fmtTime } from '../engine/missionClock';
import { CATALOG_EPOCH_MS, nextPassEvent, satByNorad } from '../engine/orbit';
import { deriveStage, type InfoStage } from '../engine/infoStage';
import missionNotes from '../data/mission_notes.json';
import type { InfoNote } from '../engine/types';

/**
 * INFO — operator bilgi paneli, iki sekme:
 *   INFO         tespit asamasina gore acilan hikaye (bkz. engine/infoStage.ts):
 *                0 IZLEME · 1 SUPHE (tespit + imza eslesmesi + gecmis) · 2 DOGRULANDI (+ neden + ONERI)
 *   BILDIRIMLER  dogrulanan her anomalinin onerisi — senaryo bitince de kalir
 * Hikaye metinleri senaryo verisidir; kirilma, AI esik anlari ve ST[12]
 * gecisleri veriden hesaplanir.
 */

type Tab = 'info' | 'bildirim';

const URGENCY: Record<string, { cls: string; label: string }> = {
  izle: { cls: 'border-ops-nominal text-ops-nominal', label: 'İZLE' },
  'planlı': { cls: 'border-ops-soft text-ops-soft', label: 'PLANLI' },
  acil: { cls: 'border-ops-hard text-ops-hard', label: 'ACİL' },
};

const STAGE_LABEL: Record<InfoStage, { text: string; cls: string }> = {
  0: { text: 'İZLEME', cls: 'text-ops-nominal border-ops-nominal' },
  1: { text: 'ŞÜPHE · imza eşleşmesi', cls: 'text-ops-soft border-ops-soft' },
  2: { text: 'DOĞRULANDI', cls: 'text-ops-hard border-ops-hard' },
};

const KIND_CLS: Record<InfoNote['kind'], string> = {
  note: 'border-l-ops-line2 text-ops-dim',
  stat: 'border-l-ops-text text-ops-text',
  recommendation: 'border-l-ops-soft text-ops-soft',
};

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">{children}</div>;
}

export default function InfoPanel() {
  const sim = useConsole((s) => s.sim);
  const selectedNorad = useConsole((s) => s.selectedNorad);
  useConsole((s) => s.version);
  const [tab, setTab] = useState<Tab>('info');

  const sc = sim.activeScenario;
  const story = sc?.story ?? null;
  const st = deriveStage(sim);
  const epochMs = Date.parse(MIB.epoch);
  const utcOf = (t: number) => fmtTime(epochMs + t * 1000);
  const startT = sim.scenarioStartT ?? 0;
  const rel = (t: number) => 't+' + Math.round(t - startT) + ' s';
  const runNo = sc ? (sim.runCounts.get(sc.id) ?? 1) : 0;
  const notes = sim.infoNotes.filter((n) => n.kind !== 'recommendation' || st.stage === 2);

  return (
    <section className="panel flex flex-col flex-1 min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span>Operatör bilgi paneli</span>
          {(['info', 'bildirim'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'normal-case tracking-[0.08em] text-2xs px-[7px] py-[1px] border transition-colors ' +
                (tab === t ? 'border-ops-text text-ops-text bg-ops-sunken' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
              }
            >
              {t === 'info' ? 'INFO' : 'BİLDİRİMLER'}
              {t === 'bildirim' && sim.notifications.length > 0 && (
                <span className="ml-1 num text-ops-soft">{sim.notifications.length}</span>
              )}
            </button>
          ))}
          {tab === 'info' && sc && (
            <span className={'text-3xs tracking-[0.12em] border px-1 leading-[13px] ' + STAGE_LABEL[st.stage].cls}>
              {STAGE_LABEL[st.stage].text}
            </span>
          )}
        </span>
        <span className="normal-case tracking-normal text-ops-faint">
          {tab === 'bildirim' ? 'doğrulanan anomalilerin önerileri · kalıcı' : sc ? 'anomali izleme aktif · simüle' : 'görev notları · simüle'}
        </span>
      </div>

      {tab === 'bildirim' ? (
        <Notifications />
      ) : sc && story && st.stage >= 1 ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-[1.4fr_1fr_1.2fr] gap-px flex-1 min-h-0">
            <div className="px-2 py-1.5 border-r border-ops-line overflow-y-auto">
              <Label>Tespit</Label>
              <div className="text-[11px] text-ops-text leading-snug mt-[2px] num">
                {st.trigger === 'break' && st.brk && (
                  <>
                    <span className="text-ops-warn">yapısal kırılma</span> {st.brk.pid} · {rel(st.brk.breakT)}
                  </>
                )}
                {st.trigger === 'ai' && st.aiDetectT !== null && (
                  <>
                    <span className="text-ops-ai">AI skoru ≥ 3σ</span> {st.aiPid} · {rel(st.aiDetectT)}
                  </>
                )}
                {st.trigger === 'st12' && st.st12T !== null && (
                  <>
                    <span className="text-ops-hard">ST[12] limit geçişi</span> {st.targetPid} · {rel(st.st12T)}
                  </>
                )}
              </div>
              <Label>
                <span className="block mt-2">{st.stage === 2 ? 'Eşleşen imza' : 'Eşleşen imza · aday'}</span>
              </Label>
              <div className="text-[12px] text-ops-text leading-snug mt-[2px]">{story.headline}</div>
              <div className="text-[11px] text-ops-dim leading-snug mt-1">{story.summary}</div>
              {st.stage === 2 && (
                <>
                  <Label>
                    <span className="block mt-2">Olası neden</span>
                  </Label>
                  <div className="text-[11px] text-ops-dim leading-snug mt-[2px]">{story.cause}</div>
                </>
              )}
            </div>

            <div className="px-2 py-1.5 border-r border-ops-line overflow-y-auto num">
              <Label>Geçmiş · imza kütüphanesi</Label>
              <div className="text-[13px] text-ops-text mt-[2px]">
                {story.history.count} kez <span className="text-ops-dim text-[11px]">/ {story.history.window}</span>
              </div>
              <div className="text-3xs text-ops-faint">
                ~{story.history.mean_duration_s} s · eğilim: <span className="text-ops-soft">{story.history.trend}</span> · bu oturumda {runNo}. kez
              </div>
              <Label>
                <span className="block mt-2">Yapısal kırılma · CUSUM</span>
              </Label>
              {st.brk ? (
                <>
                  <div className="text-[13px] text-ops-warn mt-[2px]">
                    {utcOf(st.brk.breakT)} <span className="text-[11px]">{st.brk.direction === 1 ? '↑' : '↓'}</span>
                  </div>
                  <div className="text-3xs text-ops-faint">
                    {st.brk.pid} · {st.brk.magnitudeSigma.toFixed(1)}σ · tespit {utcOf(st.brk.detectedT)}
                    {st.aiDetectT !== null && (
                      <>
                        {' '}· AI eşiğinden {Math.abs(Math.round(st.aiDetectT - st.brk.breakT))} s {st.aiDetectT >= st.brk.breakT ? 'önce' : 'sonra'}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-ops-faint mt-[2px]">henüz kırılma yok</div>
              )}
              <Label>
                <span className="block mt-2">AI skoru</span>
              </Label>
              <div className="text-[11px] mt-[2px]">
                <span className={st.aiDetectT !== null ? 'text-ops-ai' : 'text-ops-faint'}>
                  3σ {st.aiDetectT !== null ? utcOf(st.aiDetectT) + ' (' + rel(st.aiDetectT) + ')' : 'geçilmedi'}
                </span>
                <span className="text-ops-faint"> · </span>
                <span className={st.aiConfirmT !== null ? 'text-ops-hard' : 'text-ops-faint'}>
                  5σ {st.aiConfirmT !== null ? utcOf(st.aiConfirmT) : 'geçilmedi'}
                </span>
              </div>
              <div className="text-3xs text-ops-faint">ST[12]: {st.st12T !== null ? 'geçiş ' + utcOf(st.st12T) : 'sessiz — limit içinde'}</div>
            </div>

            <div className="px-2 py-1.5 overflow-y-auto">
              {st.stage === 2 ? (
                <>
                  <div className="flex items-center gap-2">
                    <Label>Öneri</Label>
                    <span className={'text-3xs tracking-[0.14em] border px-1 leading-[13px] ' + URGENCY[story.recommendation.urgency].cls}>
                      {URGENCY[story.recommendation.urgency].label}
                    </span>
                    <span className="text-3xs text-ops-faint">→ BİLDİRİMLER'e yazıldı</span>
                  </div>
                  <div className="text-[12px] text-ops-text leading-snug mt-[2px] font-semibold">{story.recommendation.action}</div>
                  <ol className="mt-1 text-[11px] text-ops-dim leading-snug list-decimal pl-4 space-y-[2px]">
                    {story.recommendation.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <>
                  <Label>Öneri</Label>
                  <div className="text-[11px] text-ops-faint leading-snug mt-[2px]">
                    Doğrulama bekleniyor: AI skoru 5σ sert eşiğini geçince olası neden ve eylem önerisi açılır.
                  </div>
                  <div className="text-3xs text-ops-faint mt-2">Şu an: izlemeyi sürdür, komut gönderme.</div>
                </>
              )}
            </div>
          </div>

          <div className="h-[62px] shrink-0 border-t border-ops-line overflow-y-auto">
            {notes.length === 0 ? (
              <div className="px-2 py-1 text-3xs text-ops-faint">Operatör notları tespit ilerledikçe düşer.</div>
            ) : (
              [...notes].reverse().map((n) => (
                <div key={n.id} className={'card-in px-2 py-[3px] border-b border-ops-line/60 border-l-2 text-[11px] leading-snug ' + KIND_CLS[n.kind]}>
                  <span className="num text-3xs text-ops-faint mr-2">{n.utc}</span>
                  <span className="font-semibold">{n.title}</span> <span className="text-ops-dim">— {n.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <NominalNotes selectedNorad={selectedNorad} monitoring={!!sc} notes={sc ? notes : []} />
      )}
    </section>
  );
}

function Notifications() {
  const sim = useConsole((s) => s.sim);
  const list = sim.notifications;
  if (list.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[11px] text-ops-faint text-center px-4 leading-relaxed">
        Henüz bildirim yok.
        <br />
        Bir anomali doğrulandığında (AI skoru ≥ 5σ) önerisi burada kalıcı olarak listelenir.
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {list.map((n) => (
        <div key={n.id} className="card-in px-2 py-1.5 border-b border-ops-line grid grid-cols-[1.2fr_1.6fr] gap-x-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="num text-[11px] text-ops-text">{n.utc}</span>
              <span className={'text-3xs tracking-[0.14em] border px-1 leading-[13px] ' + URGENCY[n.urgency].cls}>{URGENCY[n.urgency].label}</span>
              <span className="text-3xs text-ops-faint">
                {n.scenarioName} · {n.runNo}. kez
              </span>
            </div>
            <div className="text-[11px] text-ops-dim leading-snug mt-[2px]">{n.headline}</div>
          </div>
          <div>
            <div className="text-[11px] text-ops-text font-semibold leading-snug">{n.action}</div>
            <ol className="mt-[2px] text-3xs text-ops-dim leading-snug list-decimal pl-4">
              {n.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      ))}
    </div>
  );
}

function NominalNotes({ selectedNorad, monitoring, notes }: { selectedNorad: string; monitoring: boolean; notes: InfoNote[] }) {
  const sim = useConsole((s) => s.sim);
  const sat = satByNorad(selectedNorad);
  const utcMs = sim.clock.utcMs();
  const pass = sat.orbitClass === 'LEO' ? nextPassEvent(sat, utcMs, 3 * 3600) : null;
  const tleAgeDays = Math.round((Date.parse(MIB.epoch) - CATALOG_EPOCH_MS) / 86400000);
  const standing = (missionNotes as { notes: { kind: InfoNote['kind']; title: string; text: string }[] }).notes;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[1fr_1.6fr] gap-px">
      <div className="px-2 py-1.5 border-r border-ops-line num">
        <Label>Görev durumu</Label>
        <div className="text-[11px] text-ops-text mt-[2px]">Tüm alt sistemler nominal</div>
        <div className="text-3xs text-ops-faint mt-1">
          {sim.packetCount} paket · {sim.alarms.length} alarm · katalog TLE yaşı {tleAgeDays} gün
        </div>
        {monitoring && <div className="text-3xs text-ops-nominal mt-1">Anomali izleme aktif · kırılma yok · AI &lt; 3σ · ST[12] sessiz</div>}
        {!monitoring && sim.notifications.length > 0 && (
          <div className="text-3xs text-ops-soft mt-1">{sim.notifications.length} açık öneri → BİLDİRİMLER</div>
        )}
        <Label>
          <span className="block mt-2">Sıradaki geçiş · {sat.name}</span>
        </Label>
        <div className="text-[11px] text-ops-dim mt-[2px]">
          {sat.orbitClass !== 'LEO' ? 'GEO — sürekli görüş' : pass ? pass.kind + ' ' + fmtTime(pass.unixMs) + ' · ' + fmtCountdown((pass.unixMs - utcMs) / 1000) : '3 sa içinde geçiş yok'}
        </div>
        {!monitoring && <div className="text-3xs text-ops-faint mt-2">Bir senaryo başlatın; tespit geldikçe hikâye, geçmiş, yapısal kırılma ve ÖNERİ açılır.</div>}
      </div>
      <div className="px-2 py-1.5 overflow-y-auto">
        <Label>Operatör notları</Label>
        {[...notes].reverse().map((n) => (
          <div key={'n' + n.id} className={'card-in mt-1 px-2 py-[3px] border-l-2 text-[11px] leading-snug ' + KIND_CLS[n.kind]}>
            <span className="num text-3xs text-ops-faint mr-2">{n.utc}</span>
            <span className="font-semibold">{n.title}</span> <span className="text-ops-dim">— {n.text}</span>
          </div>
        ))}
        {standing.map((n, i) => (
          <div key={i} className={'mt-1 px-2 py-[3px] border-l-2 text-[11px] leading-snug ' + KIND_CLS[n.kind]}>
            <span className="font-semibold">{n.title}</span> <span className="text-ops-dim">— {n.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
