/** Ortak tipler. Alan adlari mib.json / apid_table.json ile birebir. */

export type LimitState = 'NOMINAL' | 'SOFT_LOW' | 'SOFT_HIGH' | 'HARD_LOW' | 'HARD_HIGH';

export interface Limits {
  soft_low?: number;
  soft_high?: number;
  hard_low?: number;
  hard_high?: number;
}

export interface Calibration {
  type: 'linear';
  a: number;
  b: number;
}

export interface SimProfile {
  mean: number;
  sd: number;
  ar1: number;
  diurnal_amp: number;
  diurnal_period_s: number;
  phase: number;
  floor?: number;
}

export interface MibParameter {
  pid: string;
  description: string;
  subsystem: string;
  apid: number;
  sid: number;
  raw_type?: 'u16';
  eng_unit: string;
  calibration?: Calibration;
  sampling_period_s: number;
  limits: Limits;
  derived: boolean;
  source_model?: string;
  sim: SimProfile;
}

export interface MibSubsystem {
  id: string;
  name: string;
  name_tr: string;
  apid: number;
}

export interface GroundStation {
  id: string;
  name: string;
  lat_deg: number;
  lon_deg: number;
  alt_km: number;
  min_elevation_deg: number;
}

export interface Mib {
  mission: string;
  epoch: string;
  obt_offset_s: number;
  ground_station: GroundStation;
  subsystems: MibSubsystem[];
  parameters: MibParameter[];
}

export interface ApidEntry {
  apid: number;
  hex: string;
  subsystem: string;
  label: string;
  packet_type: 'TM' | 'TC' | 'GND';
  vcid: number | null;
  services: number[];
}

/** Bir parametrenin tek orneklemesi. */
export interface Sample {
  t: number; // gorev saati, saniye
  raw: number | null; // turetilmis parametrelerde on-board ham deger yoktur
  eng: number;
}

export type AlarmSource = 'ST12_LIMIT' | 'AI_DERIVED';

export interface Alarm {
  id: number;
  /** ECSS servis/alt tip cifti, orn. [5,4] */
  service: [number, number];
  /** ESA-ADB onem derecesi 0..3 */
  severity: number;
  source: AlarmSource;
  apid: number;
  pid: string;
  subsystem: string;
  text: string;
  utc: string;
  obt: string;
  missionT: number;
  model?: string;
  confidence?: number;
  /** ST[12] icin gecis: onceki -> yeni durum */
  transition?: { from: LimitState; to: LimitState };
  /** Alarmi tasiyan TM paketi (yer tarafi hesaplarda yok). */
  packet?: { label: string; hex: string; fields: { name: string; bits: number; value: string; group: string }[] };
  /** Operator onayi (ACK) — yalnizca kayit, uyduya komut degil. */
  acknowledged?: boolean;
  /** Alarm dustugunde kosan senaryo (varsa) — detay penceresindeki prosedur/siniflandirma icin. */
  scenarioId?: string;
}

export type InfoKind = 'note' | 'stat' | 'recommendation';

/** INFO paneline dusen zaman damgali operator notu. */
export interface InfoNote {
  id: number;
  missionT: number;
  utc: string;
  kind: InfoKind;
  title: string;
  text: string;
}

/** Dogrulanmis bir anomalinin onerisi — senaryo bittikten sonra da kalir. */
export interface OpsNotification {
  id: number;
  missionT: number;
  utc: string;
  scenarioId: string;
  scenarioName: string;
  headline: string;
  urgency: 'izle' | 'planlı' | 'acil';
  action: string;
  steps: string[];
  /** Ayni senaryonun bu oturumdaki kacinci kosusu. */
  runNo: number;
}

/** CUSUM ile hesaplanan yapisal kirilma. */
export interface StructuralBreak {
  pid: string;
  breakT: number;
  detectedT: number;
  direction: 1 | -1;
  magnitudeSigma: number;
}

export interface XaiEvidence {
  /** Kanitin yuklendigi gorev saati — seritlerdeki dikkat penceresi icin. */
  missionT: number;
  asset: string;
  caption: string;
  top_channels: string[];
  band?: string;
  model: string;
  level: 1 | 2 | 3;
}
