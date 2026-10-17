import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3002' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
