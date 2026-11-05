import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// LAB463 — modo offline del staff. El service worker (sw.js) se registra SOLO
// desde las pantallas /staff (ver src/offline/register.ts) con scope "/staff",
// así la landing pública y el admin no pasan por él. Precachea el app shell
// (HTML/JS/CSS + íconos) y sirve index.html para cualquier navegación /staff*
// sin conexión. Los datos (eventos, checklist) NO los maneja el SW: van a
// IndexedDB desde src/offline/.
//
// El manifest se linkea dinámicamente en /staff (ver src/offline/register.ts)
// en vez de en index.html: si no, la landing también se ofrecería como "app
// instalable" con start_url /staff.
//
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production' && !env.VITE_API_URL?.trim()) {
    throw new Error(
      'VITE_API_URL is required for production builds. Set it in the environment before running vite build.',
    )
  }

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'generateSW',
        injectRegister: false,
        manifest: false,
        workbox: {
          // Solo lo necesario para arrancar: no las decenas de imágenes/video de la landing.
          globPatterns: ['**/*.{js,css,html}', 'staff-icons/*.png'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackAllowlist: [/^\/staff/],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-css' },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-files',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Logos/íconos que usan las pantallas de staff (mismo origen, hasheados).
              urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'app-images',
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60 },
              },
            },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
    // Para probar el modo offline con `vite build && vite preview` (el service
    // worker no corre en `vite dev`).
    preview: {
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
  }
})
