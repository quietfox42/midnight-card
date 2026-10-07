#!/usr/bin/env node
// 一键初始化（幂等）：
//   1. 检查 wrangler 登录状态，未登录则执行 wrangler login
//   2. 创建 D1 数据库（同名已存在则跳过）
//   3. 把 database_id 写回 wrangler.toml
//   4. 若 DOMAIN 仍是占位符，询问或使用 --domain 参数写入
//   5. 执行 schema.sql 建表（IF NOT EXISTS，可重复执行）
//
// 用法：npm run setup [-- --domain example.com]

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
const PLACEHOLDER_DOMAIN = 'example.com';
const isWindows = process.platform === 'win32';

function wrangler(args, { capture = false, allowFail = false } = {}) {
  const res = spawnSync('npx', ['--no-install', 'wrangler', ...args], {
    cwd: ROOT,
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: isWindows, // Windows 上 npx 是 .cmd
  });
  if (res.status !== 0 && !allowFail) {
    if (capture) process.stderr.write(res.stderr || res.stdout || '');
    console.error(`\n✖ wrangler ${args.join(' ')} 失败`);
    process.exit(res.status ?? 1);
  }
  return res;
}

function parseJson(text) {
  // wrangler 可能在 JSON 前打印横幅，截取第一个 [ 或 {
  const start = text.search(/[[{]/);
  return JSON.parse(start >= 0 ? text.slice(start) : text);
}

const step = (n, msg) => console.log(`\n[${n}/5] ${msg}`);

// ---------- 1. 登录 ----------
step(1, '检查 Cloudflare 登录状态');
let who = wrangler(['whoami', '--json'], { capture: true, allowFail: true });
if (who.status !== 0) {
  console.log('未登录，打开浏览器登录…');
  wrangler(['login']);
  who = wrangler(['whoami', '--json'], { capture: true });
}
try {
  const info = parseJson(who.stdout);
  console.log(`✔ 已登录：${info.email ?? '(API token)'}`);
} catch {
  console.log('✔ 已登录');
}

// ---------- 2. D1 ----------
let toml = readFileSync(CONFIG, 'utf8');
const nameMatch = /\[\[d1_databases\]\][\s\S]*?database_name\s*=\s*"([^"]+)"/.exec(toml);
if (!nameMatch) {
  console.error('✖ wrangler.toml 中找不到 [[d1_databases]] database_name');
  process.exit(1);
}
const dbName = nameMatch[1];

step(2, `准备 D1 数据库 "${dbName}"`);
const findDb = () => {
  const list = parseJson(wrangler(['d1', 'list', '--json'], { capture: true }).stdout);
  return list.find((db) => db.name === dbName);
};
let db = findDb();
if (db) {
  console.log(`✔ 已存在，跳过创建（${db.uuid}）`);
} else {
  wrangler(['d1', 'create', dbName], { capture: true });
  db = findDb();
  if (!db) {
    console.error('✖ 创建后仍找不到数据库');
    process.exit(1);
  }
  console.log(`✔ 已创建（${db.uuid}）`);
}

// ---------- 3. 回写 database_id ----------
step(3, '写入 database_id 到 wrangler.toml');
const blockRe = /(\[\[d1_databases\]\][^[]*?database_name\s*=\s*"[^"]+")(\s*\n\s*database_id\s*=\s*"[^"]*")?/;
const nextToml = toml.replace(blockRe, `$1\ndatabase_id = "${db.uuid}"`);
if (nextToml === toml) {
  console.log('✔ 已是最新，无需修改');
} else {
  toml = nextToml;
  writeFileSync(CONFIG, toml);
  console.log('✔ 已写入');
}

// ---------- 4. 域名 ----------
step(4, '检查收信域名 DOMAIN');
const domainRe = /^(DOMAIN\s*=\s*)"([^"]*)"/m;
const currentDomain = domainRe.exec(toml)?.[2];
const argIndex = process.argv.indexOf('--domain');
let domain = argIndex > 0 ? process.argv[argIndex + 1] : undefined;
if (!domain && (!currentDomain || currentDomain === PLACEHOLDER_DOMAIN)) {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    domain = (await rl.question('请输入收信域名（例如 mail.example.org，已托管在 Cloudflare）：')).trim();
    rl.close();
  } else {
    console.log('⚠ DOMAIN 仍是占位符 example.com，请稍后修改 wrangler.toml 或使用 --domain 参数');
  }
}
if (domain) {
  domain = domain.toLowerCase();
  if (!/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    console.error(`✖ 域名格式不正确：${domain}`);
    process.exit(1);
  }
  if (domain !== currentDomain) {
    toml = toml.replace(domainRe, `$1"${domain}"`);
    writeFileSync(CONFIG, toml);
    console.log(`✔ DOMAIN = ${domain}`);
  } else {
    console.log(`✔ DOMAIN 已是 ${domain}`);
  }
} else if (currentDomain && currentDomain !== PLACEHOLDER_DOMAIN) {
  console.log(`✔ DOMAIN = ${currentDomain}`);
}

// ---------- 5. 建表 ----------
step(5, '执行 schema.sql（可重复执行）');
wrangler(['d1', 'execute', 'DB', '--remote', '--file=schema.sql', '-y'], { capture: true });
console.log('✔ 表和索引已就绪');

console.log(`
完成。接下来：
  npm run deploy        构建前端并部署 Worker
然后在 Cloudflare 面板完成 Email Routing 的手动步骤（见 README「手动步骤」）。`);
