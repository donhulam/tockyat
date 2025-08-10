import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const port =
    Number(process.env.PORT) ||
    Number(env.PORT) ||
    4173;

  const allowedHosts = (process.env.ALLOWED_HOSTS || env.ALLOWED_HOSTS || 'tockyat.trolyai.io.vn')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);

  return {
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    preview: {
      host: true,
      port,
      strictPort: true,
      allowedHosts,
    },
    // Tuỳ chọn: áp dụng tương tự cho môi trường dev (nếu chạy qua proxy/domain)
    server: {
      host: true,
      port,
      strictPort: true,
      allowedHosts,
    },
  };
});
