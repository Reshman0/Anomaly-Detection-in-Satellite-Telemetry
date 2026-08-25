import { useConsole } from '../store';
import { PARAMETERS } from '../engine/mib';
import { isHard, isSoft, stateLabel, worstState } from '../engine/limitChecker';
import { stateTextClass } from '../ui/colors';
import type { LimitState } from '../engine/types';

function aiLabel(s: LimitState): string {
  if (isHard(s)) return 'ALARM';
  if (isSoft(s)) return 'İZLEME';
  return 'NOMİNAL';
}

export default function StatusBand() {
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);

  const states = sim.snapshot().states;
  const onboard = PARAMETERS.filter((p) => !p.derived);
  const derived = PARAMETERS.filter((p) => p.derived);

  const limitState = worstState(onboard.map((p) => states.get(p.pid) ?? 'NOMINAL'));
  const aiState = worstState(derived.map((p) => states.get(p.pid) ?? 'NOMINAL'));

  const offenders = onboard.filter((p) => (states.get(p.pid) ?? 'NOMINAL') !== 'NOMINAL');
  const aiOffenders = derived.filter((p) => (states.get(p.pid) ?? 'NOMINAL') !== 'NOMINAL');
  const contrast = limitState === 'NOMINAL' && aiState !== 'NOMINAL';

  const peak = derived
    .map((p) => {
      const buf = sim.buffers.get(p.pid)!;
      return { p, v: buf.length ? buf[buf.length - 1].eng : 0 };
    })
    .sort((a, b) => b.v - a.v)[0];

  return (
    <section className="panel shrink-0">
      <div className="panel-title">Durum</div>
      <div className="grid grid-cols-2">
        <div className="px-3 py-2 border-r border-ops-line">
          <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">
            ST[12] ON-BOARD MONITORING · sabit limit
          </div>
          <div className={'num text-[26px] leading-tight mt-1 ' + stateTextClass(limitState)}>
            {stateLabel(limitState)}
          </div>
          <div className="text-[11px] text-ops-dim mt-0.5 h-[15px] truncate">
            {offenders.length > 0
              ? offenders.map((p) => p.pid + ' ' + stateLabel(states.get(p.pid)!)).join(' · ')
              : onboard.length + ' parametre limit içinde'}
          </div>
        </div>

        <div className={'px-3 py-2 ' + (contrast ? 'bg-ops-ai/[0.07]' : '')}>
          <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">
            AI tespiti · yer türetilmiş parametre
          </div>
          <div
            className={
              'num text-[26px] leading-tight mt-1 ' + (aiState === 'NOMINAL' ? 'text-ops-nominal' : 'text-ops-ai')
            }
          >
            {aiLabel(aiState)}
            {contrast && <span className="text-ops-ai text-[12px] ml-3 tracking-[0.16em] align-middle">← KONTRAST</span>}
          </div>
          <div className="text-[11px] text-ops-dim mt-0.5 h-[15px] truncate">
            {aiOffenders.length > 0
              ? aiOffenders.map((p) => p.pid + ' ' + stateLabel(states.get(p.pid)!)).join(' · ')
              : peak
                ? 'en yüksek skor ' + peak.p.pid + ' ' + peak.v.toFixed(2) + ' σ · eşik 3.0 σ'
                : '—'}
          </div>
        </div>
      </div>
    </section>
  );
}
