import { LimitChecker, isHard, isSoft, stateLabel, type CheckTransition } from './limitChecker';
import { MIB, PARAMETERS, apidLabel, param, subsystemName } from './mib';
import { BASE_PERIOD_S, MissionClock, PREFILL_S, fmtTimeMs } from './missionClock';
import { PacketCounters, buildTmPacket, concatBytes, u16, type BuiltPacket, type PacketField } from './packetBuilder';
import { DEFAULT_SEVERITY_INDEX, NOMINAL_SCENARIO, ScenarioRunner, targetPid, type Scenario } from './scenarioRunner';
import { TelemetrySource } from './telemetrySource';
import { detectBreak, fitNominal, type NominalModel } from './changePoint';
import type { Alarm, InfoNote, LimitState, OpsNotification, Sample, StructuralBreak, XaiEvidence } from './types';

/** Seritlerde tutulan gecmis penceresi (gorev saniyesi). */
export const WINDOW_S = PREFILL_S;

/** ESA-ADB onem derecesi 0..3 -> TM[5,1..4] (yonerge §4). */
export function severityToSubtype(severity: number): number {
  return Math.max(1, Math.min(4, severity + 1));
}

/** Uydu APID'leri: yalnizca bunlar icin TM paketi uretilir. */
const SPACECRAFT_APIDS = Array.from(
  new Set(PARAMETERS.filter((p) => !p.derived).map((p) => p.apid)),
).sort((a, b) => a - b);

/**
 * Alarm ve not kimlikleri filo genelinde tekildir: bir alarm karti hangi
 * uydudan gelirse gelsin kendi kimligiyle bulunabilsin diye sayaclar modul
 * duzeyinde tutulur.
 */
let alarmSeq = 0;
let noteSeq = 0;

export interface SimOptions {
  /** Yer istasyonunun ortak gorev saati. Verilmezse kendi saatini kurar (testler). */
  clock?: MissionClock;
  /** Uydu NORAD kimligi; telemetri tohumunu tuzlar ve alarmlari damgalar. */
  norad?: string;
  /** On-doldurma penceresinin bitecegi gorev saniyesi (varsayilan 0 = acilis). */
  startAtT?: number;
}

export interface SimSnapshot {
  missionT: number;
  utcMs: number;
  obtMs: number;
  buffers: Map<string, Sample[]>;
  states: Map<string, LimitState>;
  alarms: Alarm[];
  packets: BuiltPacket[];
  xai: XaiEvidence[];
  activeScenario: Scenario | null;
  scenarioProgress: number;
  lastTransition: CheckTransition | null;
}

export class Simulation {
  /** Uydu kimligi; '' = tuzsuz referans ornegi (birim testleri). */
  readonly norad: string;
  private readonly _clock: MissionClock;
  private source: TelemetrySource;
  private limits = new LimitChecker();
  private runner: ScenarioRunner | null = null;

  /** Uydu basina CCSDS sekans sayaclari (APID x uzay araci). */
  readonly counters = new PacketCounters();

  /**
   * Gorev saati. Filoda tum uydular ayni saati paylasir (tek yer istasyonu,
   * tek UTC). Bir `Simulation` bu saati asla yazmaz - yalnizca okur.
   */
  get clock(): MissionClock {
    return this._clock;
  }

  buffers = new Map<string, Sample[]>();
  alarms: Alarm[] = [];
  packets: BuiltPacket[] = [];
  xai: XaiEvidence[] = [];
  lastTransition: CheckTransition | null = null;
  severityIndex = DEFAULT_SEVERITY_INDEX;

  /** Omur boyu paket sayaclari: anahtar `servis,alttip`. Halka tamponundan bagimsiz. */
  serviceCounts = new Map<string, number>();
  packetCount = 0;

  /** INFO paneli: senaryo notlari, bu oturumda kacinci kez, CUSUM kirilmasi. */
  infoNotes: InfoNote[] = [];
  runCounts = new Map<string, number>();
  structuralBreak: StructuralBreak | null = null;
  /** Kalici bildirimler: AI sert esigi gecip anomali dogrulaninca onerisi buraya duser; senaryo bitince silinmez. */
  notifications: OpsNotification[] = [];
  private notifiedRun = false;
  /**
   * Kanal basina nominal model (sigma, phi, sigma_e) — acilistaki 600 s temiz
   * on-doldurmadan bir kez kestirilir ve dondurulur. Boylece pes pese kosulan
   * senaryolarin kuyrugu bir sonrakinin referansini kirletmez.
   */
  private nominalModels = new Map<string, NominalModel>();

  private pendingSteps = 0;

