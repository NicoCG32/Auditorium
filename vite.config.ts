import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const base = mode === 'pages' ? '/Auditorium/' : '/'

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: [],
        includeManifestIcons: false,
        manifest: {
          id: base,
          name: 'Auditórium',
          short_name: 'Auditórium',
          description:
            'Tu biblioteca musical personal, guardada en este navegador.',
          lang: 'es',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#0a0a0d',
          theme_color: '#0a0a0d',
          icons: [
            {
              src: `${base}auditorium/icons/icon-192.png`,
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: `${base}auditorium/icons/icon-512.png`,
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: `${base}auditorium/icons/icon-maskable-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cacheId: 'auditorium-shell',
          globPatterns: [
            'index.html',
            'assets/*.{js,css,png,svg,webp}',
            'auditorium/brand/wordmark-{dark,light}.svg',
            'auditorium/brand/logo-stacked.webp',
            'auditorium/backgrounds/*.{svg,webp}',
            'auditorium/icons/{favicon.svg,apple-touch-icon.png,icon-192.png,icon-512.png,icon-maskable-512.png}',
            'auditorium/decor/divider-simple.svg',
          ],
          navigateFallback: 'index.html',
          navigateFallbackAllowlist: [
            new RegExp(`^${base}(?:index\\.html)?(?:\\?.*)?$`),
          ],
          cleanupOutdatedCaches: false,
          skipWaiting: false,
          clientsClaim: true,
          runtimeCaching: [],
        },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'storage', test: /node_modules[\\/]dexie[\\/]/ },
              { name: 'cloud', test: /node_modules[\\/]@supabase[\\/]/ },
            ],
          },
        },
      },
    },
  }
})
