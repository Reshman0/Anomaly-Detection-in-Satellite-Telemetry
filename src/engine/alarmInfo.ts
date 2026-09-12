import { MIB, PARAMETERS, apidLabel, param, subsystemName } from './mib';
import { REPETITION_NUMBER, ecssStatus, evaluate, isHard, stateLabel } from './limitChecker';
import { SCENARIOS, targetPid, type Scenario } from './scenarioRunner';
import type { Simulation } from './simulation';
import type { Alarm, LimitState, MibParameter, Sample } from './types';

/**
 * Alarm dosyası — bir alarm kartına tıklanınca detay penceresinin gösterdiği,
 * standartlara göre düzenlenmiş bilgi kümesi. Hepsi konsolun kendi verisinden
 * (MIB, tampon, paket, senaryo hikâyesi) türetilir; hiçbir alan uydurulmaz.
 *
 *   ECSS-E-ST-70-41C  §6.5  ST[05] event reporting: TM[5,1..4] şiddet dereceleri,
 *                            event definition ID, auxiliary data
 *                     §6.12 ST[12] on-board monitoring: PMON tanımı (parametre,
 *                            kontrol tipi = limit check, low/high limit, repetition
 *                            number), TM[12,12] check transition report alanları
 *   ECSS-E-ST-70-31C  MIB parametre tanımı, kalibrasyon eğrisi, limit setleri
 *   ECSS-E-ST-70-11C  Space segment operability: OOL (out-of-limit) bilgisi,
 *                     alarmın operatöre taşıması gereken asgari içerik
 *   ECSS-E-ST-70C     Yer sistemleri ve operasyon: alarm yaşam döngüsü
 *                     (raised → acknowledged → cleared), operatör kaydı
 *   ECSS-E-ST-70-32C  Prosedür referansı (FOP kimliği ve adımları; burada demo)
 *   ESA-ADB           Anomali sınıfı ve önem derecesi 0..3 eşlemesi
 */

export interface DossierRow {
  k: string;
  v: string;
  /** Standart / bölüm referansı — küçük, sönük yazılır. */
  ref?: string;
  tone?: 'nominal' | 'soft' | 'warn' | 'hard' | 'ai' | 'dim';
}

export interface AlarmDossier {
  lifecycle: {
    state: 'AKTİF' | 'TEMİZLENDİ' | 'BİLGİ';
    stateTone: 'hard' | 'nominal' | 'dim';
    raisedUtc: string;
    ageS: number;
    acknowledged: boolean;
    /** ST[12]: parametre limit içine döndüyse o an (görev saati). */
    clearedT: number | null;
    rows: DossierRow[];
  };
  pus: { title: string; rows: DossierRow[] };
  monitoring: { title: string; rows: DossierRow[] } | null;
  ool: { title: string; rows: DossierRow[] } | null;
  operability: { title: string; rows: DossierRow[] };
  procedure: {
    id: string;
    title: string;
    urgency: 'izle' | 'planlı' | 'acil';
    action: string;
    steps: string[];
    source: string;
  };
  related: { pid: string; state: LimitState; eng: number | null; unit: string; isTarget: boolean }[];
  classification: DossierRow[];
}

const SUBTYPE_NAME: Record<number, string> = {
  1: 'informative event report',
  2: 'low severity anomaly report',
  3: 'medium severity anomaly report',
  4: 'high severity anomaly report',
};

const SEVERITY_TR = ['bilgi', 'düşük', 'orta', 'yüksek'];

/** Alt sistem bazlı operasyonel sonuç metni (ECSS-E-ST-70-11C: alarm sonucu operatöre söylenir). */
const CONSEQUENCE: Record<string, { impact: string; safe: string }> = {
  SS1: {
    impact: 'Güç bütçesi ve batarya koruma mantığı etkilenebilir; sert ihlalde FDIR yük ayırma (load shedding) tetiklenebilir.',
    safe: 'Uydu güvenli: batarya koruma eşikleri on-board FDIR ile bağımsız izlenir.',
  },
  SS3: {
    impact: 'Yönelim bilgisi bozulursa yük işaretlemesi ve güneş paneli yönelimi sapar; uzun süreli sapma güvenli moda geçişe yol açabilir.',
    safe: 'Yıldız izleyici / jiroskop çapraz kontrolü on-board sürüyor; tek kanal sapması tek başına mod değiştirmez.',
  },
  SS5: {
    impact: 'Termal sınır aşımı bileşen ömrünü kısaltır; ısıtıcı görev döngüsü güç bütçesini zorlar.',
    safe: 'Termal koruma (ısıtıcı kapama / ısıl anahtar) on-board FDIR ile bağımsız çalışır.',
  },
  GND: {
    impact: 'Yer türetilmiş skor; uyduda bir şey değişmedi. Etki, işaret ettiği alt sistemin şeritlerinde aranmalı.',
    safe: 'Uydu güvenli: bu bildirim yer segmentinde üretildi, komut gönderilmedi.',
  },
};

