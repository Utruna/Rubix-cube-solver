import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode standalone` produit un unique index.html sans backend ni détection caméra.
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone'
  return {
    plugins: [react(), ...(standalone ? [viteSingleFile()] : [])],
    define: standalone ? { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1') } : {},
    build: standalone ? { outDir: 'dist-standalone' } : {},
    server: {
      proxy: {
        '/api': { target: 'http://localhost:5000', changeOrigin: true },
        '/health': { target: 'http://localhost:5000', changeOrigin: true },
      },
    },
    worker: { format: 'es' },
  }
})
