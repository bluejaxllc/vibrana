import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    // eslint-disable-next-line no-undef
    port: parseInt(process.env.PORT) || 4173,
    allowedHosts: true
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-icons': ['lucide-react'],
          'vendor-toast': ['react-hot-toast'],
          'vendor-markdown': ['react-markdown']
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})
