import { useConsole } from '../store';
import { apidLabel, subsystemName } from '../engine/mib';
import { stateLabel } from '../engine/limitChecker';
import type { Alarm } from '../engine/types';

/**
 * Alarm kuyrugu — iki bagimsiz renk ekseni:
 *
 *   KAYNAK  (sol kenar + kaynak etiketi)  mor = AI turetilmis, yesil/amber/kirmizi = ST[12] limit
 *   SIDDET  (servis etiketi, siddet cubugu, kart zemini)  ESA-ADB 0..3 -> yesil / amber / turuncu / kirmizi
 *
 * Boylece kart okunmadan "kim soyluyor" ve "ne kadar ciddi" ayri ayri secilir.
 */

const SEVERITY = [
  { label: 'bilgi', text: 'text-ops-nominal', borderL: 'border-l-ops-nominal', bg: '', dot: 'bg-ops-nominal' },
  { label: 'düşük', text: 'text-ops-soft', borderL: 'border-l-ops-soft', bg: '', dot: 'bg-ops-soft' },
  { label: 'orta', text: 'text-ops-warn', borderL: 'border-l-ops-warn', bg: 'bg-ops-warn/[0.06]', dot: 'bg-ops-warn' },
  { label: 'yüksek', text: 'text-ops-hard', borderL: 'border-l-ops-hard', bg: 'bg-ops-hard/[0.09]', dot: 'bg-ops-hard' },
] as const;

function sev(a: Alarm) {
  return SEVERITY[Math.max(0, Math.min(3, a.severity))];
}

function source(a: Alarm): { border: string; label: string; text: string; glyph: string } {
  if (a.source === 'AI_DERIVED') {
    return { border: 'border-l-ops-ai', label: 'text-ops-ai', text: 'AI TÜRETİLMİŞ', glyph: '◆' };
  }
  const s = sev(a);
  return { border: s.borderL, label: s.text, text: 'ST[12] LİMİT', glyph: '▲' };
}

/** Dort bolmeli siddet cubugu: dolu bolme sayisi = siddet + 1. */
function SeverityBar({ a }: { a: Alarm }) {
  const s = sev(a);
  return (
    <span className="inline-flex items-end gap-[2px]" title={'şiddet ' + a.severity + ' · ' + s.label}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={'w-[4px] ' + (i <= a.severity ? s.dot : 'bg-ops-line2')}
          style={{ height: 4 + i * 2 }}
        />
      ))}
    </span>
  );
}

export default function AlarmQueue() {
  const sim = useConsole((s) => s.sim);
  const selected = useConsole((s) => s.selectedAlarmId);
  const selectAlarm = useConsole((s) => s.selectAlarm);
  useConsole((s) => s.version);

  const alarms = sim.alarms;
  const counts = [0, 0, 0, 0];
  let aiCount = 0;
  for (const a of alarms) {
    counts[Math.max(0, Math.min(3, a.severity))]++;
    if (a.source === 'AI_DERIVED') aiCount++;
  }

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Alarm kuyruğu</span>
        <span className="normal-case tracking-normal num flex items-center gap-2">
          {[3, 2, 1, 0].map((i) => (
            <span key={i} className={'flex items-center gap-1 ' + (counts[i] ? SEVERITY[i].text : 'text-ops-faint')}>
              <span className={'inline-block w-[6px] h-[6px] ' + (counts[i] ? SEVERITY[i].dot : 'bg-ops-line2')} />
              {counts[i]} {SEVERITY[i].label}
            </span>
          ))}
          <span className="text-ops-faint">·</span>
          <span className="text-ops-ai">◆ {aiCount} AI</span>
          <span className="text-ops-faint">▲ {alarms.length - aiCount} ST[12]</span>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {alarms.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-ops-faint">Alarm yok — tüm parametreler nominal.</div>
        )}
        {alarms.map((a) => {
          const src = source(a);
          const s = sev(a);
          const isSel = selected === a.id;
          return (
            <button
              key={a.id}
              onClick={() => selectAlarm(a.id)}
              title="Detay penceresini aç"
              aria-label={
                (a.source === 'AI_DERIVED' ? 'AI türetilmiş' : 'ST12 limit') + ' alarm, şiddet ' + s.label + ': ' + a.text
              }
              className={
                'card-in w-full text-left px-2 py-1.5 border-b border-ops-line border-l-[3px] ' +
                src.border +
                ' ' +
                s.bg +
                ' sev-pattern-' +
                Math.max(0, Math.min(3, a.severity)) +
                (a.source === 'AI_DERIVED' ? ' src-ai' : '') +
                (isSel ? ' bg-white/[0.045]' : ' hover:bg-white/[0.025]') +
                (a.acknowledged ? ' opacity-60' : '')
              }
            >
              <div className="flex items-center gap-2">
                <span className={'num text-[12px] font-semibold ' + s.text}>
                  TM[{a.service[0]},{a.service[1]}]
                </span>
                <SeverityBar a={a} />
                <span className={'text-3xs uppercase tracking-[0.1em] ' + s.text}>{s.label}</span>
                <span className="num text-[11px] text-ops-text ml-1">{a.utc}</span>
                <span className="num text-3xs text-ops-faint">OBT {a.obt}</span>
                {a.acknowledged && <span className="text-3xs text-ops-nominal">✓ ACK</span>}
                <span className={'ml-auto text-3xs tracking-[0.1em] ' + src.label}>
                  {src.glyph} {src.text}
                </span>
              </div>
              <div className={'text-[11px] mt-[3px] leading-snug ' + (a.severity >= 2 ? 'text-ops-text' : 'text-ops-dim')}>
                {a.text}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-3xs text-ops-faint mt-[3px]">
                <span className="num">APID {a.apid}</span>
                <span>{apidLabel(a.apid)}</span>
                <span className="num text-ops-dim">{a.pid}</span>
                <span>{subsystemName(a.subsystem)}</span>
                {a.model && <span className="text-ops-ai/80">model {a.model}</span>}
                {a.confidence !== undefined && (
                  <span className="text-ops-ai/80 num">güven {(a.confidence * 100).toFixed(0)}%</span>
                )}
                {a.transition && (
                  <span className="num">
                    {stateLabel(a.transition.from)} → {stateLabel(a.transition.to)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-2 py-1 border-t border-ops-line text-3xs text-ops-faint leading-snug flex flex-wrap gap-x-3">
        <span>karta tıkla → detay penceresi</span>
        <span>
          <span className="text-ops-ai">◆</span> AI türetilmiş · <span className="text-ops-dim">▲</span> ST[12] uçuş
          yazılımı limiti
        </span>
        <span>
          şiddet: <span className="text-ops-nominal">bilgi</span> · <span className="text-ops-soft">düşük</span> ·{' '}
          <span className="text-ops-warn">orta</span> · <span className="text-ops-hard">yüksek</span> ↔ TM[5,1..4]
        </span>
      </div>
    </section>
  );
}
