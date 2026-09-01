/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // LIFT UP sunum sablonundan turetilen palet — src/ui/colors.ts ile ayni.
      colors: {
        ops: {
          bg: '#071A2E',
          panel: '#0D2842',
          sunken: '#05121F',
          line: '#17385A',
          line2: '#255081',
          text: '#D9DEE5',
          dim: '#ADB4C9',
          faint: '#5C6B80',
          nominal: '#449E4A',
          soft: '#D6A361',
          hard: '#C23735',
          ai: '#9B7ACF',
          aiDim: '#3E2A56',
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
