import { useEffect, useRef, useState } from 'react';
import { useConsole } from '../store';
import { MIB, apidLabel, param, subsystemName } from '../engine/mib';
import { evaluate, stateLabel } from '../engine/limitChecker';
import { fmtTime } from '../engine/missionClock';
import { COLOR, alpha, stateHex } from '../ui/colors';
import { buildDossier, type DossierRow } from '../engine/alarmInfo';
import type { Alarm, Sample } from '../engine/types';

/**
 * Alarm detay penceresi — kuyruktaki karta tiklaninca acilir. Uc sekme:
 *   OZET      zaman · kaynak · parametre baglami (MIB + alarm aninin mini seridi)
 *             · alarmi tasiyan TM paketi · iliskili XAI kaniti
 *   STANDART  ECSS-E-ST-70-41C alanlari (TM[5,x] / TM[12,12]), PMON tanimi,
 *             OOL bilgisi (ECSS-E-ST-70-11C)
 *   EYLEM     operasyonel sonuc, prosedur (FOP, ECSS-E-ST-70-32C bicimi),
 *             iliskili parametreler, ESA-ADB siniflandirmasi
 * Baslikta alarm yasam dongusu (yukseltildi → onay → temizlendi). Onay (ACK)
 * yalnizca operator kaydidir. Esc ya da disina tiklama kapatir.
 */

type DetailTab = 'OZET' | 'STANDART' | 'EYLEM';

const TONE_CLS: Record<NonNullable<DossierRow['tone']>, string> = {
  nominal: 'text-ops-nominal',
  soft: 'text-ops-soft',
  warn: 'text-ops-warn',
  hard: 'text-ops-hard',
  ai: 'text-ops-ai',
  dim: 'text-ops-dim',
};

function DRow({ r }: { r: DossierRow }) {
  return (
    <div className="flex justify-between gap-3 text-[11px] leading-[16px] py-[1px]">
      <span className="text-ops-faint shrink-0">
        {r.k}
        {r.ref && <span className="block text-[8px] leading-[10px] text-ops-faint/70 tracking-[0.06em]">{r.ref}</span>}
      </span>
      <span className={'text-right ' + (r.tone ? TONE_CLS[r.tone] : 'text-ops-text')}>{r.v}</span>
    </div>
  );
}

function DSection({ title, rows }: { title: string; rows: DossierRow[] }) {
  return (
    <div className="mb-3">
      <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">{title}</div>
      {rows.map((r, i) => (
        <DRow key={i} r={r} />
      ))}
    </div>
  );
}

const URGENCY_CLS = { izle: 'border-ops-nominal text-ops-nominal', planlı: 'border-ops-soft text-ops-soft', acil: 'border-ops-hard text-ops-hard' } as const;

const SEVERITY_TEXT = ['bilgi', 'düşük', 'orta', 'yüksek'];
const SEV_CLS = ['text-ops-nominal', 'text-ops-soft', 'text-ops-warn', 'text-ops-hard'];
const CONTEXT_BEFORE_S = 90;
const CONTEXT_AFTER_S = 30;

