import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Served from https://goodgriefgnome.github.io/volti/
  base: '/volti/',
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{html,js,mjs,css,png,svg,webmanifest,wasm,pfb,ttf,bcmap,icc}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
          params: { files: [{ name: 'pdfs', accept: ['application/pdf', '.pdf'] }] },
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
    include: ['tests/**/*.test.ts'],
  },
});
