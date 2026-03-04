import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://us-central1-ridemanager-pwa.cloudfunctions.net",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
    },
  },
})
