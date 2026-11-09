import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The page calls the api under /api; the dev and preview servers pass those
// requests on to the api with the prefix stripped (CONTRACT.md).
const apiProxy = {
  '/api': {
    target: process.env['API_URL'] ?? 'http://127.0.0.1:18090',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    // Logic lives in modules without React or the DOM, so tests run in
    // plain Node.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
