import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  root: 'src/web',
  cacheDir: '../../node_modules/.vite/web',
  publicDir: false,
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['../../test/web/**/*.test.ts'],
  },
});
