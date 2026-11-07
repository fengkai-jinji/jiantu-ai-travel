import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), '').YOLO_BACKEND_URL || 'http://127.0.0.1:8765';
  const proxy = { '/trip-api': { target: 'http://127.0.0.1:8766', changeOrigin: true, configure(proxy: any) {
    proxy.on('proxyReq', (request: any) => request.setHeader('Origin', 'http://127.0.0.1:8766'));
  } }, '/api': { target, changeOrigin: true, configure(proxy: any) {
    proxy.on('proxyReq', (request: any) => request.setHeader('Origin', new URL(target).origin));
  } } };
  return { server: { port: 5173, strictPort: true, proxy }, preview: { port: 5173, strictPort: true, proxy } };
});
