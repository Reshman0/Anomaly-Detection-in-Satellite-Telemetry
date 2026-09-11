import apidJson from '../data/apid_table.json';
import { crc16Ccitt, u16, type BuiltPacket } from './packetBuilder';
import { K, N, encodeCodeblock } from './reedSolomon';

/**
 * CCSDS 132.0-B TM Space Data Link Protocol — Transfer Frame, ve
 * CCSDS 131.0-B TM Synchronization and Channel Coding — CADU.
 *
 * Transfer Frame (1115 oktet, RS(255,223) I=5 kodblogu icin):
 *   Birincil baslik (6)  TFVN 2 · SCID 10 · VCID 3 · OCF flag 1 · MCFC 8 · VCFC 8 ·
 *                        Data Field Status 16 (SHF 1 · Sync 1 · POF 1 · SLID 2 · FHP 11)
 *   Veri alani (1103)    paket + idle paket dolgusu (APID 2047)
 *   OCF / CLCW (4)       trailer'da, basligin parcasi degil (132.0-B §4.1.5)
 *   FECF (2)             CRC-16-CCITT
 *
 * CADU = ASM (1ACFFC1D) + RS kodblogu (1275 = 1115 veri + 160 kontrol).
 * RS kontrol simgeleri gercekten hesaplanir (bkz. reedSolomon.ts sinir notu).
 */

export type RegionKind = 'primary' | 'secondary' | 'data' | 'trailer' | 'ocf' | 'asm' | 'codeblock';

export interface ByteRegion {
  kind: RegionKind;
  name: string;
  detail: string;
  start: number;
  end: number;
}

export interface Framed {
  bytes: Uint8Array;
  regions: ByteRegion[];
  headline: string;
  footer?: string;
  fields: { name: string; bits: number; value: string }[];
}

interface ApidTable {
  scid: number;
  frame_length: number;
  rs_interleave: number;
  entries: { apid: number; vcid: number | null }[];
}

const TABLE = apidJson as unknown as ApidTable;
export const SCID = TABLE.scid;
export const RS_INTERLEAVE = TABLE.rs_interleave;
export const FRAME_LENGTH = TABLE.frame_length;
export const ASM = new Uint8Array([0x1a, 0xcf, 0xfc, 0x1d]);
export const IDLE_APID = 0x7ff;
const HDR = 6;
const OCF = 4;
const FECF = 2;

if (FRAME_LENGTH !== K * RS_INTERLEAVE) {
  throw new Error('frame_length RS kodbloguyla uyusmuyor: ' + FRAME_LENGTH + ' != ' + K * RS_INTERLEAVE);
}

export function packetRegions(p: BuiltPacket, offset = 0): ByteRegion[] {
  const PRI = 6;
  const SEC = 13;
  const total = p.bytes.length;
  const dataStart = PRI + SEC;
  const dataEnd = total - 2 - 1;
  return [
    {
      kind: 'primary',
      name: 'Birincil başlık',
      detail: 'APID ' + p.apid + ' · sekans ' + p.sequenceCount + ' · PDL ' + p.dataLength,
      start: offset,
      end: offset + PRI - 1,
    },
    {
      kind: 'secondary',
      name: 'PUS-C ikincil başlığı',
      detail: 'ST[' + String(p.service).padStart(2, '0') + ',' + p.subtype + ']',
      start: offset + PRI,
      end: offset + dataStart - 1,
    },
    { kind: 'data', name: 'Kullanıcı verisi', detail: dataEnd - dataStart + 1 + ' oktet', start: offset + dataStart, end: offset + dataEnd },
    { kind: 'trailer', name: 'Packet Error Control', detail: 'CRC-16-CCITT', start: offset + total - 2, end: offset + total - 1 },
  ];
}

export function packetView(p: BuiltPacket): Framed {
  return {
    bytes: p.bytes,
    regions: packetRegions(p),
    headline: 'CCSDS 133.0-B-2, Haziran 2020 — Space Packet Protocol · ' + p.bytes.length + ' oktet',
    fields: p.fields.map((f) => ({ name: f.name, bits: f.bits, value: f.binary ?? f.value })),
  };
}

/** Idle paket: APID 2047, ikincil baslik yok, veri alani sifir. len >= 7. */
function idlePacket(len: number): Uint8Array {
  const b = new Uint8Array(len);
  b[0] = (IDLE_APID >> 8) & 0x07;
  b[1] = IDLE_APID & 0xff;
  b[2] = 0b11 << 6;
  const dataLen = len - 6 - 1;
  b[4] = (dataLen >> 8) & 0xff;
  b[5] = dataLen & 0xff;
  return b;
}

/**
 * CLCW (Communications Link Control Word), CCSDS 232.0-B / 132.0-B §4.1.5:
 * tip 0 · surum 00 · durum 000 · COP-1 (01) · VCID · bayraklar · FARM-B · rapor.
 * Bu demoda TC yoktur: RF var, bit kilidi var, bekleme/tekrar yok, rapor 0.
 */
