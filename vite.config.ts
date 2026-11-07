import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { licenses } from './scripts/licenses';

/** The commit this build is made from: its short hash and date, and (dev) when the tree has changes; `unknown` without git. */
function version(): string {
  try {
    const run = (cmd: string) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return run('git log -1 --format="%h · %cs"') + (run('git status --porcelain') ? ' (dev)' : '');
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  define: { __VERSION__: JSON.stringify(version()) },
  // Served from https://goodgriefgnome.github.io/volti/
  base: '/volti/',
  plugins: [
    licenses(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // A new version takes over only at start-up, when the page asks it to (src/updates.ts).
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{html,js,mjs,css,png,svg,webmanifest,wasm,pfb,ttf,woff2,bcmap,icc}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // The service worker is built apart, so it needs its own: its workbox code is listed too.
        buildPlugins: { vite: [licenses()] },
      },
      manifest: {
        name: 'Volti',
        short_name: 'Volti',
        description: 'Sheet music reader for performing: your PDF scores, side by side, with pen markings.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#15171c',
        theme_color: '#15171c',
        share_target: {
          action: 'share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'pdfs', accept: ['application/pdf', '.pdf', 'image/*'] }] },
        },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    // Off: it misses files new to an import.meta.glob (layers.test.ts, originals/order.test.ts), so
    // they pass here on a stale list of files and fail in CI; it saves only about half a second.
    fsModuleCache: false,
  },
});
