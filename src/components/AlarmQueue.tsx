import { useConsole } from '../store';
import { apidLabel, subsystemName } from '../engine/mib';
import { stateLabel } from '../engine/limitChecker';
import type { Alarm } from '../engine/types';

const SEVERITY_TEXT = ['bilgilendirici', 'düşük', 'orta', 'yüksek'];

function accent(a: Alarm): { border: string; label: string; text: string } {
  if (a.source === 'AI_DERIVED') {
    return { border: 'border-l-ops-ai', label: 'text-ops-ai', text: 'AI TÜRETİLMİŞ' };
  }
  const hard = a.severity >= 3;
  return {
    border: hard ? 'border-l-ops-hard' : a.severity >= 1 ? 'border-l-ops-soft' : 'border-l-ops-nominal',
    label: hard ? 'text-ops-hard' : a.severity >= 1 ? 'text-ops-soft' : 'text-ops-nominal',
    text: 'ST[12] LİMİT',
  };
}

export default function AlarmQueue() {
  const sim = useConsole((s) => s.sim);
  const selected = useConsole((s) => s.selectedAlarmId);
  const selectAlarm = useConsole((s) => s.selectAlarm);
  useConsole((s) => s.version);

  const alarms = sim.alarms;

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Alarm kuyruğu</span>
        <span className="normal-case tracking-normal text-ops-faint num">{alarms.length} kayıt</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {alarms.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-ops-faint">Alarm yok — tüm parametreler nominal.</div>
        )}
        {alarms.map((a) => {
          const ac = accent(a);
          const isSel = selected === a.id;
          return (
            <button
              key={a.id}
              onClick={() => selectAlarm(isSel ? null : a.id)}
              className={
                'card-in w-full text-left px-2 py-1.5 border-b border-ops-line border-l-2 ' +
                ac.border +
                (isSel ? ' bg-white/[0.045]' : ' hover:bg-white/[0.025]')
              }
            >
              <div className="flex items-center gap-2">
                <span className={'num text-[12px] ' + ac.label}>
                  TM[{a.service[0]},{a.service[1]}]
                </span>
                <span className="num text-[11px] text-ops-text">{a.utc}</span>
                <span className="num text-3xs text-ops-faint">OBT {a.obt}</span>
                <span className={'ml-auto text-3xs tracking-[0.1em] ' + ac.label}>{ac.text}</span>
              </div>
              <div className="text-[11px] text-ops-text mt-[3px] leading-snug">{a.text}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-3xs text-ops-faint mt-[3px]">
                <span className="num">APID {a.apid}</span>
                <span>{apidLabel(a.apid)}</span>
                <span className="num">{a.pid}</span>
                <span>{subsystemName(a.subsystem)}</span>
                <span>
                  şiddet {a.severity} · {SEVERITY_TEXT[a.severity] ?? '—'}
                </span>
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
      <div className="px-2 py-1 border-t border-ops-line text-3xs text-ops-faint leading-snug">
        ST[12] kartları uçuş yazılımının limit kontrolünden; AI türetilmiş kartlar yer segmentinde üretilen ST[05]
        eşdeğer bildirimlerdir (APID 200 indirilmez).
      </div>
    </section>
  );
}
