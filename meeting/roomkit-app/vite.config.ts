import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'roomkit-assets',
    chunkSizeWarningLimit: 12000,
    rollupOptions: {
      input: resolve(__dirname, 'meet.html'),
    },
  },
})
