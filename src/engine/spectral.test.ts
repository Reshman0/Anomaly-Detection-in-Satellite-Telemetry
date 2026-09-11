import { describe, expect, it } from 'vitest';
import { parseBand, peak, stft } from './spectral';

describe('STFT — 1 Hz telemetri, 32 s pencere', () => {
  it('0.045 Hz sinüs tepe bin’i kanıt bandının (0.02–0.08 Hz) içine düşer', () => {
    const s: number[] = [];
    for (let t = 0; t < 90; t++) s.push(Math.sin(2 * Math.PI * 0.045 * t));
    const st = stft(s);
    const p = peak(st)!;
    const band = parseBand('0.02–0.08 Hz')!;
    expect(p.freq).toBeGreaterThanOrEqual(band[0]);
    expect(p.freq).toBeLessThanOrEqual(band[1]);
    expect(st.freqs.length).toBe(17);
    expect(st.freqs[st.freqs.length - 1]).toBeCloseTo(0.5);
  });

  it('tek örneklik sıçrama enerjiyi bütün bin’lere yayar', () => {
    const s = new Array(90).fill(0);
    s[45] = 6;
    const st = stft(s);
    // Sıçramayı ortalayan pencere
    const col = st.power[st.times.findIndex((t) => t === 46) >= 0 ? st.times.findIndex((t) => t === 46) : 15];
    const max = Math.max(...col);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    expect(max / mean).toBeLessThan(3);
  });

  it('sürüklenme (rampa) enerjisini DC ve en düşük bin’de toplar', () => {
    const s: number[] = [];
    for (let t = 0; t < 90; t++) s.push(t * 0.02);
    const p = peak(stft(s))!;
    expect(p.freqIdx).toBeLessThanOrEqual(1);
  });

  it('parseBand biçimleri', () => {
    expect(parseBand('0.02–0.08 Hz')).toEqual([0.02, 0.08]);
    expect(parseBand('0.15-0.45 Hz')).toEqual([0.15, 0.45]);
    expect(parseBand('0,1 – 0,3 Hz')).toBeNull(); // virgülle iki sayı: ilk virgül noktaya çevrilir, ikinci bozar
    expect(parseBand(undefined)).toBeNull();
    expect(parseBand('anlamsız')).toBeNull();
  });
});
