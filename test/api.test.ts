import { describe, expect, it } from 'vitest';
import { handleApi, PAGE_SIZE } from '../src/worker/api';
import { insert } from './helpers/d1';
import { createEnv, DOMAIN } from './helpers/env';

const NOW = 1_800_000_000_000;
const HOUR = 3600_000;
const ADDR = `abc@${DOMAIN}`;

const get = (path: string) => new Request(`https://x.test${path}`);
const body = async (r: Response) => (await r.json()) as Record<string, any>;
const list = (since = 0, address = ADDR) => get(`/api/messages?address=${encodeURIComponent(address)}&since=${since}`);

describe('路由', () => {
  it('/api/config 不查库，带浏览器缓存', async () => {
    const { env, d1 } = createEnv();
    const r = await handleApi(get('/api/config'), env, NOW);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('max-age=3600');
    expect((await body(r)).domain).toBe(DOMAIN);
    expect(d1.queries).toHaveLength(0);
  });

  it('未知路径直接 404，不校验地址也不查库', async () => {
    const { env, d1 } = createEnv();
    const r = await handleApi(get('/api/nope'), env, NOW);
    expect(r.status).toBe(404);
    expect(d1.queries).toHaveLength(0);
  });

  it('非 GET 返回 405', async () => {
    const { env } = createEnv();
    expect((await handleApi(new Request('https://x.test/api/messages', { method: 'POST' }), env, NOW)).status).toBe(405);
  });

  it('非法地址和非法 since 返回 400', async () => {
    const { env, d1 } = createEnv();
    expect((await handleApi(list(0, 'admin@mail.test'), env, NOW)).status).toBe(400);
    expect((await handleApi(list(0, 'abc@other.test'), env, NOW)).status).toBe(400);
    expect((await handleApi(get(`/api/messages?address=${ADDR}&since=-1`), env, NOW)).status).toBe(400);
    expect((await handleApi(get(`/api/messages?address=${ADDR}&since=1.5`), env, NOW)).status).toBe(400);
    expect(d1.queries).toHaveLength(0);
  });

  it('被限流时 429 + Retry-After，不查库', async () => {
    const { env, d1 } = createEnv({ API_LIMITER: { limit: async () => ({ success: false }) } as unknown as RateLimit });
    const r = await handleApi(list(), env, NOW);
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(d1.queries).toHaveLength(0);
  });

  it('D1 出错时返回 JSON 500 而不是抛出', async () => {
    const { env } = createEnv();
    env.DB = { prepare: () => { throw new Error('D1 down'); } } as unknown as D1Database;
    const original = console.error;
    console.error = () => {};
    try {
      const r = await handleApi(list(), env, NOW);
      expect(r.status).toBe(500);
      expect(await body(r)).toEqual({ error: 'internal' });
    } finally {
      console.error = original;
    }
  });
});

describe('列表', () => {
  it('首次加载：最新一页、倒序、排除过期和别人的邮件，1 次查询', async () => {
    const { env, d1 } = createEnv();
    insert(d1, [
      { address: ADDR, received_at: NOW - 25 * HOUR, subject: 'expired' },
      { address: ADDR, received_at: NOW - 2 * HOUR, subject: 'old' },
      { address: `zzz@${DOMAIN}`, received_at: NOW, subject: 'other' },
      { address: ADDR, received_at: NOW - HOUR, subject: 'new', html: '<p>x</p>' },
    ]);
    const r = await body(await handleApi(list(), env, NOW));
    expect(r.messages.map((m: any) => m.subject)).toEqual(['new', 'old']);
    expect(r.messages[0].has_html).toBe(1);
    expect(r.messages[0]).not.toHaveProperty('text');
    expect(r.more).toBe(false);
    expect(d1.queries).toHaveLength(1);
  });

  it('两次轮询之间到了很多封：按 more 续拉，一封不漏（旧实现会跳过最早的 70 封）', async () => {
    const { env, d1 } = createEnv();
    insert(d1, [{ address: ADDR, received_at: NOW }]);
    const first = await body(await handleApi(list(), env, NOW));
    let since = first.messages[0].id as number;

    const burst = 120;
    insert(d1, Array.from({ length: burst }, (_, i) => ({ address: ADDR, received_at: NOW, subject: `m${i}` })));
    d1.queries.length = 0;

    const got: number[] = [];
    let more = true;
    while (more) {
      const r = await body(await handleApi(list(since), env, NOW));
      const ids = r.messages.map((m: any) => m.id as number);
      // 每页内部仍是倒序，方便前端直接拼在列表最前面
      expect(ids).toEqual([...ids].sort((a, b) => b - a));
      got.push(...ids);
      since = Math.max(since, ...ids);
      more = r.more;
    }
    expect(new Set(got).size).toBe(burst);
    expect(d1.queries).toHaveLength(Math.ceil(burst / PAGE_SIZE));
  });

  it('没有新邮件时返回空页', async () => {
    const { env, d1 } = createEnv();
    insert(d1, [{ address: ADDR, received_at: NOW }]);
    const r = await body(await handleApi(list(1), env, NOW));
    expect(r).toEqual({ messages: [], more: false });
  });
});

describe('详情', () => {
  it('必须同时匹配地址；过期即 404；缓存时长不超过剩余保留时间', async () => {
    const { env, d1 } = createEnv();
    insert(d1, [
      { address: ADDR, received_at: NOW - 23 * HOUR },
      { address: ADDR, received_at: NOW - 25 * HOUR },
    ]);
    const ok = await handleApi(get(`/api/messages/1?address=${ADDR}`), env, NOW);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('private, max-age=3600');
    expect((await body(ok)).message.text).toBe('body');

    expect((await handleApi(get(`/api/messages/1?address=zzz@${DOMAIN}`), env, NOW)).status).toBe(404);
    expect((await handleApi(get(`/api/messages/2?address=${ADDR}`), env, NOW)).status).toBe(404);
    expect(d1.queries).toHaveLength(3);
  });
});
