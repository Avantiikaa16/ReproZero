import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // server-only throws unconditionally outside Next's own bundler —
      // aliased to a no-op so tests can import server-side modules directly.
      'server-only': fileURLToPath(new URL('./test/server-only-mock.ts', import.meta.url)),
    },
  },
});
