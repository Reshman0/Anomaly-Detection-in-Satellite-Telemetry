import { PARAMETERS } from './mib';
import { isHard, isSoft } from './limitChecker';
import type { Simulation } from './simulation';
import type { Alarm, LimitState } from './types';

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

/** AI skoru esikleri MIB'den okunur (tum yer turetilmis skorlar ayni esigi tasir). */
const AI_LIMITS = PARAMETERS.find((p) => p.derived)?.limits ?? {};
const AI_SOFT = AI_LIMITS.soft_high ?? 3;
const AI_HARD = AI_LIMITS.hard_high ?? 5;

export type VerdictTone = 'nominal' | 'soft' | 'hard' | 'ai';

export interface SummaryVerdict {
  word: 'NOMİNAL' | 'İZLEME' | 'ALARM';
  tone: VerdictTone;
  /** Renkten bagimsiz isaret: ● nominal, ▲ ST[12] limiti, ◆ AI. */
  glyph: '●' | '▲' | '◆';
  /** Hukmun tek satirlik dayanagi. */
  reason: string;
  /** Limitler sessiz, AI konusuyor — demonun ana karsitligi. */
  contrast: boolean;
}

/**
 * Ozet panosunun tek hukmu: uydu uzerindeki sabit limit kontrolu (ST[12]) ile
 * yerde turetilen AI skorunun en kotusu. Esitlikte ST[12] onde gelir: uydunun
 * kendi limit ihlali dogrudan olcumdur.
 */
export function summaryVerdict(limit: LimitState, ai: LimitState): SummaryVerdict {
  const contrast = limit === 'NOMINAL' && ai !== 'NOMINAL';
  const sigma = (v: number) => v.toFixed(0) + 'σ';
  if (isHard(limit)) {
    return { word: 'ALARM', tone: 'hard', glyph: '▲', reason: 'ST[12] sabit limit · sert eşik aşıldı', contrast };
  }
  if (isHard(ai)) {
    return {
      word: 'ALARM',
      tone: 'ai',
      glyph: '◆',
      reason: 'AI skoru ≥ ' + sigma(AI_HARD) + (contrast ? ' · ham kanallar limit içinde' : ''),
      contrast,
    };
  }
  if (isSoft(limit)) {
    return { word: 'İZLEME', tone: 'soft', glyph: '▲', reason: 'ST[12] sabit limit · yumuşak eşik aşıldı', contrast };
  }
  if (isSoft(ai)) {
    return {
      word: 'İZLEME',
      tone: 'ai',
      glyph: '◆',
      reason: 'AI skoru ≥ ' + sigma(AI_SOFT) + (contrast ? ' · ham kanallar limit içinde' : ''),
      contrast,
    };
  }
  return {
    word: 'NOMİNAL',
    tone: 'nominal',
    glyph: '●',
    reason: 'ham kanallar limit içinde · AI skoru < ' + sigma(AI_SOFT),
    contrast,
  };
}