  constructor(options: SimOptions = {}) {
    this._clock = options.clock ?? new MissionClock();
    this.norad = options.norad ?? '';
    this.source = new TelemetrySource({
      seedSalt: this.norad,
      startIndex: TelemetrySource.indexForEndT(options.startAtT ?? 0),
    });
    for (const p of PARAMETERS) this.buffers.set(p.pid, []);
    this.prefill();
  }

  /**
   * 10 dakikalik temiz gecmis (yonerge §5) — bos grafikle acilmaz.
   * Pencerenin nerede bittigini kaynagin baslangic indeksi belirler; bu metot
   * gorev saatini YAZMAZ.
   */
  private prefill(): void {
    const steps = Math.round(PREFILL_S / BASE_PERIOD_S);
    for (let i = 0; i < steps; i++) this.runStep(true);
    this.packets = [];
    // Temiz gecmisten nominal modeller (kirilma dedektoru icin).
    this.nominalModels.clear();
    for (const p of PARAMETERS) {
      if (p.derived) continue;
      const vals = (this.buffers.get(p.pid) ?? []).map((s) => s.eng);
      if (vals.length >= 30) this.nominalModels.set(p.pid, fitNominal(vals));
    }
  }

  get activeScenario(): Scenario | null {
    return this.runner ? this.runner.scenario : null;
  }

  get scenarioProgress(): number {
    return this.runner ? this.runner.progress(this.clock.missionT) : 0;
  }

  /** Aktif senaryonun (izgaraya oturtulmus) baslangic gorev saniyesi. */
  get scenarioStartT(): number | null {
    return this.runner ? this.runner.startMissionT : null;
  }

  startScenario(scenario: Scenario): void {
    if (scenario.id === NOMINAL_SCENARIO.id || scenario.timeline.length === 0) {
      this.runner = null;
      this.infoNotes = [];
      this.structuralBreak = null;
      return;
    }
    this.runner = new ScenarioRunner(scenario, this.clock.missionT, this.severityIndex);
    this.xai = [];
    this.infoNotes = [];
    this.structuralBreak = null;
    this.notifiedRun = false;
    this.runCounts.set(scenario.id, (this.runCounts.get(scenario.id) ?? 0) + 1);
  }

  stopScenario(): void {
    this.runner = null;
    this.infoNotes = [];
    this.structuralBreak = null;
  }

  /**
   * Uyandirma: uydu uyurken gecen sureyi yeniden oynatmak yerine telemetri
   * penceresini `endT`de bitecek sekilde yeniden kurar.
   *
   * KORUNUR (anomali hafizasi): alarms, notifications, runCounts,
   * serviceCounts, packetCount, severityIndex.
   * SIFIRLANIR (canli durum): buffers, packets, xai, infoNotes,
   * structuralBreak, aktif senaryo, limit durum makinesi.
   */
  resync(endT: number): void {
    this.runner = null;
    this.xai = [];
    this.infoNotes = [];
    this.structuralBreak = null;
    this.notifiedRun = false;
    this.packets = [];
    this.lastTransition = null;
    // Sira onemli: limit durum makinesi on-doldurmadan ONCE sifirlanmali,
    // yoksa uyanisin ilk canli ornegi sahte bir "limit icine dondu" uretir.
    this.limits.reset();
    this.source = new TelemetrySource({
      seedSalt: this.norad,
      startIndex: TelemetrySource.indexForEndT(endT),
    });
    for (const p of PARAMETERS) this.buffers.set(p.pid, []);
    this.prefill();
  }

  /** Uretilmis son ornegin gorev saati. */
  get lastSampleT(): number {
    return this.source.nextMissionT() - BASE_PERIOD_S;
  }

  /** Ortak gorev saatinin ne kadar gerisinde kaldigi (saniye). */
  get behindS(): number {
    return Math.max(0, this._clock.missionT - this.source.nextMissionT());
  }

  get alarmCount(): number {
    return this.alarms.length;
  }

  get unackCount(): number {
    let n = 0;
    for (const a of this.alarms) if (!a.acknowledged) n++;
    return n;
  }

  /** Kuyruktaki en yuksek ESA-ADB onem derecesi; alarm yoksa -1. */
  get worstSeverity(): number {
    let worst = -1;
    for (const a of this.alarms) if (a.severity > worst) worst = a.severity;
    return worst;
  }

  setSeverity(index: number): void {
    this.severityIndex = index;
  }

