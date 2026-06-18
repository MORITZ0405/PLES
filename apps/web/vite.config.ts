import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The SPA talks to the API same-origin via this dev proxy, so session cookies and
// CORS "just work". In production the API serves (or sits behind) the built assets.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
      },
    },
  },
});
