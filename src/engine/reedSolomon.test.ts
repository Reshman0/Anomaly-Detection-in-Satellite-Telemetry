import { describe, expect, it } from 'vitest';
import { GENERATOR, K, N, PARITY, deinterleaveWord, encodeCodeblock, gfMul, rsParity, rsSyndromes } from './reedSolomon';

describe('Reed-Solomon (255,223) — CCSDS 131.0-B alan ve üreteç', () => {
  it('alan: her sıfırdan farklı elemanın tersi vardır (GF(2^8) 0x187)', () => {
    for (let a = 1; a < 256; a++) {
      let found = false;
      for (let b = 1; b < 256; b++) if (gfMul(a, b) === 1) { found = true; break; }
      expect(found, 'a=' + a).toBe(true);
    }
  });

  it('üreteç 32. derece ve moniktir', () => {
    expect(GENERATOR.length).toBe(PARITY + 1);
    expect(GENERATOR[0]).toBe(1);
  });

  it('kodlanan sözcüğün 32 sendromu da sıfırdır', () => {
    const data = new Uint8Array(K);
    let x = 12345;
    for (let i = 0; i < K; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; data[i] = x & 0xff; }
    const cw = new Uint8Array(N);
    cw.set(data, 0);
    cw.set(rsParity(data), K);
    expect(rsSyndromes(cw).every((s) => s === 0)).toBe(true);
  });

  it('tek simge hatası sendromları bozar', () => {
    const data = new Uint8Array(K).fill(0x5a);
    const cw = new Uint8Array(N);
    cw.set(data, 0);
    cw.set(rsParity(data), K);
    cw[100] ^= 0x01;
    expect(rsSyndromes(cw).some((s) => s !== 0)).toBe(true);
  });

  it('I=5 kodblokta beş sözcüğün hepsi geçerlidir', () => {
    const I = 5;
    const data = new Uint8Array(K * I);
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + 11) & 0xff;
    const block = encodeCodeblock(data, I);
    expect(block.length).toBe(N * I);
    for (let c = 0; c < I; c++) {
      expect(rsSyndromes(deinterleaveWord(block, I, c)).every((s) => s === 0), 'sözcük ' + c).toBe(true);
    }
  });
});
