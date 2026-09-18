import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true
  },
  worker: {
    format: 'es'
  },
  resolve: {
    alias: {
      '@vtable/table-export': path.resolve(
        __dirname,
        'node_modules/@visactor/vtable-plugins/es/table-export/index.js'
      )
    }
  },
  optimizeDeps: {
    include: ['exceljs', '@visactor/vtable', '@visactor/vtable-search']
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
    commonjsOptions: {
      include: [/exceljs/, /node_modules/]
    }
  }
});
