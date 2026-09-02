import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyConfig = process.env.NODE_ENV !== 'production'
  ? {
      '/api': {
        target: `http://${process.env.BACKEND_HOST || 'localhost'}:8080`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    ...(process.env.NGROK ? { allowedHosts: ['.ngrok-free.dev'] } : {}),
    proxy: proxyConfig
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
