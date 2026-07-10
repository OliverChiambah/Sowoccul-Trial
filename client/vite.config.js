import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express backend so the frontend can call
// relative URLs and avoid CORS during development.
export default defineConfig({
  plugins: [react()],
  build: {
    // Split the big libraries into their own chunk so the browser caches them
    // across deploys and page loads (they change far less often than app code).
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    // Warn only for genuinely large chunks; our lazy-split pages stay well under.
    chunkSizeWarningLimit: 700,
    // Modern browsers only → smaller, faster output.
    target: 'es2019',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