function drawContext(cv: HTMLCanvasElement, pid: string, buf: Sample[], alarmT: number): boolean {
  const p = param(pid);
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (w === 0 || h === 0) return false;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext('2d');
  if (!g) return false;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = COLOR.sunken;
  g.fillRect(0, 0, w, h);

  const t0 = alarmT - CONTEXT_BEFORE_S;
  const t1 = alarmT + CONTEXT_AFTER_S;
  const win = buf.filter((s) => s.t >= t0 && s.t <= t1);
  if (win.length < 2) return false;

  const l = p.limits;
  const hi = l.hard_high ?? Math.max(...win.map((s) => s.eng)) + 1;
  const lo = l.hard_low ?? Math.min(0, ...win.map((s) => s.eng)) - 0.5;
  const pad = (hi - lo) * 0.12;
  const yLo = lo - pad;
  const yHi = hi + pad;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const Y = (v: number) => h - ((v - yLo) / (yHi - yLo)) * h;

  if (l.hard_high !== undefined) {
    g.fillStyle = alpha(COLOR.hard, 0.1);
    g.fillRect(0, 0, w, Math.max(0, Y(l.hard_high)));
  }
  if (l.hard_low !== undefined) {
    g.fillStyle = alpha(COLOR.hard, 0.1);
    g.fillRect(0, Y(l.hard_low), w, h - Y(l.hard_low));
  }
  if (l.soft_high !== undefined && l.hard_high !== undefined) {
    g.fillStyle = alpha(COLOR.soft, 0.09);
    g.fillRect(0, Y(l.hard_high), w, Y(l.soft_high) - Y(l.hard_high));
  }
  if (l.soft_low !== undefined && l.hard_low !== undefined) {
    g.fillStyle = alpha(COLOR.soft, 0.09);
    g.fillRect(0, Y(l.soft_low), w, Y(l.hard_low) - Y(l.soft_low));
  }
  g.setLineDash([3, 3]);
  g.lineWidth = 1;
  for (const [v, c] of [
    [l.soft_high, COLOR.soft],
    [l.soft_low, COLOR.soft],
    [l.hard_high, COLOR.hard],
    [l.hard_low, COLOR.hard],
  ] as [number | undefined, string][]) {
    if (v === undefined) continue;
    g.strokeStyle = alpha(c, 0.5);
    g.beginPath();
    g.moveTo(0, Math.round(Y(v)) + 0.5);
    g.lineTo(w, Math.round(Y(v)) + 0.5);
    g.stroke();
  }
  g.setLineDash([]);

  // Alarm ani
  g.strokeStyle = alpha(COLOR.text, 0.8);
  g.lineWidth = 1.2;
  g.setLineDash([4, 3]);
  g.beginPath();
  g.moveTo(Math.round(X(alarmT)) + 0.5, 0);
  g.lineTo(Math.round(X(alarmT)) + 0.5, h);
  g.stroke();
  g.setLineDash([]);

  // Iz, orneklem durumuna gore renkli parcalar
  g.lineWidth = 1.4;
  g.lineJoin = 'round';
  for (let i = 1; i < win.length; i++) {
    g.strokeStyle = stateHex(evaluate(p, win[i].eng));
    g.beginPath();
    g.moveTo(X(win[i - 1].t), Y(win[i - 1].eng));
    g.lineTo(X(win[i].t), Y(win[i].eng));
    g.stroke();
  }
  g.font = '9px Consolas, monospace';
  g.fillStyle = COLOR.faint;
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.fillText('−' + CONTEXT_BEFORE_S + ' s', 3, 2);
  g.textAlign = 'right';
  g.fillText('+' + CONTEXT_AFTER_S + ' s', w - 3, 2);
  g.textAlign = 'center';
  g.fillText('alarm', X(alarmT), h - 12);
  return true;
}

