import mibJson from '../data/mib.json';
import apidJson from '../data/apid_table.json';
import type { ApidEntry, Mib, MibParameter } from './types';

export const MIB = mibJson as unknown as Mib;
export const APID_TABLE = apidJson.entries as unknown as ApidEntry[];

export const PARAMETERS: MibParameter[] = MIB.parameters;

const byPid = new Map(PARAMETERS.map((p) => [p.pid, p]));

export function param(pid: string): MibParameter {
  const p = byPid.get(pid);
  if (!p) throw new Error(`MIB'de tanimsiz parametre: ${pid}`);
  return p;
}

export function subsystemName(id: string): string {
  return MIB.subsystems.find((s) => s.id === id)?.name_tr ?? id;
}

export function apidLabel(apid: number): string {
  return APID_TABLE.find((e) => e.apid === apid)?.label ?? '—';
}

/** raw -> muhendislik degeri (ECSS-E-ST-70-31C dogrusal kalibrasyon egrisi). */
export function calibrate(p: MibParameter, raw: number): number {
  if (!p.calibration) return raw;
  return p.calibration.a * raw + p.calibration.b;
}

/** muhendislik degeri -> raw. Ham tipin tam sayi araligina kirpilir. */
export function decalibrate(p: MibParameter, eng: number): number | null {
  if (!p.calibration || !p.raw_type) return null;
  const raw = Math.round((eng - p.calibration.b) / p.calibration.a);
  return Math.max(0, Math.min(0xffff, raw));
}

export const RAW_WIDTH_BYTES: Record<string, number> = { u16: 2 };
