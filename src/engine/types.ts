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
}

export interface XaiEvidence {
  asset: string;
  caption: string;
  top_channels: string[];
  band?: string;
  model: string;
  level: 1 | 2 | 3;
}
