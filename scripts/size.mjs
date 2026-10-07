#!/usr/bin/env node
// 统计 dist/ 中各文件的原始与 gzip 体积，用于对比优化前后。无依赖。
// 用法：npm run build && node scripts/size.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const rows = walk(DIST)
  .filter((f) => /\.(js|css|html|svg|png|webp)$/.test(f))
  .map((f) => {
    const buf = readFileSync(f);
    return { file: relative(DIST, f).replace(/\\/g, '/'), raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  })
  .sort((a, b) => b.gzip - a.gzip);

const total = (ext) => rows.filter((r) => r.file.endsWith(ext)).reduce((s, r) => ({ raw: s.raw + r.raw, gzip: s.gzip + r.gzip }), { raw: 0, gzip: 0 });

for (const r of rows) console.log(`${r.file.padEnd(40)} ${String(r.raw).padStart(8)} B  gzip ${String(r.gzip).padStart(7)} B`);
for (const ext of ['.js', '.css']) {
  const t = total(ext);
  console.log(`TOTAL ${ext.padEnd(34)} ${String(t.raw).padStart(8)} B  gzip ${String(t.gzip).padStart(7)} B`);
}
