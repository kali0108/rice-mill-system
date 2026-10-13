import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Generates dist/sw.js at build time with the exact list of built files, so
// the whole app (every page) is cached on the phone after the first visit and
// keeps opening even with no internet. Supabase API calls are never cached.
function serviceWorker() {
  return {
    name: 'kanta-khata-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js' && f !== 'index.html');
      const publicFiles = ['manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
      const assets = [...new Set(['/', ...files.map((f) => '/' + f), ...publicFiles.map((f) => '/' + f)])];
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(fileURLToPath(new URL('./src/sw-template.js', import.meta.url)), 'utf8');
      const source = template
        .replace('__KK_VERSION__', version)
        .replace('__KK_ASSETS__', JSON.stringify(assets));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