  resetAll(): void {
    this.runner = null;
    this.alarms = [];
    this.packets = [];
    this.xai = [];
    this.lastTransition = null;
    this.packetCount = 0;
    this.serviceCounts.clear();
    this.infoNotes = [];
    this.runCounts.clear();
    this.structuralBreak = null;
    this.notifications = [];
    this.notifiedRun = false;
    this.limits.reset();
    this.counters.reset();
    this.source = new TelemetrySource({ seedSalt: this.norad });
    for (const p of PARAMETERS) this.buffers.set(p.pid, []);
    this.prefill();
  }

  /**
   * Verilen gorev saatine kadar temel adimlari isler ve islenen adim sayisini
   * dondurur. Gorev saatini YAZMAZ: filoda saat ortaktir, tek bir uydunun adim
   * siniri tum yer istasyonunun saatini geri alamaz. Sinir asilirsa karar
   * cagirana (Fleet) birakilir.
   */
  catchUp(targetMissionT: number, maxSteps = 400): number {
    let guard = 0;
    while (this.source.nextMissionT() <= targetMissionT && guard < maxSteps) {
      this.runStep(false);
      guard++;
    }
    this.pendingSteps = guard;
    if (this.runner && this.runner.isFinished(this._clock.missionT)) this.runner = null;
    return guard;
  }

  /** Kendi saatini surup yetisir (tek uydulu kullanim ve birim testleri). */
  advance(realDtMs: number, maxSteps = 400): void {
    this._clock.advance(realDtMs);
    this.catchUp(this._clock.missionT, maxSteps);
  }

  get lastBatchSteps(): number {
    return this.pendingSteps;
  }

