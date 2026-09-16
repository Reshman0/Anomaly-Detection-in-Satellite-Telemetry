import { PARAMETERS } from './mib';
import type { Simulation } from './simulation';
import type { Alarm } from './types';

/**
 * Ozet modu — hangi bilginin "kritik" sayilacagi.
 *
 * Bu dosya bilerek saftir: DOM'a ve store'a dokunmaz, testler
 * `environment: 'node'` altinda gercek `Simulation` kosulariyla calisir.
 *
 * Ilke (havacilik/uzay operasyonlarindaki "dark cockpit"): nominalde ekran
 * sessiz, sapmada parlak. Telemetri seridi yalnizca bir sey soyluyorsa cizilir.
 */

/**
 * ST[12] gecisinden sonra seridin ekranda kalma suresi (gorev saniyesi).
 * Senaryo suresine (90 s) esittir: nokta anomalisinde ch_11 runner bittikten
 * hemen sonra ekrandan cekilir.
 */
export const SUMMARY_HOLD_S = 90;

const DERIVED = new Set(PARAMETERS.filter((p) => p.derived).map((p) => p.pid));

/**
 * Ozet modunda serit olarak cizilecek parametreler, PARAMETERS sirasinda.
 *
 * Bir parametre ilginctir, eger:
 *   1. yer turetilmis bir AI skoruysa (her zaman),
 *   2. anlik limit durumu NOMINAL degilse,
 *   3. senaryo AKTIFKEN XAI kanitlarindan birinin sorumlu kanallari arasindaysa,
 *   4. senaryo AKTIFKEN CUSUM yapisal kirilmasinin kanaliysa,
 *   5. son `holdS` saniye icinde bu kanal icin HERHANGI bir ST[12] gecisi
 *      olduysa — NOMINAL'e donus dahil (tutma / histerezis).
 *
 * Neden yalnizca limit durumu yetmez: surukleme senaryosunda ch_42 tasarim
 * geregi limit icinde kalir, AI skoru ise alarm verir. Demonun butun mesaji bu
 * kontrasttir; saf bir "limit disi" filtresi ch_42'yi gizlerdi.
 *
 * Neden 3 ve 4 senaryoya kapilanir: `sim.xai` ve `structuralBreak`, senaryo
 * kendiliginden bitince ve nominale donuste TEMIZLENMEZ. Kapisiz bir kural
 * seridi bir sonraki senaryoya kadar ekranda tutardi.
 *
 * Neden senaryo dosyasinin hedef kanali (`targetPid`) kullanilmaz: INFO paneli
 * bir sey gercekten tespit edilmeden hikayeyi acmayacak sekilde kuruldu
 * (`infoStage.ts`). Burada da yalnizca tespit sinyallerine bakilir.
 */
export function interestingPids(sim: Simulation, holdS: number = SUMMARY_HOLD_S): string[] {
  const out = new Set<string>(DERIVED);
  const states = sim.snapshot().states;

  for (const p of PARAMETERS) {
    if ((states.get(p.pid) ?? 'NOMINAL') !== 'NOMINAL') out.add(p.pid);
  }

  if (sim.activeScenario !== null) {
    // Birlesim: bir kosu icinde monoton kalir, seviyeler farkli kanal
    // listesi tasisa bile serit gelip gitmez.
    for (const ev of sim.xai) for (const pid of ev.top_channels) out.add(pid);
    if (sim.structuralBreak) out.add(sim.structuralBreak.pid);
  }

  const now = sim.clock.missionT;
  for (const a of sim.alarms) {
    if (a.source === 'ST12_LIMIT' && now - a.missionT <= holdS) out.add(a.pid);
  }

  return PARAMETERS.filter((p) => out.has(p.pid)).map((p) => p.pid);
}

export interface SummaryAlarm {
  /** En yeni onaylanmamis alarm. */
  top: Alarm;
  /** Esigi gecen onaylanmamis alarm sayisi (top dahil). */
  count: number;
}

/**
 * Ozet modundaki uyari seridinin gosterecegi alarm: en yeni ONAYLANMAMIS
 * alarm, siddeti en az `minSeverity`. `alarms` en yeni once gelir
 * (`Simulation.pushAlarm` unshift eder).
 *
 * Onaylanmamis = hala ilgilenilmesi gereken; boylece operator ozet moduna
 * girdiginde onceden dusmus ama onaylanmamis bir alarm da gorunur.
 */
export function summaryAlarm(alarms: readonly Alarm[], minSeverity: number = 2): SummaryAlarm | null {
  let top: Alarm | null = null;
  let count = 0;
  for (const a of alarms) {
    if (a.acknowledged || a.severity < minSeverity) continue;
    if (top === null) top = a;
    count++;
  }
  return top ? { top, count } : null;
}
