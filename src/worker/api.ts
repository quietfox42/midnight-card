import { normalizeAddress, parseList, RESERVED_PREFIXES } from '../shared/address';
import { num, type Env } from './env';

const LIST_LIMIT = 50;

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  if (url.pathname === '/api/config') {
    return json(
      {
        domain: env.DOMAIN,
        retentionHours: num(env.RETENTION_HOURS, 24, 1),
        pollSeconds: Math.max(10, num(env.POLL_SECONDS, 10)),
        reserved: [...RESERVED_PREFIXES, ...parseList(env.EXTRA_RESERVED)],
      },
      200,
      'public, max-age=3600',
    );
  }

  // 只有数据接口才做限流，/api/config 有浏览器缓存
  if (env.API_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.API_LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'rate_limited' }, 429, 'no-store', { 'Retry-After': '60' });
  }

  const address = normalizeAddress(url.searchParams.get('address') ?? '', env.DOMAIN, parseList(env.EXTRA_RESERVED));
  if (!address) return json({ error: 'invalid_address' }, 400);

  if (url.pathname === '/api/messages') {
    const since = Math.max(0, Math.floor(num(url.searchParams.get('since') ?? '0', 0)));
    // 走 idx_emails_address_id；只取元数据，不读正文
    const { results } = await env.DB.prepare(
      `SELECT id, sender, subject, code, link, received_at, html IS NOT NULL AS has_html
         FROM emails WHERE address = ? AND id > ? ORDER BY id DESC LIMIT ${LIST_LIMIT}`,
    )
      .bind(address, since)
      .all();
    return json({ messages: results });
  }

  const match = /^\/api\/messages\/(\d{1,15})$/.exec(url.pathname);
  if (match) {
    // 必须同时匹配 address，不能靠遍历 id 读到别人的邮件
    const row = await env.DB.prepare(
      'SELECT id, sender, subject, text, html, code, link, received_at FROM emails WHERE id = ? AND address = ? LIMIT 1',
    )
      .bind(Number(match[1]), address)
      .first();
    if (!row) return json({ error: 'not_found' }, 404);
    return json({ message: row }, 200, 'private, max-age=86400');
  }

  return json({ error: 'not_found' }, 404);
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
