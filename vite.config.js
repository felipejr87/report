import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // usamos public/manifest.json próprio
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      // injectManifest (em vez do generateSW automático) porque o service
      // worker agora precisa escutar 'push'/'notificationclick' — o
      // generateSW só cuida de cache/instalação, sem espaço pra handler
      // customizado.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
    }),
  ],
})