  private runStep(prefilling: boolean): void {
    const missionT = this.source.nextMissionT();
    const runner = prefilling ? null : this.runner;
    const samples = this.source.step(runner);
    if (samples.length === 0) return;

    const byPid = new Map(samples.map((s) => [s.pid, s.sample]));

    // --- tamponlar ---
    for (const { pid, sample } of samples) {
      const buf = this.buffers.get(pid)!;
      buf.push(sample);
      const cutoff = missionT - WINDOW_S;
      let drop = 0;
      while (drop < buf.length && buf[drop].t < cutoff) drop++;
      if (drop > 0) buf.splice(0, drop);
    }

    const unixMs = MIB.epoch ? Date.parse(MIB.epoch) + missionT * 1000 : missionT * 1000;

    // --- ST[03] Housekeeping: APID basina TM[3,25] ---
    // On-doldurmada paket kaydi zaten atiliyor; kurmak da bosuna (adim basina
    // 3 paket x 600 adim = 1800 CRC). Uyandirma maliyetinin buyuk kismi budur.
    for (const apid of prefilling ? [] : SPACECRAFT_APIDS) {
      const ps = PARAMETERS.filter((p) => p.apid === apid && !p.derived && byPid.has(p.pid));
      if (ps.length === 0) continue;
      const sid = ps[0].sid;
      const parts: Uint8Array[] = [u16(sid)];
      const fields: PacketField[] = [
        { name: 'Structure ID (SID)', bits: 16, value: String(sid), group: 'data' },
      ];
      for (const p of ps) {
        const s = byPid.get(p.pid)!;
        const raw = s.raw ?? 0;
        parts.push(u16(raw));
        fields.push({ name: p.pid, bits: 16, value: String(raw) + ' raw', group: 'data' });
      }
      const pkt = buildTmPacket({
        apid,
        service: 3,
        subtype: 25,
        unixMs,
        userData: concatBytes(parts),
        userDataFields: fields,
        counters: this.counters,
      });
      this.pushPacket(pkt);
    }

    // --- ST[12] On-board monitoring: gercek limit kontrolu ---
    for (const { pid, sample } of samples) {
      const p = param(pid);
      const tr = this.limits.push(pid, sample.eng, sample.raw, missionT);
      if (!tr || prefilling) continue;
      this.lastTransition = tr;
      if (p.derived) continue; // yer turetilmis parametre ST[12] kapsaminda degil

      const fields: PacketField[] = [
        { name: 'Report count (N)', bits: 16, value: '1', group: 'data' },
        { name: 'Parameter ID', bits: 16, value: pid, group: 'data' },
        { name: 'Monitoring check ID', bits: 16, value: String(tr.checkId) + (tr.checkId === 1 ? ' (soft)' : ' (hard)'), group: 'data' },
        { name: 'Previous check status', bits: 8, value: stateLabel(tr.from), group: 'data' },
        { name: 'Current check status', bits: 8, value: stateLabel(tr.to), group: 'data' },
        { name: 'Transition value', bits: 16, value: String(tr.raw ?? 0) + ' raw', group: 'data' },
      ];
      const pkt = buildTmPacket({
        apid: p.apid,
        service: 12,
        subtype: 12,
        unixMs,
        userData: concatBytes([u16(1), u16(hash16(pid)), u16(tr.checkId), new Uint8Array([stateCode(tr.from), stateCode(tr.to)]), u16(tr.raw ?? 0)]),
        userDataFields: fields,
        counters: this.counters,
      });
      this.pushPacket(pkt);

      const severity = isHard(tr.to) ? 3 : isSoft(tr.to) ? 1 : 0;
      this.pushAlarm({
        id: ++alarmSeq,
        norad: this.norad,
        service: [12, 12],
        severity,
        source: 'ST12_LIMIT',
        apid: p.apid,
        pid,
        subsystem: p.subsystem,
        text:
          tr.to === 'NOMINAL'
            ? pid + ' limit içine döndü (' + stateLabel(tr.from) + ' → NOMİNAL)'
            : pid + ' ' + stateLabel(tr.to) + ' limit ihlali',
        utc: fmtTimeMs(unixMs),
        obt: fmtTimeMs(unixMs + MIB.obt_offset_s * 1000),
        missionT,
        transition: { from: tr.from, to: tr.to },
        packet: packetRef(pkt),
      });
    }

    // --- senaryo adimlari: ST[05] bildirimleri ve XAI kanitlari ---
    if (runner) {
      for (const step of runner.due(missionT)) {
        if (step.type === 'event') {
          const p = param(step.pid);
          const subtype = severityToSubtype(step.severity);
          if (subtype !== step.service[1] || step.service[0] !== 5) {
            // Senaryo dosyasindaki servis cifti ile ESA-ADB onem derecesi tutarsizsa
            // onem derecesi kazanir (yonerge §4 eslemesi).
            step.service = [5, subtype];
          }
          const pkt = buildTmPacket({
            apid: p.apid,
            service: 5,
            subtype,
            unixMs,
            userData: concatBytes([u16(hash16(step.pid)), u16(Math.round((step.confidence ?? 0) * 1000))]),
            userDataFields: [
              { name: 'Event ID (RID)', bits: 16, value: step.pid, group: 'data' },
              { name: 'Model', bits: 0, value: step.model ?? '—', group: 'data' },
              { name: 'Confidence ×1000', bits: 16, value: String(Math.round((step.confidence ?? 0) * 1000)), group: 'data' },
            ],
            counters: this.counters,
          });
          this.pushPacket(pkt);
          this.pushAlarm({
            id: ++alarmSeq,
            norad: this.norad,
            service: [5, subtype],
            severity: step.severity,
            source: 'AI_DERIVED',
            apid: p.apid,
            pid: step.pid,
            subsystem: p.subsystem,
            text: step.text,
            utc: fmtTimeMs(unixMs),
            obt: fmtTimeMs(unixMs + MIB.obt_offset_s * 1000),
            missionT,
            model: step.model,
            confidence: step.confidence,
            packet: packetRef(pkt),
          });
        } else if (step.type === 'show_xai') {
          const ev: XaiEvidence = {
            missionT,
            asset: step.asset,
            caption: step.caption,
            top_channels: step.top_channels,
            band: step.band,
            model: step.model,
            level: step.level,
          };
          this.xai = [...this.xai.filter((x) => x.level !== ev.level), ev].sort((a, b) => a.level - b.level);
        } else if (step.type === 'info') {
          this.pushNote(step.kind, step.title, step.text, missionT, unixMs);
        }
      }

      this.maybeNotify(runner, missionT, unixMs);

      // --- yapisal kirilma: senaryo dosyasina bakmaz, hedef kanali CUSUM ile izler ---
      if (!this.structuralBreak) {
        const pid = targetPid(runner.scenario);
        // Pencere senaryo baslangicindan baslar: onceki gurultuden gelen bir
        // sahte gecis gercek kirilmayi bloke etmesin.
        const brk = pid
          ? detectBreak(this.buffers.get(pid) ?? [], missionT, {
              startAfterT: runner.startMissionT,
              model: this.nominalModels.get(pid),
              // Taban cizgisi icin 240 s medyan: bir onceki senaryonun kuyrugu
              // referansin yarisindan azini kaplar, medyan etkilenmez.
              refS: 240,
            })
          : null;
        if (pid && brk) {
          this.structuralBreak = { pid, ...brk };
          const p = param(pid);
          const text =
            pid +
            ' yapısal kırılma ' +
            (brk.direction === 1 ? '↑' : '↓') +
            ' · başlangıç t+' +
            Math.round(brk.breakT - runner.startMissionT) +
            ' s · tespit t+' +
            Math.round(brk.detectedT - runner.startMissionT) +
            ' s · ' +
            brk.magnitudeSigma.toFixed(1) +
            'σ (CUSUM)';
          this.pushNote('stat', 'Yapısal kırılma hesaplandı', text, missionT, unixMs);
          this.pushAlarm({
            id: ++alarmSeq,
            norad: this.norad,
            service: [5, 1],
            severity: 0,
            source: 'AI_DERIVED',
            apid: p.apid,
            pid,
            subsystem: p.subsystem,
            text,
            utc: fmtTimeMs(unixMs),
            obt: fmtTimeMs(unixMs + MIB.obt_offset_s * 1000),
            missionT,
            model: 'CUSUM',
          });
        }
      }
    }
  }

