import { LimitChecker, isHard, isSoft, stateLabel, type CheckTransition } from './limitChecker';
import { MIB, PARAMETERS, apidLabel, param, subsystemName } from './mib';
import { BASE_PERIOD_S, MissionClock, PREFILL_S, fmtTimeMs } from './missionClock';
import { buildTmPacket, concatBytes, resetCounters, u16, type BuiltPacket, type PacketField } from './packetBuilder';
import { DEFAULT_SEVERITY_INDEX, NOMINAL_SCENARIO, ScenarioRunner, type Scenario } from './scenarioRunner';
import { TelemetrySource } from './telemetrySource';
import type { Alarm, LimitState, Sample, XaiEvidence } from './types';

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
  readonly clock = new MissionClock();
  private source = new TelemetrySource();
  private limits = new LimitChecker();
  private runner: ScenarioRunner | null = null;

  buffers = new Map<string, Sample[]>();
  alarms: Alarm[] = [];
  packets: BuiltPacket[] = [];
  xai: XaiEvidence[] = [];
  lastTransition: CheckTransition | null = null;
  severityIndex = DEFAULT_SEVERITY_INDEX;

  /** Omur boyu paket sayaclari: anahtar `servis,alttip`. Halka tamponundan bagimsiz. */
  serviceCounts = new Map<string, number>();
  packetCount = 0;

  private alarmSeq = 0;
  private pendingSteps = 0;

  constructor() {
    for (const p of PARAMETERS) this.buffers.set(p.pid, []);
    this.prefill();
  }

  /** Acilista 10 dakikalik gecmis (yonerge §5) — bos grafikle acilmaz. */
  private prefill(): void {
    const steps = Math.round(PREFILL_S / BASE_PERIOD_S);
    for (let i = 0; i < steps; i++) this.runStep(true);
    this.clock.missionT = 0;
    // Onceden doldurma sirasinda uretilen paket kaydini gosterme; sayaclar kalir.
    this.packets = [];
  }

  get activeScenario(): Scenario | null {
    return this.runner ? this.runner.scenario : null;
  }

  get scenarioProgress(): number {
    return this.runner ? this.runner.progress(this.clock.missionT) : 0;
  }

  startScenario(scenario: Scenario): void {
    if (scenario.id === NOMINAL_SCENARIO.id || scenario.timeline.length === 0) {
      this.runner = null;
      return;
    }
    this.runner = new ScenarioRunner(scenario, this.clock.missionT, this.severityIndex);
    this.xai = [];
  }

  stopScenario(): void {
    this.runner = null;
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
    this.limits.reset();
    resetCounters();
    this.source = new TelemetrySource();
    for (const p of PARAMETERS) this.buffers.set(p.pid, []);
    this.prefill();
  }

  /** Gercek gecen sureyi gorev saatine cevirip gereken temel adimlari isler. */
  advance(realDtMs: number, maxSteps = 400): void {
    this.clock.advance(realDtMs);
    const target = this.clock.missionT;
    let guard = 0;
    while (this.source.nextMissionT() <= target && guard < maxSteps) {
      this.runStep(false);
      guard++;
    }
    // Kaynak adim siniri nedeniyle geride kaldiysa gorev saatini uretilen son
    // ornekle esitle; aksi halde saat ile seritler kalici olarak ayrisir.
    if (guard >= maxSteps) this.clock.missionT = this.source.nextMissionT();
    this.pendingSteps = guard;
    if (this.runner && this.runner.isFinished(this.clock.missionT)) this.runner = null;
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
    for (const apid of SPACECRAFT_APIDS) {
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
      });
      if (!prefilling) this.pushPacket(pkt);
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
      });
      this.pushPacket(pkt);

      const severity = isHard(tr.to) ? 3 : isSoft(tr.to) ? 1 : 0;
      this.pushAlarm({
        id: ++this.alarmSeq,
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
          });
          this.pushPacket(pkt);
          this.pushAlarm({
            id: ++this.alarmSeq,
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
          });
        } else if (step.type === 'show_xai') {
          const ev: XaiEvidence = {
            asset: step.asset,
            caption: step.caption,
            top_channels: step.top_channels,
            band: step.band,
            model: step.model,
            level: step.level,
          };
          this.xai = [...this.xai.filter((x) => x.level !== ev.level), ev].sort((a, b) => a.level - b.level);
        }
      }
    }
  }

  private pushPacket(p: BuiltPacket): void {
    this.packetCount++;
    const key = p.service + ',' + p.subtype;
    this.serviceCounts.set(key, (this.serviceCounts.get(key) ?? 0) + 1);
    this.packets.push(p);
    if (this.packets.length > 60) this.packets.splice(0, this.packets.length - 60);
  }

  private pushAlarm(a: Alarm): void {
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

/** Parametre adini 16 bitlik bir kimlige indirger (paket alani icin). */
function hash16(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h;
}

export { apidLabel, subsystemName };
