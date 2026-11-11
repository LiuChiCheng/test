import { defineConfig } from 'vite';

// base 用相對路徑：GitHub Pages 的子路徑、以及未來用 Capacitor 包成 App 都能直接運作
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
  },
});
