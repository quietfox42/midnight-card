import react from '@vitejs/plugin-react';
import type { AtRule, Plugin as PostcssPlugin } from 'postcss';
import { defineConfig } from 'vite';

/**
 * Radix Themes 为每个布局/尺寸属性生成了 5 个断点的响应式变体（xs: sm: md: lg: xl:），
 * 占了 CSS 的大部分体积。本应用不使用响应式属性对象（如 size={{ sm: '2' }}），
 * 所以构建时删除这些规则。若以后要用响应式属性，删掉这个插件即可。
 */
const RESPONSIVE_SELECTOR = /\.(xs|sm|md|lg|xl)\\:rt-/;
function dropRadixResponsive(): PostcssPlugin {
  return {
    postcssPlugin: 'drop-radix-responsive',
    OnceExit(root) {
      root.walkRules((rule) => {
        if (rule.selectors.every((s) => RESPONSIVE_SELECTOR.test(s))) rule.remove();
      });
      root.walkAtRules('media', (at: AtRule) => {
        if (!at.nodes || at.nodes.length === 0) at.remove();
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: { plugins: [dropRadixResponsive()] },
  },
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
