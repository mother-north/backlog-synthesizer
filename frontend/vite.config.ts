import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5176,
    proxy: {
      '/api': {
        target: 'http://localhost:3006',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-vendor': ['antd', '@ant-design/icons'],
          'zustand-vendor': ['zustand'],
          'axios-vendor': ['axios'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
})
