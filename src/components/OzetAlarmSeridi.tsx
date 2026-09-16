import { useConsole } from '../store';
import { summaryAlarm } from '../engine/summary';

/**
 * Ozet modunun uyari seridi — sag sutunun ILK cocugu, ozet modu acikken HER
 * ZAMAN cizilir (alarm yoksa soluk bir satir). Boylece duzen yalnizca mod
 * degisince oynar; yeni bir alarm geldiginde ekran operatorun gozu onunde
 * yeniden duzenlenmez.
 *
 * Bindirme (absolute) degil, ayrilmis yuva: sag sutun konumlandirilmamis ve
 * arayuz olcegi > 1'de kayiyor; bindirme hem kayar hem de tam alarmin konusu
 * olan yeni seridin ustunu orterdi.
 *
 * `role="alert"` / `aria-live` YOK: AlarmAnnouncer her alarmi zaten assertive
 * duyuruyor, ikinci canli bolge ayni alarmi iki kez okuturdu.
 */

/** Siddet tonu — sinif adlari harfiyen: Tailwind birlestirilmis ad uretmez. */
const TONE = {
  2: { frame: 'border-ops-warn bg-ops-warn/15', text: 'text-ops-warn', label: 'orta şiddet' },
  3: { frame: 'border-ops-hard bg-ops-hard/15', text: 'text-ops-hard', label: 'yüksek şiddet' },
} as const;

const BTN = 'num text-[10px] tracking-[0.12em] uppercase px-2 py-[4px] border leading-none whitespace-nowrap shrink-0 transition-colors';

export default function OzetAlarmSeridi() {
  const sim = useConsole((s) => s.sim);
  const selectAlarm = useConsole((s) => s.selectAlarm);
  const setSummaryMode = useConsole((s) => s.setSummaryMode);
  useConsole((s) => s.version);

  const hit = summaryAlarm(sim.alarms);

  if (!hit) {
    return (
      <section aria-label="Onaysız alarm" className="panel h-[44px] shrink-0 flex items-center gap-2 px-3 text-[11px] text-ops-faint">
        <span className="text-ops-nominal leading-none">●</span>
        Onaysız orta/yüksek alarm yok
      </section>
    );
  }

  const a = hit.top;
  const sev = a.severity >= 3 ? 3 : 2;
  const tone = TONE[sev];

  return (
    <section
      // Kimlige anahtarli: yeni alarmda tek seferlik giris animasyonu. Yanip
      // sonen dongu yok; hareket azaltma acikken index.css animasyonu kapatir.
      key={a.id}
      aria-label="Onaysız alarm"
      className={'card-in h-[44px] shrink-0 flex items-center gap-3 px-3 border border-l-4 sev-pattern-' + sev + ' ' + tone.frame}
    >
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 whitespace-nowrap leading-[15px]">
          <span className={'num text-[13px] font-semibold ' + tone.text}>
            TM[{a.service[0]},{a.service[1]}]
          </span>
          <span className={'text-3xs tracking-[0.1em] ' + (a.source === 'AI_DERIVED' ? 'text-ops-ai' : tone.text)}>
            {a.source === 'AI_DERIVED' ? '◆ AI' : '▲ ST[12]'}
          </span>
          <span className={'text-3xs uppercase tracking-[0.14em] ' + tone.text}>{tone.label}</span>
          <span className="num text-[11px] text-ops-text">{a.utc.slice(0, 8)} UTC</span>
          {hit.count > 1 && <span className="num text-3xs text-ops-dim">+{hit.count - 1} onaysız</span>}
        </div>
        <div className="text-[12px] text-ops-text leading-[15px] truncate" title={a.text}>
          {a.text}
        </div>
      </div>
      <button
        onClick={() => selectAlarm(a)}
        title="Alarm detay penceresini aç"
        className={BTN + ' border-ops-line2 text-ops-text bg-ops-sunken hover:border-ops-text'}
      >
        Alarmı aç
      </button>
      <button
        onClick={() => setSummaryMode(false)}
        title="Özet modu kapat, tüm detayı göster (O)"
        className={BTN + ' ' + tone.frame + ' ' + tone.text + ' hover:brightness-125'}
      >
        Detaya geç (O)
      </button>
    </section>
  );
}
