import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // En desarrollo, /api se reenvía al backend: "npm run dev:api" (Node + PostgreSQL, puerto 3000).
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://localhost:3000',
        // El backend valida que el Origin coincida con su host; en desarrollo el proxy cambia de puerto.
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'))
      }
    }
  }
})
