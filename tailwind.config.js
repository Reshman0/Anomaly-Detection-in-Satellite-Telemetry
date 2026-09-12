/** @type {import('tailwindcss').Config} */

/**
 * Renkler CSS degiskenlerinden okunur (src/index.css `:root`), boylece
 * erisilebilirlik paleti (yuksek kontrast, renk gorme modlari) calisma
 * zamaninda tum Tailwind siniflarini ve canvas cizimlerini birlikte degistirir.
 * `<alpha-value>` Tailwind'in /10, /[0.06] gibi saydamlik eklerini korur.
 */
const v = (name) => `rgb(var(--ops-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ops: {
          bg: v('bg'),
          panel: v('panel'),
          sunken: v('sunken'),
          line: v('line'),
          line2: v('line2'),
          text: v('text'),
          dim: v('dim'),
          faint: v('faint'),
          nominal: v('nominal'),
          soft: v('soft'),
          warn: v('warn'),
          hard: v('hard'),
          ai: v('ai'),
          aiDim: v('aiDim'),
        },
      },
      fontFamily: {
        // Yalnızca yerel/sistem fontları — hiçbir ağ isteği yok (§1).
        mono: ['Consolas', 'Cascadia Mono', 'DejaVu Sans Mono', 'Menlo', 'monospace'],
        sans: ['Segoe UI', 'Inter', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', '13px'],
        '3xs': ['9px', '12px'],
      },
    },
  },
  plugins: [],
};