function Row({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) {
  return (
    <div className="flex justify-between gap-3 text-[11px] leading-[16px]">
      <span className="text-ops-faint shrink-0">{k}</span>
      <span className={'num text-right truncate ' + (cls ?? 'text-ops-text')}>{v}</span>
    </div>
  );
}

export default function AlarmDetail() {
  const sim = useConsole((s) => s.sim);
  const selectedId = useConsole((s) => s.selectedAlarmId);
  const selectAlarm = useConsole((s) => s.selectAlarm);
  const ackAlarm = useConsole((s) => s.ackAlarm);
  const setPacketOpen = useConsole((s) => s.setPacketOpen);
  useConsole((s) => s.version);

  const alarm: Alarm | undefined = selectedId === null ? undefined : sim.alarms.find((a) => a.id === selectedId);
  const cvRef = useRef<HTMLCanvasElement>(null);
  // Ref degil state: cizim basarisi yeniden cizimi tetiklemeli, yoksa
  // "tampon disinda" uyarisi dolu bir seridin ustunde asili kalir.
  const [hasContext, setHasContext] = useState(false);
  const [tab, setTab] = useState<DetailTab>('OZET');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectAlarm(null);
    };
    if (alarm) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alarm, selectAlarm]);

  useEffect(() => {
    if (!alarm || !cvRef.current) return;
    const ok = drawContext(cvRef.current, alarm.pid, sim.buffers.get(alarm.pid) ?? [], alarm.missionT);
    setHasContext((prev) => (prev === ok ? prev : ok));
  });

  // Yeni alarm acilinca ozet sekmesine don.
  useEffect(() => {
    setTab('OZET');
  }, [selectedId]);

  if (!alarm) return null;
  const dossier = buildDossier(alarm, sim);

  const p = param(alarm.pid);
  const buf = sim.buffers.get(alarm.pid) ?? [];
  const last = buf[buf.length - 1];
  const nowState = last ? evaluate(p, last.eng) : 'NOMINAL';
  const sevCls = SEV_CLS[Math.max(0, Math.min(3, alarm.severity))];
  const isAi = alarm.source === 'AI_DERIVED';
  const startT = sim.scenarioStartT;
  const epochMs = Date.parse(MIB.epoch);
  const evidence = sim.xai.filter((e) => e.missionT <= alarm.missionT + 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={() => selectAlarm(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Alarm detayı"
        onClick={(e) => e.stopPropagation()}
        className="card-in w-[960px] max-w-[96vw] h-[600px] max-h-[88vh] bg-ops-panel border border-ops-line2 shadow-2xl flex flex-col"
      >
        {/* Baslik */}
        <div className={'flex items-center gap-3 px-3 py-2 border-b border-ops-line2 border-l-4 ' + (isAi ? 'border-l-ops-ai' : 'border-l-ops-hard')}>
          <span className={'num text-[15px] font-semibold ' + sevCls}>
            TM[{alarm.service[0]},{alarm.service[1]}]
          </span>
          <span className={'text-3xs uppercase tracking-[0.12em] ' + sevCls}>
            şiddet {alarm.severity} · {SEVERITY_TEXT[alarm.severity] ?? '—'}
          </span>
          <span className={'text-3xs tracking-[0.12em] ' + (isAi ? 'text-ops-ai' : 'text-ops-hard')}>
            {isAi ? '◆ AI TÜRETİLMİŞ' : '▲ ST[12] LİMİT'}
          </span>
          {alarm.acknowledged && <span className="text-3xs tracking-[0.12em] text-ops-nominal border border-ops-nominal px-1">✓ ONAYLANDI</span>}
          <span className="ml-auto text-3xs text-ops-faint num">alarm #{alarm.id}</span>
          <button onClick={() => selectAlarm(null)} className="text-ops-dim hover:text-ops-text text-[13px] leading-none px-1" title="Kapat (Esc)">
            ✕
          </button>
        </div>

        <div className="px-3 py-2 text-[12px] text-ops-text leading-snug border-b border-ops-line">{alarm.text}</div>

        {/* Yasam dongusu seridi + sekmeler */}
        <div className="flex items-center gap-2 px-3 py-1 border-b border-ops-line bg-ops-sunken">
          <span className="text-3xs uppercase tracking-[0.14em] text-ops-faint">Yaşam döngüsü</span>
          {[
            { label: 'YÜKSELTİLDİ', on: true, cls: 'text-ops-text' },
            { label: 'ONAY', on: dossier.lifecycle.acknowledged, cls: 'text-ops-nominal' },
            { label: dossier.lifecycle.state === 'BİLGİ' ? 'BİLGİ' : 'TEMİZLENDİ', on: dossier.lifecycle.state !== 'AKTİF', cls: dossier.lifecycle.state === 'AKTİF' ? 'text-ops-hard' : 'text-ops-nominal' },
          ].map((step, i) => (
            <span key={i} className="flex items-center gap-1 num text-3xs tracking-[0.1em]">
              {i > 0 && <span className="text-ops-faint">→</span>}
              <span className={'inline-block w-[6px] h-[6px] ' + (step.on ? 'bg-current' : 'border border-ops-line2')} />
              <span className={step.on ? step.cls : 'text-ops-faint'}>{step.label}</span>
            </span>
          ))}
          <span className={'num text-3xs ml-2 ' + TONE_CLS[dossier.lifecycle.stateTone]}>{dossier.lifecycle.state}</span>
          <span className="num text-3xs text-ops-faint">· yaş {dossier.lifecycle.rows[2].v}</span>
          <span className={'ml-auto num text-3xs px-1.5 border ' + URGENCY_CLS[dossier.procedure.urgency]}>
            {dossier.procedure.urgency.toUpperCase()} · {dossier.procedure.id}
          </span>
          <div className="flex gap-[3px] ml-2" role="tablist" aria-label="Alarm detay sekmeleri">
            {(['OZET', 'STANDART', 'EYLEM'] as DetailTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={
                  'num text-2xs px-[8px] py-[2px] border tracking-[0.08em] ' +
                  (tab === t ? 'border-ops-text text-ops-text bg-ops-panel' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
                }
              >
                {t === 'OZET' ? 'ÖZET' : t === 'STANDART' ? 'STANDART ALANLAR' : 'OPERATÖR EYLEMİ'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'STANDART' && (
          <div className="grid grid-cols-3 gap-px flex-1 min-h-0 overflow-hidden">
            <div className="px-3 py-2 border-r border-ops-line overflow-y-auto">
              <DSection title={dossier.pus.title} rows={dossier.pus.rows} />
              <DSection title="Sınıflandırma · ESA-ADB" rows={dossier.classification} />
            </div>
            <div className="px-3 py-2 border-r border-ops-line overflow-y-auto">
              {dossier.monitoring ? (
                <DSection title={dossier.monitoring.title} rows={dossier.monitoring.rows} />
              ) : (
                <div className="mb-3">
                  <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">PMON tanımı</div>
                  <div className="text-3xs text-ops-faint leading-snug">
                    Yer türetilmiş parametre: on-board izleme tanımı (PMON) yoktur. Eşikler yer segmentinde, MIB'deki türetilmiş parametre kaydında tutulur.
                  </div>
                </div>
              )}
              <DSection title="Yaşam döngüsü" rows={dossier.lifecycle.rows} />
            </div>
            <div className="px-3 py-2 overflow-y-auto">
              {dossier.ool && <DSection title={dossier.ool.title} rows={dossier.ool.rows} />}
              <div className="text-3xs text-ops-faint leading-snug mt-2 border-t border-ops-line pt-2">
                Alan adları ECSS-E-ST-70-41C PUS-C sözlüğüne göredir; değerler konsolun kendi MIB ve tamponundan hesaplanır. ST[12] durum adları:
                WITHIN LIMITS · BELOW LOW LIMIT · ABOVE HIGH LIMIT.
              </div>
            </div>
          </div>
        )}

        {tab === 'EYLEM' && (
          <div className="grid grid-cols-[1.2fr_1fr] gap-px flex-1 min-h-0 overflow-hidden">
            <div className="px-3 py-2 border-r border-ops-line overflow-y-auto">
              <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">Prosedür · ECSS-E-ST-70-32C biçimi</div>
              <div className="flex items-center gap-2 mb-1">
                <span className="num text-[12px] text-ops-text">{dossier.procedure.id}</span>
                <span className={'num text-3xs px-1.5 border ' + URGENCY_CLS[dossier.procedure.urgency]}>{dossier.procedure.urgency.toUpperCase()}</span>
              </div>
              <div className="text-[12px] text-ops-text leading-snug">{dossier.procedure.title}</div>
              <div className={'text-[11px] leading-snug mt-1 ' + TONE_CLS[dossier.procedure.urgency === 'acil' ? 'hard' : dossier.procedure.urgency === 'planlı' ? 'soft' : 'nominal']}>
                {dossier.procedure.action}
              </div>
              <ol className="mt-2 text-[11px] text-ops-dim leading-snug list-decimal pl-5 space-y-[3px]">
                {dossier.procedure.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <div className="text-3xs text-ops-faint mt-2 leading-snug">Kaynak: {dossier.procedure.source}. Konsol komut göndermez; adımlar operatör içindir.</div>

              <div className="mt-3">
                <DSection title={dossier.operability.title} rows={dossier.operability.rows} />
              </div>
            </div>
            <div className="px-3 py-2 overflow-y-auto">
              <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">İlişkili parametreler · {dossier.operability.rows[0].v.split(' · ')[0]}</div>
              {dossier.related.map((r) => (
                <div key={r.pid} className={'flex items-center gap-2 text-[11px] leading-[18px] ' + (r.isTarget ? 'bg-white/[0.04] -mx-1 px-1' : '')}>
                  <span className={'num w-[100px] ' + (r.isTarget ? 'text-ops-text' : 'text-ops-dim')}>{r.pid}</span>
                  <span className="num text-ops-text w-[80px] text-right">{r.eng === null ? '—' : (r.eng >= 0 ? '+' : '') + r.eng.toFixed(3)}</span>
                  <span className={'num text-3xs ' + (r.state === 'NOMINAL' ? 'text-ops-nominal' : r.state.startsWith('HARD') ? 'text-ops-hard' : 'text-ops-soft')}>{stateLabel(r.state)}</span>
                  {r.isTarget && <span className="text-3xs text-ops-faint ml-auto">alarm kanalı</span>}
                </div>
              ))}
              <div className="text-3xs text-ops-faint leading-snug mt-2">
                Aynı alt sistemin kanalları ve AI skoru — tek kanal mı, alt sistem geneli mi sorusu için (ECSS-E-ST-70-11C: alarm bağlamı).
              </div>
              <div className="mt-3">
                <DSection title="Sınıflandırma" rows={dossier.classification} />
              </div>
            </div>
          </div>
        )}

        <div className={'grid grid-cols-[1fr_1fr_1.3fr] gap-px flex-1 min-h-0 overflow-hidden' + (tab === 'OZET' ? '' : ' hidden')}>
          {/* Zaman + kaynak */}
          <div className="px-3 py-2 border-r border-ops-line overflow-y-auto">
            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">Zaman</div>
            <Row k="UTC" v={alarm.utc} />
            <Row k="OBT" v={alarm.obt} cls="text-ops-dim" />
            <Row k="Görev saati" v={'t = ' + alarm.missionT.toFixed(0) + ' s'} cls="text-ops-dim" />
            {startT !== null && <Row k="Senaryo göreli" v={'t+' + Math.round(alarm.missionT - startT) + ' s'} cls="text-ops-dim" />}

            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mt-3 mb-1">Kaynak</div>
            <Row k="APID" v={alarm.apid + ' · ' + apidLabel(alarm.apid)} />
            <Row k="Parametre" v={alarm.pid} />
            <Row k="Alt sistem" v={alarm.subsystem + ' · ' + subsystemName(alarm.subsystem)} cls="text-ops-dim" />
            {alarm.model && <Row k="Model" v={alarm.model} cls="text-ops-ai" />}
            {alarm.confidence !== undefined && <Row k="Güven" v={(alarm.confidence * 100).toFixed(0) + '%'} cls="text-ops-ai" />}
            {alarm.transition && (
              <Row k="Geçiş" v={stateLabel(alarm.transition.from) + ' → ' + stateLabel(alarm.transition.to)} cls={SEV_CLS[alarm.severity]} />
            )}
            {isAi && (
              <div className="text-3xs text-ops-faint leading-snug mt-2">
                Yer segmentinde üretilen ST[05] eşdeğer bildirim; APID {alarm.apid} indirilmez.
              </div>
            )}
          </div>

          {/* Parametre baglami */}
          <div className="px-3 py-2 border-r border-ops-line overflow-y-auto">
            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">Parametre · MIB</div>
            <Row k="Açıklama" v={p.description} cls="text-ops-dim" />
            <Row k="Birim" v={p.eng_unit} cls="text-ops-dim" />
            {p.calibration && <Row k="Kalibrasyon" v={'eng = ' + p.calibration.a + '·raw ' + (p.calibration.b >= 0 ? '+ ' : '− ') + Math.abs(p.calibration.b)} cls="text-ops-dim" />}
            <Row k="Yumuşak limit" v={(p.limits.soft_low ?? '—') + ' … ' + (p.limits.soft_high ?? '—')} cls="text-ops-soft" />
            <Row k="Sert limit" v={(p.limits.hard_low ?? '—') + ' … ' + (p.limits.hard_high ?? '—')} cls="text-ops-hard" />
            <Row k="Örnekleme" v={p.sampling_period_s + ' s'} cls="text-ops-dim" />
            {p.derived && <Row k="Kaynak" v={'GND türetilmiş · ' + p.source_model} cls="text-ops-ai" />}

            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mt-3 mb-1">Şu an</div>
            <Row k="Değer" v={last ? (last.eng >= 0 ? '+' : '') + last.eng.toFixed(3) + ' ' + p.eng_unit : '—'} />
            <Row k="Durum" v={stateLabel(nowState)} cls={nowState === 'NOMINAL' ? 'text-ops-nominal' : nowState.startsWith('HARD') ? 'text-ops-hard' : 'text-ops-soft'} />

            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mt-3 mb-1">
              Alarm anı bağlamı · −{CONTEXT_BEFORE_S} / +{CONTEXT_AFTER_S} s
            </div>
            <div className="relative h-[96px] border border-ops-line">
              <canvas ref={cvRef} className="absolute inset-0 w-full h-full" />
              {!hasContext && (
                <div className="absolute inset-0 flex items-center justify-center text-3xs text-ops-faint">tampon dışında (10 dk pencere)</div>
              )}
            </div>
          </div>

          {/* Paket + kanit */}
          <div className="px-3 py-2 overflow-y-auto">
            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1 flex items-center">
              Taşıyan paket
              <button
                onClick={() => setPacketOpen(true)}
                className="ml-auto normal-case tracking-normal num text-3xs px-1.5 border border-ops-line2 text-ops-dim hover:text-ops-text"
                title="Paket denetleyici penceresini aç (canlı akış)"
              >
                denetleyici ↗
              </button>
            </div>
            {alarm.packet ? (
              <>
                <div className="num text-[11px] text-ops-nominal">{alarm.packet.label}</div>
                <div className="num text-[10px] text-ops-dim leading-[15px] break-all mt-1 max-h-[48px] overflow-hidden">{alarm.packet.hex}</div>
                <div className="flex flex-wrap gap-x-2 gap-y-[2px] mt-1">
                  {alarm.packet.fields
                    .filter((f) => f.group === 'data' || f.name === 'Packet Sequence Count' || f.name === 'Service Type' || f.name === 'Message Subtype')
                    .map((f, i) => (
                      <span key={i} className="text-3xs text-ops-faint">
                        {f.name} <span className="num text-ops-dim">{f.value}</span>
                      </span>
                    ))}
                </div>
              </>
            ) : (
              <div className="text-3xs text-ops-faint">Yer tarafı hesap (CUSUM); indirilen paket yok.</div>
            )}

            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mt-3 mb-1">İlişkili XAI kanıtı</div>
            {evidence.length === 0 ? (
              <div className="text-3xs text-ops-faint">Bu alarm anında yüklü kanıt yok.</div>
            ) : (
              evidence.map((e) => (
                <div key={e.level} className="text-[11px] text-ops-dim leading-snug">
                  <span className="text-ops-ai num">S{e.level}</span> {e.caption} · <span className="num">{e.top_channels.join(', ')}</span>
                  <span className="text-ops-faint"> · {fmtTime(epochMs + e.missionT * 1000)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border-t border-ops-line2">
          <span className="text-3xs text-ops-faint">Esc kapatır · onay yalnızca operatör kaydıdır, uyduya komut gönderilmez</span>
          <button
            onClick={() => ackAlarm(alarm.id)}
            disabled={!!alarm.acknowledged}
            className={
              'ml-auto num text-2xs px-3 py-[3px] border tracking-[0.1em] transition-colors ' +
              (alarm.acknowledged ? 'border-ops-line2 text-ops-faint' : 'border-ops-nominal text-ops-nominal hover:bg-ops-nominal/10')
            }
          >
            {alarm.acknowledged ? '✓ ONAYLANDI' : 'ONAYLA (ACK)'}
          </button>
          <button onClick={() => selectAlarm(null)} className="num text-2xs px-3 py-[3px] border border-ops-line2 text-ops-dim hover:text-ops-text">
            KAPAT
          </button>
        </div>
      </div>
    </div>
  );
}
