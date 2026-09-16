import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Same .env the server reads, so changing PORT there also moves the dev proxy.
  const apiPort = loadEnv(mode, process.cwd(), '').PORT || '3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    build: { outDir: 'dist/client' },
  };
});
