import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      strategies: 'injectManifest', // Use custom service worker
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 // 4MB
      },
      manifest: {
        name: 'FarmXpert',
        short_name: 'FarmXpert',
        description: 'Livestock Management & Analytics Platform',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module',
      }
    })
  ],
  resolve: {
    alias: {
      '@assets': path.resolve(__dirname, 'attached_assets')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    host: '0.0.0.0',
    port: 8000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      }
    }
  }
})
