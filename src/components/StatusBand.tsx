import { useConsole } from '../store';
import { PARAMETERS } from '../engine/mib';
import { isHard, isSoft, stateLabel, worstState } from '../engine/limitChecker';
import { stateTextClass } from '../ui/colors';
import type { LimitState } from '../engine/types';

/** `AI_SCORE_SS3` -> `alt sistem 3`: ekranda parametre kodu yerine duz ad. */
function friendlyPid(pid: string): string {
  const m = /^AI_SCORE_SS(\d+)$/.exec(pid);
  return m ? 'alt sistem ' + m[1] : pid;
}

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

  const falseAlarms = sim.falseAlarms;
  const nominalSpan =
    sim.nominalSeconds < 60
      ? Math.floor(sim.nominalSeconds) + ' saniyelik'
      : Math.floor(sim.nominalSeconds / 60) + ' dakikalık';

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
          <div className="text-[12px] uppercase tracking-[0.14em] text-ops-faint">
            Uçuş yazılımı · sabit limit kontrolü
          </div>
          <div className={'num text-[34px] font-semibold leading-tight mt-1 ' + stateTextClass(limitState)}>
            {stateLabel(limitState)}
          </div>
          <div className="text-[13px] leading-[17px] text-ops-dim mt-1 h-[17px] truncate">
            {offenders.length > 0
              ? offenders.map((p) => p.pid + ' · ' + stateLabel(states.get(p.pid)!)).join(' · ')
              : onboard.length + ' parametre limit içinde kalıyor'}
          </div>
        </div>

        <div className={'px-3 py-2 ' + (contrast ? 'bg-ops-ai/[0.07]' : '')}>
          <div className="text-[12px] uppercase tracking-[0.14em] text-ops-faint">
            Yapay zeka tespiti
          </div>
          <div
            className={
              'num text-[34px] font-semibold leading-tight mt-1 ' +
              (aiState === 'NOMINAL' ? 'text-ops-nominal' : 'text-ops-ai')
            }
          >
            {aiLabel(aiState)}
            {contrast && (
              <span className="text-ops-ai text-[15px] font-semibold ml-3 tracking-[0.14em] align-middle">
                ← KONTRAST
              </span>
            )}
          </div>
          <div className="text-[13px] leading-[17px] text-ops-dim mt-1 h-[17px] truncate">
            {aiOffenders.length > 0
              ? aiOffenders.map((p) => friendlyPid(p.pid) + ' · ' + stateLabel(states.get(p.pid)!)).join(' · ')
              : peak
                ? 'en yüksek sapma ' + peak.v.toFixed(2).replace('.', ',') + ' · alarm eşiği 3,00'
                : '—'}
          </div>
        </div>
      </div>

      {/*
        Yanlis alarm sayaci: hikayenin "ustelik yanlis alarm uretmeden" maddesi.
        Deger iddia degil olcumdur — motor, hicbir anomali enjekte edilmemisken
        bir AI skorunun esigi asmasini sayar. Dipnot, bildirideki sifir yanlis
        alarm sonucunun 300 s'lik alan bilgisi kuraliyla elde edildigini
        gizlemez (brief §1.7 durustluk notu).
      */}
      <div className="border-t border-ops-line px-3 py-1 flex items-baseline gap-3">
        <span className="text-3xs uppercase tracking-[0.16em] text-ops-faint">Yanlış alarm</span>
        <span className={'num text-[16px] leading-none ' + (falseAlarms === 0 ? 'text-ops-nominal' : 'text-ops-soft')}>
          {falseAlarms}
        </span>
        <span className="text-[11px] text-ops-dim">
          {nominalSpan} nominal akış boyunca
        </span>
        <span className="flex-1" />
        <span className="text-3xs text-ops-faint text-right leading-tight max-w-[52%]">
          Bildirideki sıfır yanlış alarm sonucu, alarmdan sonra 300 saniyelik alan bilgisi
          kuralını uyguladıktan sonra çıktı.
        </span>
      </div>
    </section>
  );
}
