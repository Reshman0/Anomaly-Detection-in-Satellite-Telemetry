/**
 * CCSDS 133.0-B-2 Space Packet + ECSS-E-ST-70-41C (PUS-C) TM ikincil basligi.
 * Gercek bit alanlari uretilir; arayuz bu ciktinin uzerinden calisir.
 *
 * Birincil baslik (6 oktet):
 *   Packet Version Number   3 bit
 *   Packet Type             1 bit   (0 = TM)
 *   Secondary Header Flag   1 bit
 *   APID                   11 bit
 *   Sequence Flags          2 bit   (11 = unsegmented)
 *   Packet Sequence Count  14 bit
 *   Packet Data Length     16 bit   (veri alani oktet sayisi EKSI 1)
 *
 * PUS-C TM ikincil basligi (bu misyon icin 13 oktet):
 *   TM Packet PUS Version Number      4 bit  (2 = PUS-C)
 *   Spacecraft time reference status  4 bit
 *   Service Type                      8 bit
 *   Message Subtype                   8 bit
 *   Message Type Counter             16 bit
 *   Destination ID                   16 bit
 *   Time (CCSDS 301.0-B CUC)      4+2 oktet (kaba saniye + ince alt-saniye)
 *
 * Paket sonunda 2 oktet Packet Error Control (CRC-16-CCITT, poly 0x1021, init 0xFFFF).
 */

export interface PacketField {
  name: string;
  bits: number;
  value: string;
  binary?: string;
  group: 'primary' | 'secondary' | 'data' | 'trailer';
}

export interface BuiltPacket {
  bytes: Uint8Array;
  hex: string;
  apid: number;
  service: number;
  subtype: number;
  sequenceCount: number;
  messageTypeCounter: number;
  dataLength: number;
  cuc: { coarse: number; fine: number };
  fields: PacketField[];
  label: string;
}

export const PUS_VERSION = 2; // PUS-C
export const SEQ_COUNT_MAX = 16383; // 14 bit
const CCSDS_EPOCH_MS = Date.UTC(1958, 0, 1); // CCSDS 301.0-B CUC ajans epogu

const seqCounters = new Map<number, number>();
const msgTypeCounters = new Map<string, number>();

export function resetCounters(): void {
  seqCounters.clear();
  msgTypeCounters.clear();
}

/** APID basina artan, 16383'te saran paket sekans sayaci. */
export function nextSequenceCount(apid: number): number {
  const cur = seqCounters.get(apid);
  const next = cur === undefined ? 0 : (cur + 1) % (SEQ_COUNT_MAX + 1);
  seqCounters.set(apid, next);
  return next;
}

export function peekSequenceCount(apid: number): number {
  return seqCounters.get(apid) ?? 0;
}

/** Ayni APID + servis + alt tip icin artan mesaj tipi sayaci. */
function nextMsgTypeCounter(apid: number, service: number, subtype: number): number {
  const key = apid + '|' + service + '|' + subtype;
  const cur = msgTypeCounters.get(key);
  const next = cur === undefined ? 0 : (cur + 1) % 0x10000;
  msgTypeCounters.set(key, next);
  return next;
}

/** CCSDS 301.0-B CUC: 4 oktet kaba saniye + 2 oktet ince alt-saniye. */
export function toCuc(unixMs: number): { coarse: number; fine: number } {
  const secs = (unixMs - CCSDS_EPOCH_MS) / 1000;
  const coarse = Math.floor(secs) >>> 0;
  const fine = Math.floor((secs - Math.floor(secs)) * 65536) & 0xffff;
  return { coarse, fine };
}

