import { useEffect, useRef, useState } from 'react';
import { useConsole } from '../store';
import { beep } from '../ui/a11y';

/**
 * Görünmez aria-live bölgesi + isteğe bağlı sesli uyarı.
 * Yeni bir alarm kuyruğa düştüğünde ekran okuyucuya tek cümle okunur
 * (kaynak · şiddet · metin · UTC). WCAG 4.1.3 durum mesajları.
 */
const SEV = ['bilgi', 'düşük', 'orta', 'yüksek'];

export default function AlarmAnnouncer() {
  const sim = useConsole((s) => s.sim);
  const a11y = useConsole((s) => s.a11y);
  useConsole((s) => s.version);
  const lastId = useRef<number>(sim.alarms[0]?.id ?? 0);
  const [msg, setMsg] = useState('');

  // Uydu degisince yeni kuyrugun kimlik uzayi alakasizdir; sifirlanmazsa
  // her gecis o uydunun en son ESKI alarmini yeniymis gibi okur ve bipler.
  // Bu effect duyuru effect'inden ONCE tanimli olmali: ayni commit icinde
  // effect'ler tanim sirasiyla kosar.
  useEffect(() => {
    lastId.current = sim.alarms[0]?.id ?? 0;
  }, [sim]);

  useEffect(() => {
    const top = sim.alarms[0];
    if (!top || top.id === lastId.current) return;
    lastId.current = top.id;
    const sev = SEV[Math.max(0, Math.min(3, top.severity))];
    if (a11y.announceAlarms) {
      setMsg(
        (top.source === 'AI_DERIVED' ? 'AI türetilmiş alarm, ' : 'Limit alarmı, ') +
          'şiddet ' +
          sev +
          '. ' +
          top.text +
          '. Saat ' +
          top.utc.slice(0, 8) +
          ' UTC.',
      );
    }
    if (a11y.audioAlerts && top.severity >= 2) beep(top.severity);
  });

  return (
    <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
      {msg}
    </div>
  );
}
