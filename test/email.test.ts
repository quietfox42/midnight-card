import PostalMime from 'postal-mime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { byteLength, handleEmail, truncateBytes } from '../src/worker/email';
import { createEnv, DOMAIN } from './helpers/env';
import type { Env } from '../src/worker/env';

const NOW = 1_800_000_000_000;

interface Sent {
  rejected: string | null;
  forwarded: string | null;
}

function message(raw: string, opts: { from?: string; to?: string } = {}): { msg: ForwardableEmailMessage; sent: Sent } {
  const bytes = new TextEncoder().encode(raw);
  const headerEnd = raw.search(/\r?\n\r?\n/);
  const headers = new Headers();
  for (const line of raw.slice(0, headerEnd < 0 ? raw.length : headerEnd).split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const sent: Sent = { rejected: null, forwarded: null };
  const msg = {
    from: opts.from ?? 'sender@example.org',
    to: opts.to ?? `abc@${DOMAIN}`,
    raw: new Response(bytes).body!,
    rawSize: bytes.length,
    headers,
    setReject: (reason: string) => void (sent.rejected = reason),
    forward: async (to: string) => void (sent.forwarded = to),
    reply: async () => {},
  } as unknown as ForwardableEmailMessage;
  return { msg, sent };
}

const eml = (body: string, extra = '') =>
  `From: Example <noreply@example.org>\r\nTo: abc@${DOMAIN}\r\nSubject: Your verification code\r\n${extra}` +
  `Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`;

async function rows(env: Env) {
  const { results } = await env.DB.prepare('SELECT * FROM emails ORDER BY id').all<Record<string, any>>();
  return results;
}

afterEach(() => vi.restoreAllMocks());

describe('收信', () => {
  it('解析、提取验证码，单条 INSERT', async () => {
    const { env, d1 } = createEnv();
    const { msg, sent } = message(eml('Your code is 482913.', 'Message-ID: <a1@example.org>\r\n'));
    await handleEmail(msg, env, NOW);
    expect(sent.rejected).toBeNull();
    expect(d1.queries).toHaveLength(1);
    const row = (await rows(env))[0]!;
    expect(row).toMatchObject({
      address: `abc@${DOMAIN}`,
      sender: 'Example <noreply@example.org>',
      subject: 'Your verification code',
      code: '482913',
      received_at: NOW,
      message_id: '<a1@example.org>',
    });
  });

  it('同一个 Message-ID 重复投递只存一次（幂等）', async () => {
    const { env } = createEnv();
    for (let i = 0; i < 3; i++) await handleEmail(message(eml('x', 'Message-ID: <dup@example.org>\r\n')).msg, env, NOW);
    expect(await rows(env)).toHaveLength(1);
  });

  it('没有 Message-ID 的邮件不去重', async () => {
    const { env } = createEnv();
    await handleEmail(message(eml('x')).msg, env, NOW);
    await handleEmail(message(eml('x')).msg, env, NOW);
    expect(await rows(env)).toHaveLength(2);
  });

  it('正文按 UTF-8 字节截断', async () => {
    const { env } = createEnv({ MAX_BODY_BYTES: '2048' });
    await handleEmail(message(eml('验证码'.repeat(2000))).msg, env, NOW);
    const row = (await rows(env))[0]!;
    expect(byteLength(row.text)).toBeLessThanOrEqual(2048);
    expect(byteLength(row.text)).toBeGreaterThan(2040);
    expect(row.text).not.toContain('�');
  });

  it('解析失败时不拒收，用信头主题和原文兜底', async () => {
    const { env } = createEnv();
    vi.spyOn(PostalMime, 'parse').mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { msg, sent } = message(eml('Your code is 551203'));
    await handleEmail(msg, env, NOW);
    expect(sent.rejected).toBeNull();
    const row = (await rows(env))[0]!;
    expect(row.subject).toBe('Your verification code');
    expect(row.text).toBe('Your code is 551203');
    expect(row.code).toBe('551203');
  });

  it('D1 出错时抛出，让对方 MTA 重试', async () => {
    const { env } = createEnv();
    env.DB = { prepare: () => ({ bind: () => ({ run: () => Promise.reject(new Error('D1 down')) }) }) } as unknown as D1Database;
    await expect(handleEmail(message(eml('x')).msg, env, NOW)).rejects.toThrow('D1 down');
  });
});

describe('拒收与转发', () => {
  it('超过大小上限', async () => {
    const { env, d1 } = createEnv({ MAX_RAW_BYTES: '1024' });
    const { msg, sent } = message(eml('x'.repeat(2000)));
    await handleEmail(msg, env, NOW);
    expect(sent.rejected).toMatch(/too large/);
    expect(d1.queries).toHaveLength(0);
  });

  it('黑名单发件人和域名', async () => {
    const { env } = createEnv({ BLOCKED_SENDERS: 'bad.org, spam@x.test' });
    const a = message(eml('x'), { from: 'Anyone@BAD.org' });
    const b = message(eml('x'), { from: 'spam@x.test' });
    await handleEmail(a.msg, env, NOW);
    await handleEmail(b.msg, env, NOW);
    expect(a.sent.rejected).toBe('Sender blocked');
    expect(b.sent.rejected).toBe('Sender blocked');
  });

  it('域名不对、前缀非法', async () => {
    const { env } = createEnv();
    const a = message(eml('x'), { to: 'abc@other.test' });
    const b = message(eml('x'), { to: `a+b@${DOMAIN}` });
    await handleEmail(a.msg, env, NOW);
    await handleEmail(b.msg, env, NOW);
    expect(a.sent.rejected).toBe('Unknown recipient domain');
    expect(b.sent.rejected).toBe('Invalid recipient');
  });

  it('保留前缀：配置了 FORWARD_TO 时转发，否则拒收', async () => {
    const fwd = createEnv({ FORWARD_TO: ' me@real.test ' });
    const a = message(eml('x'), { to: `postmaster@${DOMAIN}` });
    await handleEmail(a.msg, fwd.env, NOW);
    expect(a.sent.forwarded).toBe('me@real.test');

    const { env } = createEnv();
    const b = message(eml('x'), { to: `postmaster@${DOMAIN}` });
    await handleEmail(b.msg, env, NOW);
    expect(b.sent.rejected).toBe('Mailbox unavailable');
  });
});

describe('truncateBytes', () => {
  it.each([
    ['ascii', 'abcdef', 4, 'abcd'],
    ['不切断中文', '中文字', 7, '中文'],
    ['不切断代理对', 'a😀b', 3, 'a'],
    ['刚好放下', 'a😀b', 6, 'a😀b'],
    ['预算为 0', 'abc', 0, ''],
  ])('%s', (_, input, max, expected) => {
    expect(truncateBytes(input, max)).toBe(expected);
  });
});