  /**
   * Dogrulama: hedef alt sistemin AI skoru sert esigi gecince senaryonun
   * onerisi kalici bildirim listesine bir kez yazilir.
   */
  private maybeNotify(runner: ScenarioRunner, missionT: number, unixMs: number): void {
    if (this.notifiedRun) return;
    const sc = runner.scenario;
    const pid = targetPid(sc);
    if (!pid || !sc.story) return;
    const sub = param(pid).subsystem;
    const ai = PARAMETERS.find((q) => q.derived && q.pid === 'AI_SCORE_' + sub);
    if (!ai) return;
    const buf = this.buffers.get(ai.pid) ?? [];
    const last = buf[buf.length - 1];
    if (!last || last.t < runner.startMissionT || last.eng < (ai.limits.hard_high ?? 5)) return;
    this.notifiedRun = true;
    this.notifications.unshift({
      id: ++noteSeq,
      missionT,
      utc: fmtTimeMs(unixMs).slice(0, 8),
      scenarioId: sc.id,
      scenarioName: sc.name,
      headline: sc.story.headline,
      urgency: sc.story.recommendation.urgency,
      action: sc.story.recommendation.action,
      steps: sc.story.recommendation.steps,
      runNo: this.runCounts.get(sc.id) ?? 1,
    });
    if (this.notifications.length > 20) this.notifications.length = 20;
  }

  private pushNote(kind: InfoNote['kind'], title: string, text: string, missionT: number, unixMs: number): void {
    this.infoNotes.push({ id: ++noteSeq, missionT, utc: fmtTimeMs(unixMs).slice(0, 8), kind, title, text });
    if (this.infoNotes.length > 30) this.infoNotes.splice(0, this.infoNotes.length - 30);
  }

  /** Operator onayi: alarm kaydini isaretler; hicbir sey gondermez. */
  acknowledge(id: number): void {
    const a = this.alarms.find((x) => x.id === id);
    if (a) a.acknowledged = true;
  }

  private pushPacket(p: BuiltPacket): void {
    this.packetCount++;
    const key = p.service + ',' + p.subtype;
    this.serviceCounts.set(key, (this.serviceCounts.get(key) ?? 0) + 1);
    this.packets.push(p);
    if (this.packets.length > 60) this.packets.splice(0, this.packets.length - 60);
  }

  private pushAlarm(a: Alarm): void {
    // Alarm aninda kosan senaryo, detay penceresinde prosedur ve sinif icin saklanir.
    if (this.runner && a.scenarioId === undefined) a.scenarioId = this.runner.scenario.id;
    this.alarms.unshift(a);
    if (this.alarms.length > 40) this.alarms.length = 40;
  }

  snapshot(): SimSnapshot {
    return {
      missionT: this.clock.missionT,
      utcMs: this.clock.utcMs(),
      obtMs: this.clock.obtMs(),
      buffers: this.buffers,
      states: this.limits.snapshot(),
      alarms: this.alarms,
      packets: this.packets,
      xai: this.xai,
      activeScenario: this.activeScenario,
      scenarioProgress: this.scenarioProgress,
      lastTransition: this.lastTransition,
    };
  }
}

function stateCode(s: LimitState): number {
  switch (s) {
    case 'NOMINAL':
      return 0;
    case 'SOFT_LOW':
      return 1;
    case 'SOFT_HIGH':
      return 2;
    case 'HARD_LOW':
      return 3;
    case 'HARD_HIGH':
      return 4;
  }
}

/** Alarm kartina ilistirilecek hafif paket ozeti. */
function packetRef(p: BuiltPacket): NonNullable<Alarm['packet']> {
  return {
    label: p.label,
    hex: p.hex,
    fields: p.fields.map((f) => ({ name: f.name, bits: f.bits, value: f.binary ?? f.value, group: f.group })),
  };
}

/** Parametre adini 16 bitlik bir kimlige indirger (paket alani icin). */
function hash16(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h;
}

export { apidLabel, subsystemName };
