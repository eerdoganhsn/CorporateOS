import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Prefer the working directory when it is this folder reached through a junction/symlink:
// import.meta.dirname is always the resolved real path, which may contain '#'.
const projectDir =
  fs.realpathSync(process.cwd()) === fs.realpathSync(import.meta.dirname) ? process.cwd() : import.meta.dirname

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Keeps junction/symlink paths as-is so dev mode can run from a path without '#'
    // (Vite's dev server cannot serve a project whose real path contains '#'; see README).
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(projectDir, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so application deploys don't invalidate them.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-vendor)/.test(id)) return 'charts'
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/]node_modules[\\/](radix-ui|@radix-ui)[\\/]/.test(id)) return 'ui'
          return 'vendor'
        },
      },
    },
  },
})
