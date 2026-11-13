import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base: './' 讓建置輸出全部使用相對路徑，可部署在任意子路徑（spec §13）
export default defineConfig({
  base: './',
  plugins: [svelte()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
