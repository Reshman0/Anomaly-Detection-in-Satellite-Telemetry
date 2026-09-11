/**
 * Reed-Solomon (255,223) — CCSDS 131.0-B TM Synchronization and Channel Coding.
 *
 * Alan: GF(2^8), F(x) = x^8 + x^7 + x^2 + x + 1 (0x187), ilkel eleman alpha.
 * Uretec: g(x) = PROD_{j=112..143} (x - alpha^(11 j))   -> 32 kontrol simgesi,
 * E = 16 simge hata duzeltme.
 *
 * SINIR: CCSDS simgeleri Berlekamp "dual basis" gosteriminde tasir; burada
 * geleneksel (polinom) taban kullanilir, dual-basis donusum matrisi
 * uygulanmaz. Uretec, alan ve interleave CCSDS'inkidir; kontrol simgeleri
 * gercek RS simgeleridir ama tel ustunde gorunecek bayt degerleri donusumsuz
 * oldugu icin standart kodlayicinin ciktisiyla bit-bit ayni degildir.
 * Arayuzde bu "geleneksel taban" ibaresiyle belirtilir.
 */

const FIELD_POLY = 0x187;
export const N = 255;
export const K = 223;
export const PARITY = N - K; // 32
const FIRST_ROOT = 112;
const ROOT_STEP = 11;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= FIELD_POLY;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

export function gfPow(base: number, e: number): number {
  if (base === 0) return 0;
  return EXP[(LOG[base] * e) % 255];
}

/** Uretec polinomu katsayilari, en yuksek dereceden sabit terime; monik. */
export const GENERATOR: Uint8Array = (() => {
  let g = new Uint8Array([1]);
  for (let j = FIRST_ROOT; j < FIRST_ROOT + PARITY; j++) {
    const root = gfPow(2, (ROOT_STEP * j) % 255); // alpha = 2
    const next = new Uint8Array(g.length + 1);
    for (let i = 0; i < g.length; i++) {
      next[i] ^= g[i];
      next[i + 1] ^= gfMul(g[i], root);
    }
    g = next;
  }
  return g;
})();

/** 223 veri simgesi -> 32 kontrol simgesi (sistematik kodlama). */
export function rsParity(data: Uint8Array): Uint8Array {
  if (data.length !== K) throw new Error('RS(255,223) icin ' + K + ' veri simgesi gerekir');
  const rem = new Uint8Array(PARITY);
  for (let i = 0; i < K; i++) {
    const coef = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[PARITY - 1] = 0;
    if (coef !== 0) {
      for (let j = 0; j < PARITY; j++) rem[j] ^= gfMul(GENERATOR[j + 1], coef);
    }
  }
  return rem;
}

/** Bir kod sozcugunun uretec koklerindeki sendromlari; gecerli sozcukte hepsi sifir. */
export function rsSyndromes(codeword: Uint8Array): number[] {
  const out: number[] = [];
  for (let j = FIRST_ROOT; j < FIRST_ROOT + PARITY; j++) {
    const x = gfPow(2, (ROOT_STEP * j) % 255);
    let acc = 0;
    for (let i = 0; i < codeword.length; i++) acc = gfMul(acc, x) ^ codeword[i];
    out.push(acc);
  }
  return out;
}

/**
 * Interleave derinligi I ile kodblok: veri (K*I oktet) + kontrol (PARITY*I).
 * Simge i, kod sozcugu (i mod I)'ye gider; kontrol simgeleri ayni sirayla
 * serpistirilir (CCSDS 131.0-B §4.3).
 */
export function encodeCodeblock(data: Uint8Array, interleave: number): Uint8Array {
  if (data.length !== K * interleave) throw new Error('Kodblok veri uzunlugu ' + K * interleave + ' olmali');
  const out = new Uint8Array(N * interleave);
  out.set(data, 0);
  for (let c = 0; c < interleave; c++) {
    const word = new Uint8Array(K);
    for (let i = 0; i < K; i++) word[i] = data[i * interleave + c];
    const par = rsParity(word);
    for (let k = 0; k < PARITY; k++) out[K * interleave + k * interleave + c] = par[k];
  }
  return out;
}

/** Kodbloktan c. kod sozcugunu (255 simge) geri toplar — test icin. */
export function deinterleaveWord(block: Uint8Array, interleave: number, c: number): Uint8Array {
  const w = new Uint8Array(N);
  for (let i = 0; i < N; i++) w[i] = block[i * interleave + c];
  return w;
}
