/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ops: {
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
          hard: '#E24A5F',
          ai: '#A184F5',
          aiDim: '#6B54B0',
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
