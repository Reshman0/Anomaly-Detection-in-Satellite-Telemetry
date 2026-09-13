/**
 * Erişilebilirlik ayarları — konsolun tamamına tek noktadan uygulanır.
 *
 * Dayanaklar:
 *   ECSS-E-ST-10-11C  Human factors engineering (insan-makine arayüzü, okunabilirlik,
 *                     renk kodlamasının tek başına bilgi taşımaması)
 *   ECSS-E-ST-70C     Ground systems and operations (operatör ekranı gereksinimleri)
 *   ISO 9241-171      Yazılım erişilebilirliği · ISO 11064 Kontrol merkezi ergonomisi
 *   WCAG 2.2 AA       1.4.1 renk tek başına kullanılmaz · 1.4.3 kontrast ≥ 4.5:1 (AAA 7:1)
 *                     1.4.4 metin %200 ölçeklenebilir · 2.3.3 hareket azaltma · 2.4.7 odak görünür
 *
 * Renk görme modları Okabe–Ito güvenli paletinden türetilmiştir; her alarm
 * kaynağı ve şiddeti zaten bir glif (▲ ◆) ve dört bölmeli şiddet çubuğuyla
 * yedeklendiği için renk hiçbir yerde tek başına anlam taşımaz.
 */

export type ColorVision = 'normal' | 'deutan' | 'protan' | 'tritan' | 'mono';
export type Contrast = 'normal' | 'high';

export interface A11ySettings {
  contrast: Contrast;
  colorVision: ColorVision;
  /** Arayüz ölçeği: 0.85 … 1.6 (WCAG 1.4.4: %200'e kadar kayıpsız). */
  scale: number;
  /** Animasyon ve kamera sönümlemesini kapatır (WCAG 2.3.3). */
  reduceMotion: boolean;
  /** Kalın yazı ve daha geniş harf aralığı — düşük görme keskinliği için. */
  boldText: boolean;
  /** Alarm kartlarına şiddet sözcüğü + desenli kenar ekler (renkten bağımsız kodlama). */
  patternCoding: boolean;
  /** Yeni orta/yüksek şiddetli alarmda kısa sesli uyarı (WebAudio, ağ isteği yok). */
  audioAlerts: boolean;
  /** Ekran okuyucu için alarm duyurusu (aria-live). */
  announceAlarms: boolean;
  /** Odak halkası her zaman görünür (yalnızca klavye değil). */
  alwaysFocusRing: boolean;
}

export const DEFAULT_A11Y: A11ySettings = {
  contrast: 'normal',
  colorVision: 'normal',
  scale: 1,
  reduceMotion: false,
  boldText: false,
  patternCoding: false,
  audioAlerts: false,
  announceAlarms: true,
  alwaysFocusRing: false,
};

export const SCALE_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.75] as const;

export const COLOR_VISION_LABELS: Record<ColorVision, { label: string; note: string }> = {
  normal: { label: 'Standart', note: 'Yeşil / amber / turuncu / kırmızı / mor' },
  deutan: { label: 'Deuteranopi', note: 'Yeşil zayıflığı (~%6 erkek) — mavi / sarı / turuncu / macenta' },
  protan: { label: 'Protanopi', note: 'Kırmızı zayıflığı — mavi / sarı / turuncu / macenta, kırmızı kaldırıldı' },
  tritan: { label: 'Tritanopi', note: 'Mavi–sarı zayıflığı — yeşil / pembe / turuncu / kırmızı' },
  mono: { label: 'Akromatopsi', note: 'Renksiz — yalnızca parlaklık ve glifler' },
};

export interface Palette {
  bg: string;
  panel: string;
  sunken: string;
  line: string;
  line2: string;
  text: string;
  dim: string;
  faint: string;
  nominal: string;
  soft: string;
  warn: string;
  hard: string;
  ai: string;
  aiDim: string;
}

const BASE: Palette = {
  bg: '#0E1419',
  panel: '#141C23',
  sunken: '#0B1014',
  line: '#1E2A33',
  line2: '#2A3A45',
  text: '#C8D6DF',
  dim: '#788B98',
  faint: '#4A5B66',
  nominal: '#2FBF87',
  soft: '#D9A02B',
  warn: '#EF7B3A',
  hard: '#E85A6E', // #E24A5F idi; panel zemininde 4.4:1 → 5.0:1 (WCAG AA metin)
  ai: '#A184F5',
  aiDim: '#6B54B0',
};

/** Yüksek kontrast: siyah zemin, beyaz metin, doygun durum renkleri (≥ 7:1). */
const HIGH: Palette = {
  bg: '#000000',
  panel: '#05080B',
  sunken: '#000000',
  line: '#4A5A66',
  line2: '#7A8C99',
  text: '#FFFFFF',
  dim: '#C9D3DB',
  faint: '#9AA8B3',
  nominal: '#3DFF9E',
  soft: '#FFD23F',
  warn: '#FF9A3D',
  hard: '#FF5C70',
  ai: '#C9B5FF',
  aiDim: '#9C86E8',
};

