import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [],
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'Auditórium',
        short_name: 'Auditórium',
        description:
          'Tu biblioteca musical personal, guardada en este navegador.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0c0c0e',
        theme_color: '#0c0c0e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'auditorium-shell',
        globPatterns: ['index.html', 'assets/*.{js,css}', 'icons/*.{png,svg}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [
          /^\/(?:\?.*)?$/,
          /^\/index\.html(?:\?.*)?$/,
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
          groups: [{ name: 'storage', test: /node_modules[\\/]dexie[\\/]/ }],
        },
      },
    },
  },
})
