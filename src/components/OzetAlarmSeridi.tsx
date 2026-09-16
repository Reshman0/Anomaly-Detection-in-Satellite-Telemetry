import { fleet, useConsole } from '../store';
import { summaryAlarm } from '../engine/summary';

/**
 * Ozet panosundaki durum kartinin alt satiri: secili uydunun en yeni ONAYSIZ
 * orta/yuksek alarmi. Satir HER ZAMAN ayni yukseklikte cizilir (alarm yoksa
 * sakin bir satir); yeni bir alarm geldiginde pano operatorun gozu onunde
 * yeniden duzenlenmez.
 *
 * Alarm yokken diger uydulardaki onaysiz alarmlar yazilir: bakilmayan
 * uydudaki anomali gozden kacmasin (ayrintisi filo kutucuklarinda).
 *
 * `role="alert"` / `aria-live` YOK: AlarmAnnouncer her alarmi zaten assertive
 * duyuruyor, ikinci canli bolge ayni alarmi iki kez okuturdu.
 */

/** Siddet tonu — sinif adlari harfiyen: Tailwind birlestirilmis ad uretmez. */
const TONE = {
  2: { frame: 'border-ops-warn bg-ops-warn/15', text: 'text-ops-warn', label: 'orta şiddet' },
  3: { frame: 'border-ops-hard bg-ops-hard/15', text: 'text-ops-hard', label: 'yüksek şiddet' },
} as const;

const BTN = 'num text-[10px] tracking-[0.12em] uppercase px-2 py-[5px] border leading-none whitespace-nowrap shrink-0 transition-colors';

export default function OzetAlarmSeridi() {
  const sim = useConsole((s) => s.sim);
  const selectedNorad = useConsole((s) => s.selectedNorad);
  const selectAlarm = useConsole((s) => s.selectAlarm);
  const setSummaryMode = useConsole((s) => s.setSummaryMode);
  useConsole((s) => s.version);

  const hit = summaryAlarm(sim.alarms);

  if (!hit) {
    let digerAlarm = 0;
    let digerUydu = 0;
    for (const s of fleet.summaries().values()) {
      if (s.norad === selectedNorad || s.unacked === 0) continue;
      digerAlarm += s.unacked;
      digerUydu++;
    }
    return (
      <div aria-label="Onaysız alarm" className="h-[40px] shrink-0 flex items-center gap-2 px-4 border-t border-ops-line text-[12px]">
        <span className="text-ops-nominal leading-none">✓</span>
        <span className="text-ops-dim">Bu uyduda onaysız orta/yüksek alarm yok</span>
        {digerAlarm > 0 ? (
          <span className="ml-auto text-[11px] text-ops-warn">
            ▲ diğer <span className="num">{digerUydu}</span> uyduda <span className="num">{digerAlarm}</span> onaysız alarm · filo
            kutucuklarına bakın
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-ops-faint">örneklenen diğer uydularda onaysız alarm yok</span>
        )}
      </div>
    );
  }

  const a = hit.top;
  const sev = a.severity >= 3 ? 3 : 2;
  const tone = TONE[sev];

  return (
    <div
      // Kimlige anahtarli: yeni alarmda tek seferlik giris animasyonu. Yanip
      // sonen dongu yok; hareket azaltma acikken index.css animasyonu kapatir.
      key={a.id}
      aria-label="Onaysız alarm"
      className={'card-in h-[40px] shrink-0 flex items-center gap-3 px-4 border-t border-l-4 sev-pattern-' + sev + ' ' + tone.frame}
    >
      <span className={'num text-[13px] font-semibold whitespace-nowrap ' + tone.text}>
        TM[{a.service[0]},{a.service[1]}]
      </span>
      <span className={'text-3xs tracking-[0.1em] whitespace-nowrap ' + (a.source === 'AI_DERIVED' ? 'text-ops-ai' : tone.text)}>
        {a.source === 'AI_DERIVED' ? '◆ AI' : '▲ ST[12]'}
      </span>
      <span className={'text-3xs uppercase tracking-[0.14em] whitespace-nowrap ' + tone.text}>{tone.label}</span>
      <span className="num text-[11px] text-ops-text whitespace-nowrap">{a.utc.slice(0, 8)} UTC</span>
      <span className="flex-1 min-w-0 text-[12px] text-ops-text truncate" title={a.text}>
        {a.text}
      </span>
      {hit.count > 1 && <span className="num text-3xs text-ops-dim whitespace-nowrap">+{hit.count - 1} onaysız</span>}
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
    </div>
  );
}