function clcw(vcid: number): Uint8Array {
  const b0 = (0 << 7) | (0 << 5) | (0 << 2) | 0b01;
  const b1 = (vcid & 0x3f) << 2;
  return new Uint8Array([b0, b1, 0x00, 0x00]);
}

/** Sabit uzunluklu transfer frame. Bu demoda cerceve basina bir paket tasinir. */
export function buildTmFrame(p: BuiltPacket, frameIndex: number): Framed {
  const vcid = TABLE.entries.find((e) => e.apid === p.apid)?.vcid ?? 0;
  const mcfc = frameIndex & 0xff;
  const vcfc = frameIndex & 0xff;
  const dataFieldLen = FRAME_LENGTH - HDR - OCF - FECF;
  const pktLen = Math.min(p.bytes.length, dataFieldLen);
  const fillLen = dataFieldLen - pktLen;

  const bytes = new Uint8Array(FRAME_LENGTH);
  const w0 = (0 << 14) | ((SCID & 0x3ff) << 4) | ((vcid & 0x7) << 1) | 1; // OCF flag = 1
  bytes[0] = (w0 >> 8) & 0xff;
  bytes[1] = w0 & 0xff;
  bytes[2] = mcfc;
  bytes[3] = vcfc;
  const status = (0 << 15) | (0 << 14) | (0 << 13) | (0b11 << 11) | 0; // FHP 0
  bytes[4] = (status >> 8) & 0xff;
  bytes[5] = status & 0xff;
  bytes.set(p.bytes.subarray(0, pktLen), HDR);
  if (fillLen >= 7) bytes.set(idlePacket(fillLen), HDR + pktLen);
  bytes.set(clcw(vcid), FRAME_LENGTH - FECF - OCF);
  const fecf = crc16Ccitt(bytes.subarray(0, FRAME_LENGTH - FECF));
  bytes.set(u16(fecf), FRAME_LENGTH - FECF);

  return {
    bytes,
    regions: [
      { kind: 'primary', name: 'Birincil başlık', detail: 'TFVN 0 · SCID ' + SCID + ' · VCID ' + vcid, start: 0, end: HDR - 1 },
      {
        kind: 'data',
        name: 'Veri alanı',
        detail: dataFieldLen + ' oktet · ' + p.label + ' ' + pktLen + ' + idle dolgu ' + fillLen,
        start: HDR,
        end: HDR + dataFieldLen - 1,
      },
      { kind: 'ocf', name: 'OCF (CLCW)', detail: OCF + ' oktet · başlıkta değil, sonda', start: FRAME_LENGTH - FECF - OCF, end: FRAME_LENGTH - FECF - 1 },
      { kind: 'trailer', name: 'FECF', detail: 'CRC-16-CCITT', start: FRAME_LENGTH - FECF, end: FRAME_LENGTH - 1 },
    ],
    headline: 'CCSDS 132.0-B-3 — TM Space Data Link Protocol · ' + FRAME_LENGTH + ' oktet',
    footer: 'MCFC ' + mcfc + ' · VCFC ' + vcfc,
    fields: [
      { name: 'Transfer Frame Version Number', bits: 2, value: '00' },
      { name: 'Spacecraft ID', bits: 10, value: String(SCID) },
      { name: 'Virtual Channel ID', bits: 3, value: String(vcid) },
      { name: 'OCF Flag', bits: 1, value: '1' },
      { name: 'Master Channel Frame Count', bits: 8, value: String(mcfc) },
      { name: 'Virtual Channel Frame Count', bits: 8, value: String(vcfc) },
      { name: 'First Header Pointer', bits: 11, value: '0' },
      { name: 'FECF', bits: 16, value: '0x' + fecf.toString(16).toUpperCase().padStart(4, '0') },
    ],
  };
}

/** CADU: ASM + RS(255,223) I=5 kodblogu (cerceve + gercekten hesaplanan kontrol simgeleri). */
export function buildCadu(frame: Framed): Framed {
  const block = encodeCodeblock(frame.bytes, RS_INTERLEAVE);
  const bytes = new Uint8Array(ASM.length + block.length);
  bytes.set(ASM, 0);
  bytes.set(block, ASM.length);
  return {
    bytes,
    regions: [
      { kind: 'asm', name: 'ASM 0x1ACFFC1D', detail: '1ACFFC1D', start: 0, end: ASM.length - 1 },
      {
        kind: 'codeblock',
        name: 'Reed-Solomon kodblok (' + N + ',' + K + ') I=' + RS_INTERLEAVE,
        detail: block.length + ' oktet · ' + frame.bytes.length + ' veri + ' + (block.length - frame.bytes.length) + ' kontrol · geleneksel taban',
        start: ASM.length,
        end: bytes.length - 1,
      },
    ],
    headline: 'CCSDS 131.0-B — TM Synchronization and Channel Coding · ' + bytes.length + ' oktet',
    footer: 'RS E=16 · dual-basis dönüşümü uygulanmadı',
    fields: [
      { name: 'ASM', bits: 32, value: '0x1ACFFC1D' },
      { name: 'Kodblok', bits: 0, value: 'RS(255,223), I = ' + RS_INTERLEAVE },
    ],
  };
}