function fmtEng(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(3) + (unit && unit !== '—' ? ' ' + unit : '');
}

function limitViolated(p: MibParameter, s: LimitState): { name: string; value: number | undefined } {
  switch (s) {
    case 'HARD_HIGH':
      return { name: 'hard high', value: p.limits.hard_high };
    case 'HARD_LOW':
      return { name: 'hard low', value: p.limits.hard_low };
    case 'SOFT_HIGH':
      return { name: 'soft high', value: p.limits.soft_high };
    case 'SOFT_LOW':
      return { name: 'soft low', value: p.limits.soft_low };
    default:
      return { name: '—', value: undefined };
  }
}

/** Alarm anından itibaren limit dışında kalınan süre ve örnek sayısı. */
function outsideStats(buf: Sample[], p: MibParameter, fromT: number): { samples: number; seconds: number; worst: number | null; returnedT: number | null } {
  let samples = 0;
  let worst: number | null = null;
  let returnedT: number | null = null;
  let firstT: number | null = null;
  let lastOutT: number | null = null;
  for (const s of buf) {
    if (s.t < fromT - 1) continue;
    const st = evaluate(p, s.eng);
    if (st !== 'NOMINAL') {
      samples++;
      firstT ??= s.t;
      lastOutT = s.t;
      if (worst === null || Math.abs(s.eng) > Math.abs(worst)) worst = s.eng;
      returnedT = null;
    } else if (lastOutT !== null && returnedT === null) {
      returnedT = s.t;
    }
  }
  const seconds = firstT !== null && lastOutT !== null ? Math.max(p.sampling_period_s, lastOutT - firstT + p.sampling_period_s) : 0;
  return { samples, seconds, worst, returnedT };
}

function scenarioOf(alarm: Alarm, sim: Simulation): Scenario | null {
  if (alarm.scenarioId) return SCENARIOS.find((s) => s.id === alarm.scenarioId) ?? null;
  return sim.activeScenario;
}

function anomalyClass(sc: Scenario | null): string {
  if (!sc) return 'nominal akış (senaryo yok)';
  switch (sc.id) {
    case 'point':
      return 'nokta anomalisi (point)';
    case 'drift':
      return 'yavaş sürüklenme (drift / contextual)';
    case 'collective':
      return 'kolektif sapma (collective)';
    default:
      return sc.name;
  }
}

