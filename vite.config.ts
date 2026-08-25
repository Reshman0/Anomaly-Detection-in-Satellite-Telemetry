import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tek dosya çıktı: `dist/index.html` içinde tüm JS/CSS/veri gömülü.
// Böylece internetsiz bir makinede `file://` ile de açılır ve hiçbir
// çalışma zamanı ağ isteği oluşmaz (bkz. yönerge §1, §10).
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 8000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any);
