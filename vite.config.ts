import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets', // 文件名带 hash，public/_headers 为 /assets/* 设置一年 immutable 缓存
    target: 'es2022',
  },
  server: {
    // `npm run dev` 时把 API 代理到 `wrangler dev`（默认 8787）
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
