import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Express API (and the QBO OAuth callback) — keeps the browser on the Vite origin in dev.
      '/api': 'http://localhost:3001',
    },
  },
})