/** Durum renkleri: renk görme moduna göre (Okabe–Ito tabanlı). */
const STATUS: Record<ColorVision, Pick<Palette, 'nominal' | 'soft' | 'warn' | 'hard' | 'ai' | 'aiDim'>> = {
  normal: { nominal: BASE.nominal, soft: BASE.soft, warn: BASE.warn, hard: BASE.hard, ai: BASE.ai, aiDim: BASE.aiDim },
  // Yeşil/kırmızı ekseni kaldırıldı: mavi = iyi, sarı → turuncu → macenta = kötüleşen.
  deutan: { nominal: '#4C9BE8', soft: '#F2D64B', warn: '#FF9A1F', hard: '#FF4FB0', ai: '#D0BFFF', aiDim: '#9C8AD9' },
  protan: { nominal: '#4C9BE8', soft: '#F2D64B', warn: '#FFB347', hard: '#FF4FB0', ai: '#D0BFFF', aiDim: '#9C8AD9' },
  // Mavi/sarı ekseni kaldırıldı: yeşil = iyi, pembe → turuncu → kırmızı.
  tritan: { nominal: '#2FBF87', soft: '#F48FB1', warn: '#FF6E40', hard: '#E5243B', ai: '#B388FF', aiDim: '#7E57C2' },
  // Renksiz: parlaklık merdiveni; anlam glif ve şiddet çubuğunda.
  mono: { nominal: '#8FA3AD', soft: '#BFC8CE', warn: '#E4E9EC', hard: '#FFFFFF', ai: '#D9D9D9', aiDim: '#9A9A9A' },
};

const STATUS_HIGH: Record<ColorVision, Pick<Palette, 'nominal' | 'soft' | 'warn' | 'hard' | 'ai' | 'aiDim'>> = {
  normal: { nominal: HIGH.nominal, soft: HIGH.soft, warn: HIGH.warn, hard: HIGH.hard, ai: HIGH.ai, aiDim: HIGH.aiDim },
  deutan: { nominal: '#6FB8FF', soft: '#FFE55C', warn: '#FFB055', hard: '#FF7AC8', ai: '#E0D4FF', aiDim: '#B8A6F0' },
  protan: { nominal: '#6FB8FF', soft: '#FFE55C', warn: '#FFC070', hard: '#FF7AC8', ai: '#E0D4FF', aiDim: '#B8A6F0' },
  tritan: { nominal: '#4DFFA8', soft: '#FFB3CC', warn: '#FF8A5C', hard: '#FF4D5E', ai: '#D4BBFF', aiDim: '#A88AE8' },
  mono: { nominal: '#B9C4CB', soft: '#D6DDE1', warn: '#EEF2F4', hard: '#FFFFFF', ai: '#F0F0F0', aiDim: '#BDBDBD' },
};

export function buildPalette(s: A11ySettings): Palette {
  const base = s.contrast === 'high' ? HIGH : BASE;
  const status = s.contrast === 'high' ? STATUS_HIGH[s.colorVision] : STATUS[s.colorVision];
  return { ...base, ...status };
}

function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) + ' ' + ((n >> 8) & 255) + ' ' + (n & 255);
}

/** Paleti ve davranış bayraklarını belgeye uygular. */
export function applyA11y(s: A11ySettings, palette: Palette): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(palette)) root.style.setProperty('--ops-' + k, hexToRgbTriplet(v));
  root.dataset.contrast = s.contrast;
  root.dataset.cv = s.colorVision;
  root.dataset.motion = s.reduceMotion ? 'reduce' : 'full';
  root.dataset.bold = s.boldText ? '1' : '0';
  root.dataset.pattern = s.patternCoding ? '1' : '0';
  root.dataset.focus = s.alwaysFocusRing ? 'always' : 'auto';
  root.style.setProperty('--ui-scale', String(s.scale));
}

const STORAGE_KEY = 'azs.a11y.v1';

export function loadA11y(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_A11Y, reduceMotion: prefersReducedMotion() };
    const parsed = JSON.parse(raw) as Partial<A11ySettings>;
    return { ...DEFAULT_A11Y, ...parsed };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

export function saveA11y(s: A11ySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* özel pencere / depolama kapalı: ayar oturumla sınırlı kalır */
  }
}

export function clearA11y(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* yok say */
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Basit WebAudio bip — ağ isteği yok, ses dosyası yok. Şiddete göre iki ton. */
let audioCtx: AudioContext | null = null;
export function beep(severity: number): void {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = severity >= 3 ? 880 : 620;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (severity >= 3 ? 0.35 : 0.18));
    osc.start(t);
    osc.stop(t + 0.4);
    if (severity >= 3) {
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.frequency.value = 880;
      g2.gain.value = 0.0001;
      osc2.connect(g2).connect(ctx.destination);
      g2.gain.exponentialRampToValueAtTime(0.12, t + 0.46);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc2.start(t + 0.45);
      osc2.stop(t + 0.85);
    }
  } catch {
    /* ses kapalı olabilir */
  }
}

/** WCAG göreli parlaklık ve kontrast oranı — ayar panelinde canlı gösterilir. */
export function contrastRatio(fg: string, bg: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