/** ECSS-E-ST-70-41C Packet Error Control: CRC-16-CCITT, poly 0x1021, init 0xFFFF. */
export function crc16Ccitt(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

export interface BuildOptions {
  apid: number;
  service: number;
  subtype: number;
  destinationId?: number;
  timeRefStatus?: number;
  unixMs: number;
  userData: Uint8Array;
  userDataFields?: PacketField[];
}

export function buildTmPacket(o: BuildOptions): BuiltPacket {
  const destinationId = o.destinationId ?? 0x0001;
  const timeRefStatus = o.timeRefStatus ?? 0;
  const seq = nextSequenceCount(o.apid);
  const mtc = nextMsgTypeCounter(o.apid, o.service, o.subtype);
  const cuc = toCuc(o.unixMs);

  // --- ikincil baslik (13 oktet) ---
  const sec = new Uint8Array(13);
  sec[0] = ((PUS_VERSION & 0x0f) << 4) | (timeRefStatus & 0x0f);
  sec[1] = o.service & 0xff;
  sec[2] = o.subtype & 0xff;
  sec[3] = (mtc >> 8) & 0xff;
  sec[4] = mtc & 0xff;
  sec[5] = (destinationId >> 8) & 0xff;
  sec[6] = destinationId & 0xff;
  sec[7] = (cuc.coarse >>> 24) & 0xff;
  sec[8] = (cuc.coarse >>> 16) & 0xff;
  sec[9] = (cuc.coarse >>> 8) & 0xff;
  sec[10] = cuc.coarse & 0xff;
  sec[11] = (cuc.fine >> 8) & 0xff;
  sec[12] = cuc.fine & 0xff;

  // Paket veri alani = ikincil baslik + kullanici verisi + PEC(2)
  const dataFieldLen = sec.length + o.userData.length + 2;
  const dataLength = dataFieldLen - 1;

  // --- birincil baslik (6 oktet) ---
  const pri = new Uint8Array(6);
  const versionType = (0 << 5) | (0 << 4) | (1 << 3); // ver=000, type=0 (TM), sec hdr flag=1
  pri[0] = versionType | ((o.apid >> 8) & 0x07);
  pri[1] = o.apid & 0xff;
  pri[2] = (0b11 << 6) | ((seq >> 8) & 0x3f); // sequence flags = 11
  pri[3] = seq & 0xff;
  pri[4] = (dataLength >> 8) & 0xff;
  pri[5] = dataLength & 0xff;

  const withoutPec = new Uint8Array(pri.length + sec.length + o.userData.length);
  withoutPec.set(pri, 0);
  withoutPec.set(sec, pri.length);
  withoutPec.set(o.userData, pri.length + sec.length);

  const pec = crc16Ccitt(withoutPec);
  const bytes = new Uint8Array(withoutPec.length + 2);
  bytes.set(withoutPec, 0);
  bytes[bytes.length - 2] = (pec >> 8) & 0xff;
  bytes[bytes.length - 1] = pec & 0xff;

  const hexApid = '0x' + o.apid.toString(16).toUpperCase().padStart(3, '0');
  const hexDest = '0x' + destinationId.toString(16).toUpperCase().padStart(4, '0');
  const hexPec = '0x' + pec.toString(16).toUpperCase().padStart(4, '0');

  const fields: PacketField[] = [
    { name: 'Packet Version Number', bits: 3, value: '0', binary: '000', group: 'primary' },
    { name: 'Packet Type', bits: 1, value: 'TM', binary: '0', group: 'primary' },
    { name: 'Secondary Header Flag', bits: 1, value: 'var', binary: '1', group: 'primary' },
    { name: 'APID', bits: 11, value: o.apid + ' (' + hexApid + ')', group: 'primary' },
    { name: 'Sequence Flags', bits: 2, value: 'unsegmented', binary: '11', group: 'primary' },
    { name: 'Packet Sequence Count', bits: 14, value: String(seq), group: 'primary' },
    { name: 'Packet Data Length', bits: 16, value: dataLength + ' (' + dataFieldLen + '−1)', group: 'primary' },
    { name: 'TM PUS Version', bits: 4, value: PUS_VERSION + ' (PUS-C)', group: 'secondary' },
    { name: 'Time Reference Status', bits: 4, value: String(timeRefStatus), group: 'secondary' },
    { name: 'Service Type', bits: 8, value: 'ST[' + String(o.service).padStart(2, '0') + ']', group: 'secondary' },
    { name: 'Message Subtype', bits: 8, value: String(o.subtype), group: 'secondary' },
    { name: 'Message Type Counter', bits: 16, value: String(mtc), group: 'secondary' },
    { name: 'Destination ID', bits: 16, value: hexDest, group: 'secondary' },
    { name: 'Time (CUC coarse)', bits: 32, value: cuc.coarse + ' s', group: 'secondary' },
    { name: 'Time (CUC fine)', bits: 16, value: cuc.fine + '/65536', group: 'secondary' },
    ...(o.userDataFields ?? []),
    { name: 'Packet Error Control', bits: 16, value: hexPec + ' (CRC-16-CCITT)', group: 'trailer' },
  ];

  return {
    bytes,
    hex: toHex(bytes),
    apid: o.apid,
    service: o.service,
    subtype: o.subtype,
    sequenceCount: seq,
    messageTypeCounter: mtc,
    dataLength,
    cuc,
    fields,
    label: 'TM[' + o.service + ',' + o.subtype + ']',
  };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

export function u16(v: number): Uint8Array {
  return new Uint8Array([(v >> 8) & 0xff, v & 0xff]);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