export function buildDossier(alarm: Alarm, sim: Simulation): AlarmDossier {
  const p = param(alarm.pid);
  const buf = sim.buffers.get(alarm.pid) ?? [];
  const last = buf[buf.length - 1];
  const nowT = sim.clock.missionT;
  const nowState = last ? evaluate(p, last.eng) : 'NOMINAL';
  const isAi = alarm.source === 'AI_DERIVED';
  const sc = scenarioOf(alarm, sim);
  const ageS = Math.max(0, nowT - alarm.missionT);
  const unit = p.eng_unit;
  // AI skoru (AI_SCORE_SSx) yer turetilmis olsa da isaret ettigi alt sistem SSx'tir;
  // iliskili parametreler ve operasyonel sonuc o alt sisteme gore verilir.
  const subsys = p.derived && p.pid.startsWith('AI_SCORE_') ? p.pid.slice('AI_SCORE_'.length) : p.subsystem;

  // ---- yaşam döngüsü ----
  const isReturn = alarm.transition?.to === 'NOMINAL';
  // Limit icine donus alarmi: istatistik biten ihlalin basindan alinir (geriye dogru taranir).
  let statFromT = alarm.missionT;
  if (isReturn) {
    let i = buf.length - 1;
    while (i >= 0 && buf[i].t >= alarm.missionT) i--;
    while (i >= 0 && evaluate(p, buf[i].eng) === 'NOMINAL') i--;
    while (i > 0 && evaluate(p, buf[i - 1].eng) !== 'NOMINAL') i--;
    if (i >= 0) statFromT = buf[i].t;
  }
  const st = outsideStats(buf, p, statFromT);
  let state: AlarmDossier['lifecycle']['state'];
  let stateTone: AlarmDossier['lifecycle']['stateTone'];
  if (alarm.severity === 0 || isReturn) {
    state = 'BİLGİ';
    stateTone = 'dim';
  } else if (nowState === 'NOMINAL') {
    state = 'TEMİZLENDİ';
    stateTone = 'nominal';
  } else {
    state = 'AKTİF';
    stateTone = 'hard';
  }
  const lifecycleRows: DossierRow[] = [
    { k: 'Durum', v: state, tone: stateTone, ref: 'ECSS-E-ST-70C alarm yaşam döngüsü' },
    { k: 'Yükseltildi', v: alarm.utc + ' UTC', ref: 'raised' },
    { k: 'Yaş', v: ageS < 60 ? ageS.toFixed(0) + ' s' : (ageS / 60).toFixed(1) + ' dk', tone: 'dim' },
    { k: 'Operatör onayı', v: alarm.acknowledged ? 'ONAYLANDI (ACK)' : 'bekliyor', tone: alarm.acknowledged ? 'nominal' : 'soft', ref: 'acknowledged' },
  ];
  if (!isAi && !isReturn) {
    lifecycleRows.push({
      k: 'Limit içine dönüş',
      v: st.returnedT !== null ? 't+' + Math.round(st.returnedT - alarm.missionT) + ' s sonra' : nowState === 'NOMINAL' ? 'evet' : 'henüz değil',
      tone: st.returnedT !== null || nowState === 'NOMINAL' ? 'nominal' : 'hard',
      ref: 'cleared',
    });
  }

  // ---- PUS alanları ----
  const pusRows: DossierRow[] = [];
  const [svc, sub] = alarm.service;
  if (svc === 5) {
    pusRows.push(
      { k: 'Servis / alt tip', v: 'TM[5,' + sub + '] · ' + (SUBTYPE_NAME[sub] ?? '—'), ref: 'ECSS-E-ST-70-41C §6.5.4' },
      { k: 'Event definition ID (RID)', v: alarm.pid, ref: '§6.5.3 event definition' },
      { k: 'Şiddet', v: 'ESA-ADB ' + alarm.severity + ' · ' + SEVERITY_TR[alarm.severity] + ' ↔ TM[5,' + sub + ']', ref: 'yönerge §4 eşlemesi' },
      { k: 'Auxiliary data', v: (alarm.model ? 'model ' + alarm.model : '—') + (alarm.confidence !== undefined ? ' · güven ' + (alarm.confidence * 100).toFixed(0) + '%' : ''), ref: '§6.5.4 auxiliary data', tone: 'ai' },
      { k: 'Üretim yeri', v: isAi ? 'yer segmenti (ST[05] eşdeğeri, APID ' + alarm.apid + ' indirilmez)' : 'uydu', ref: 'ECSS-E-ST-70-41C §5.4.2 APID', tone: isAi ? 'ai' : undefined },
    );
  } else {
    pusRows.push(
      { k: 'Servis / alt tip', v: 'TM[12,12] · check transition report', ref: 'ECSS-E-ST-70-41C §6.12.6' },
      { k: 'Parameter ID', v: alarm.pid, ref: '§6.12.3 PMON parametresi' },
      { k: 'Monitoring check ID', v: alarm.transition ? (isHard(alarm.transition.to === 'NOMINAL' ? alarm.transition.from : alarm.transition.to) ? '2 · hard limit' : '1 · soft limit') : '—', ref: '§6.12.3 check definition' },
      { k: 'Previous check status', v: alarm.transition ? ecssStatus(alarm.transition.from) + ' (' + stateLabel(alarm.transition.from) + ')' : '—', ref: '§6.12.6' },
      { k: 'Current check status', v: alarm.transition ? ecssStatus(alarm.transition.to) + ' (' + stateLabel(alarm.transition.to) + ')' : '—', ref: '§6.12.6', tone: alarm.transition && alarm.transition.to !== 'NOMINAL' ? (isHard(alarm.transition.to) ? 'hard' : 'soft') : 'nominal' },
      { k: 'Transition time', v: alarm.obt + ' OBT · ' + alarm.utc + ' UTC', ref: 'CCSDS 301.0-B CUC' },
    );
  }
  pusRows.push(
    { k: 'APID', v: alarm.apid + ' (0x' + alarm.apid.toString(16).toUpperCase().padStart(3, '0') + ') · ' + apidLabel(alarm.apid), ref: 'CCSDS 133.0-B' },
    { k: 'Zaman korelasyonu', v: 'OBT − UTC = ' + MIB.obt_offset_s.toFixed(3) + ' s', ref: 'ECSS-E-ST-70-41C ST[09]', tone: 'dim' },
  );

  // ---- PMON tanımı (yalnızca on-board parametreler) ----
  let monitoring: AlarmDossier['monitoring'] = null;
  if (!p.derived) {
    monitoring = {
      title: 'PMON tanımı · ST[12] on-board monitoring',
      rows: [
        { k: 'Kontrol tipi', v: 'limit check', ref: 'ECSS-E-ST-70-41C §6.12.3.4' },
        { k: 'Check 1 · soft', v: fmtEng(p.limits.soft_low, unit) + ' … ' + fmtEng(p.limits.soft_high, unit), tone: 'soft', ref: 'low / high limit' },
        { k: 'Check 2 · hard', v: fmtEng(p.limits.hard_low, unit) + ' … ' + fmtEng(p.limits.hard_high, unit), tone: 'hard', ref: 'low / high limit' },
        { k: 'Repetition number', v: String(REPETITION_NUMBER) + ' örneklem', ref: '§6.12.3.5' },
        { k: 'Örnekleme periyodu', v: p.sampling_period_s + ' s', ref: 'ECSS-E-ST-70-31C', tone: 'dim' },
        { k: 'Kalibrasyon', v: p.calibration ? 'doğrusal · eng = ' + p.calibration.a + '·raw ' + (p.calibration.b >= 0 ? '+ ' : '− ') + Math.abs(p.calibration.b) : '—', ref: 'ECSS-E-ST-70-31C kalibrasyon eğrisi', tone: 'dim' },
        { k: 'Ham tip', v: p.raw_type ?? '—', tone: 'dim' },
      ],
    };
  }

  // ---- OOL (out-of-limit) bilgisi ----
  let ool: AlarmDossier['ool'] = null;
  if (!isAi && alarm.transition) {
    const violated = isReturn ? alarm.transition.from : alarm.transition.to;
    const lv = limitViolated(p, violated);
    const atAlarm = buf.find((s) => Math.abs(s.t - (isReturn ? statFromT : alarm.missionT)) < p.sampling_period_s / 2 + 0.01) ?? null;
    const delta = atAlarm && lv.value !== undefined ? atAlarm.eng - lv.value : null;
    ool = {
      title: isReturn ? 'OOL · biten ihlalin bilgisi' : 'OOL · limit dışı bilgisi',
      rows: [
        { k: 'İhlal edilen limit', v: lv.name + ' = ' + fmtEng(lv.value, unit), tone: isHard(violated) ? 'hard' : 'soft', ref: 'ECSS-E-ST-70-11C §5.3 OOL' },
        { k: isReturn ? 'İhlal başı değeri' : 'Alarm anı değeri', v: fmtEng(atAlarm?.eng, unit) + (atAlarm?.raw !== null && atAlarm?.raw !== undefined ? ' · raw ' + atAlarm.raw : '') },
        { k: 'Limitten sapma', v: delta === null ? '—' : (delta >= 0 ? '+' : '') + delta.toFixed(3) + (unit !== '—' ? ' ' + unit : ''), tone: 'dim' },
        { k: 'En kötü değer', v: fmtEng(st.worst, unit) + ' · ' + stateLabel(st.worst !== null ? evaluate(p, st.worst) : 'NOMINAL') },
        { k: 'Limit dışı süre', v: st.seconds.toFixed(0) + ' s · ' + st.samples + ' örneklem', tone: st.samples > 0 ? 'warn' : 'dim', ref: 'persistence' },
        { k: 'Şu an', v: fmtEng(last?.eng, unit) + ' · ' + ecssStatus(nowState), tone: nowState === 'NOMINAL' ? 'nominal' : isHard(nowState) ? 'hard' : 'soft' },
      ],
    };
  } else if (isAi) {
    const aiP = PARAMETERS.find((q) => q.derived && q.pid === 'AI_SCORE_' + subsys) ?? (p.derived ? p : null);
    const aiBuf = aiP ? sim.buffers.get(aiP.pid) ?? [] : [];
    const aiLast = aiBuf[aiBuf.length - 1];
    const aiAt = aiBuf.find((s) => Math.abs(s.t - alarm.missionT) < 0.51) ?? null;
    ool = {
      title: 'Tespit bilgisi · yer türetilmiş skor',
      rows: [
        { k: 'Skor parametresi', v: aiP ? aiP.pid + ' · ' + aiP.source_model : '—', tone: 'ai', ref: 'ECSS-E-ST-70-31C türetilmiş parametre' },
        { k: 'Alarm anı skoru', v: aiAt ? aiAt.eng.toFixed(2) + ' σ' : '—', tone: 'ai' },
        { k: 'Eşikler', v: aiP ? 'izleme ' + (aiP.limits.soft_high ?? '—') + ' σ · alarm ' + (aiP.limits.hard_high ?? '—') + ' σ' : '—', tone: 'dim', ref: 'yumuşak / sert' },
        { k: 'Şu an', v: aiLast ? aiLast.eng.toFixed(2) + ' σ · ' + ecssStatus(aiP ? evaluate(aiP, aiLast.eng) : 'NOMINAL') : '—', tone: aiLast && aiP && evaluate(aiP, aiLast.eng) !== 'NOMINAL' ? 'ai' : 'nominal' },
        { k: 'ST[12] karşılığı', v: nowState === 'NOMINAL' ? 'WITHIN LIMITS — uçuş yazılımı sessiz (kontrast)' : ecssStatus(nowState), tone: nowState === 'NOMINAL' ? 'ai' : 'hard', ref: 'AI vs sabit limit' },
      ],
    };
  }

  // ---- operasyonel sonuç ----
  const cq = CONSEQUENCE[subsys] ?? CONSEQUENCE.GND;
  const operability: AlarmDossier['operability'] = {
    title: 'Operasyonel sonuç · ECSS-E-ST-70-11C',
    rows: [
      { k: 'Alt sistem', v: subsys + ' · ' + subsystemName(subsys) + (subsys !== p.subsystem ? ' (yer türetilmiş skorun hedefi)' : '') },
      { k: 'Olası etki', v: cq.impact },
      { k: 'Uydu güvenliği', v: cq.safe, tone: 'nominal' },
      { k: 'Komut gerekiyor mu', v: alarm.severity >= 3 ? 'değerlendir — prosedür adımlarına bak; konsol komut göndermez' : 'hayır — izleme / planlı', tone: alarm.severity >= 3 ? 'warn' : 'dim', ref: 'ECSS-E-ST-70C: operatör kaydı ≠ TC' },
    ],
  };

  // ---- prosedür ----
  let procedure: AlarmDossier['procedure'];
  const story = sc?.story;
  const scTarget = sc ? targetPid(sc) : null;
  const scenarioMatches = !!sc && (isAi || scTarget === alarm.pid || param(scTarget ?? alarm.pid).subsystem === subsys);
  if (story && scenarioMatches) {
    procedure = {
      id: 'FOP-' + subsys + '-' + sc!.id.toUpperCase() + '-01',
      title: story.headline,
      urgency: story.recommendation.urgency,
      action: story.recommendation.action,
      steps: story.recommendation.steps,
      source: 'senaryo hikâyesi (' + sc!.name + ') · simüle · ECSS-E-ST-70-32C biçiminde',
    };
  } else if (!isAi) {
    const hard = alarm.transition ? isHard(alarm.transition.to) : false;
    procedure = {
      id: 'FOP-' + sub + '-OOL-' + (hard ? 'HARD' : 'SOFT'),
      title: hard ? 'Sert limit ihlali — acil değerlendirme' : 'Yumuşak limit ihlali — izleme',
      urgency: hard ? 'acil' : 'izle',
      action: hard
        ? 'ÖNERİ: ' + alarm.pid + ' için sert limit ihlalini doğrula ve ' + subsystemName(subsys) + ' FDIR durumunu kontrol et'
        : 'ÖNERİ: ' + alarm.pid + ' eğilimini bir sonraki geçişe kadar izle',
      steps: hard
        ? [
            'Aynı APID içindeki komşu kanalların (ilişkili parametreler) durumunu doğrula — tek kanal mı, alt sistem mi?',
            'TM[12,12] geçiş değerini ham/mühendislik olarak paket dökümünden teyit et (PEC OK olmalı)',
            'Bir sonraki AOS için ST[12] repetition number 1 → 2 geçici artırımını değerlendir (yanlış alarm süzgeci)',
            'İhlal 2 örneklemden uzun sürerse uçuş kontrol ekibine bildir; alarm kaydını ACK ile kapat',
          ]
        : [
            'Limit bandındaki kalış süresini izle; sert limite yaklaşırsa bu prosedür FOP-…-HARD\'a devredilir',
            'Yörünge bağlamını (tutulma / SAA / güneş açısı) INFO panelinden not et',
            'Kendiliğinden limit içine dönerse alarmı ACK ile kapat, eğilimi vardiya raporuna yaz',
          ],
      source: 'genel OOL prosedürü · demo tanımı (gerçek görevde FOP kütüphanesinden gelir)',
    };
  } else {
    procedure = {
      id: 'FOP-' + sub + '-AI-INFO',
      title: 'AI izleme bildirimi',
      urgency: 'izle',
      action: 'ÖNERİ: ' + subsystemName(subsys) + ' şeritlerinde XAI kanıtının işaret ettiği kanalları izle',
      steps: ['XAI panelinde 1 · Artık ve 2 · Kanal katkısı seviyelerine bak', 'Skor 5σ eşiğini geçerse INFO paneli doğrulanmış öneriyi düşürür', 'ST[12] sessizken alarm yalnızca yer segmentine aittir; komut yok'],
      source: 'genel AI bildirim akışı · demo tanımı',
    };
  }

  // ---- ilişkili parametreler ----
  const states = sim.snapshot().states;
  const related = PARAMETERS.filter((q) => q.subsystem === subsys || (q.derived && q.pid === 'AI_SCORE_' + subsys)).map((q) => {
    const b = sim.buffers.get(q.pid) ?? [];
    const l = b[b.length - 1];
    return { pid: q.pid, state: states.get(q.pid) ?? 'NOMINAL', eng: l ? l.eng : null, unit: q.eng_unit, isTarget: q.pid === alarm.pid };
  });

  // ---- sınıflandırma ----
  const classification: DossierRow[] = [
    { k: 'ESA-ADB sınıfı', v: anomalyClass(sc), ref: 'ESA-ADB anomaly class' },
    { k: 'Kaynak', v: isAi ? 'AI türetilmiş · ' + (alarm.model ?? '—') : 'ST[12] uçuş yazılımı sabit limit', tone: isAi ? 'ai' : undefined },
    { k: 'Senaryo', v: sc ? sc.name + ' (' + sc.model + ')' : 'nominal akış', tone: 'dim' },
    { k: 'Kanal', v: alarm.pid + ' · ' + p.description, tone: 'dim', ref: 'ESA-ADB anonim kanal adı' },
  ];

  return {
    lifecycle: { state, stateTone, raisedUtc: alarm.utc, ageS, acknowledged: !!alarm.acknowledged, clearedT: st.returnedT, rows: lifecycleRows },
    pus: { title: svc === 5 ? 'ST[05] olay raporu alanları' : 'ST[12] geçiş raporu alanları', rows: pusRows },
    monitoring,
    ool,
    operability,
    procedure,
    related,
    classification,
  };
}

/** Şiddet 0..3 → yumuşak/sert mantığıyla ton. */
export function severityTone(sev: number): 'nominal' | 'soft' | 'warn' | 'hard' {
  return sev >= 3 ? 'hard' : sev === 2 ? 'warn' : sev === 1 ? 'soft' : 'nominal';
}

