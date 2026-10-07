import { normalizeAddress } from '../shared/address';
import { getConfig, type Config, type Env } from './env';

export const PAGE_SIZE = 50;

const SUMMARY_COLUMNS = 'id, sender, subject, code, link, received_at, html IS NOT NULL AS has_html';
const DETAIL_RE = /^\/api\/messages\/(\d{1,15})$/;

/** 每个数据请求恰好一次 D1 查询；/api/config 不查库 */
export async function handleApi(request: Request, env: Env, now = Date.now()): Promise<Response> {
  try {
    return await route(request, env, now);
  } catch (err) {
    console.error('api error', err);
    return json({ error: 'internal' }, 500);
  }
}

async function route(request: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(request.url);
  const cfg = getConfig(env);
  const isList = url.pathname === '/api/messages';
  const detail = isList ? null : DETAIL_RE.exec(url.pathname);
  const isConfig = url.pathname === '/api/config';
  if (!isList && !detail && !isConfig) return json({ error: 'not_found' }, 404);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, 'no-store', { allow: 'GET' });

  if (isConfig) {
    return json(
      { domain: cfg.domain, retentionHours: cfg.retentionHours, pollSeconds: cfg.pollSeconds, reserved: cfg.reserved },
      200,
      'public, max-age=3600',
    );
  }

  // 只有数据接口才做限流，/api/config 有浏览器缓存
  if (env.API_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.API_LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'rate_limited' }, 429, 'no-store', { 'retry-after': '60' });
  }

  const address = normalizeAddress(url.searchParams.get('address') ?? '', cfg.domain, cfg.extraReserved);
  if (!address) return json({ error: 'invalid_address' }, 400);
  // 定时清理每小时一次；在那之前已过期的邮件也不再返回
  const cutoff = now - cfg.retentionMs;

  if (isList) return listMessages(env, address, url.searchParams.get('since'), cutoff);
  return getMessage(env, cfg, address, Number(detail![1]), cutoff, now);
}

/**
 * - since=0（首次加载）：最新的一页，按 id 倒序。
 * - since>0（增量）：比 since 新的邮件按 id 正序取一页，多取一行判断 more，再倒序返回。
 *   旧实现增量也取“最新 50 封”，两次轮询之间到了 50 封以上时，较早的会被永久跳过。
 * 两种查询都走 idx_emails_address_id，只取元数据、不读正文。
 */
async function listMessages(env: Env, address: string, sinceParam: string | null, cutoff: number): Promise<Response> {
  const since = Number(sinceParam ?? 0);
  if (!Number.isSafeInteger(since) || since < 0) return json({ error: 'invalid_since' }, 400);

  if (since === 0) {
    const { results } = await env.DB.prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM emails
        WHERE address = ? AND received_at > ? ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
    )
      .bind(address, cutoff)
      .all();
    return json({ messages: results, more: false });
  }

  const { results } = await env.DB.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM emails
      WHERE address = ? AND id > ? AND received_at > ? ORDER BY id ASC LIMIT ${PAGE_SIZE + 1}`,
  )
    .bind(address, since, cutoff)
    .all();
  const more = results.length > PAGE_SIZE;
  return json({ messages: results.slice(0, PAGE_SIZE).reverse(), more });
}

async function getMessage(env: Env, cfg: Config, address: string, id: number, cutoff: number, now: number): Promise<Response> {
  // 必须同时匹配 address，不能靠遍历 id 读到别人的邮件
  const row = await env.DB.prepare(
    `SELECT id, sender, subject, text, html, code, link, received_at FROM emails
      WHERE id = ? AND address = ? AND received_at > ? LIMIT 1`,
  )
    .bind(id, address, cutoff)
    .first<{ received_at: number }>();
  if (!row) return json({ error: 'not_found' }, 404);
  // 邮件内容不会变，但缓存不能比邮件本身活得久
  const ttl = Math.max(0, Math.floor((row.received_at + cfg.retentionMs - now) / 1000));
  return json({ message: row }, 200, `private, max-age=${ttl}`);
}

function json(body: unknown, status = 200, cache = 'no-store', headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}
