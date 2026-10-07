import PostalMime from 'postal-mime';
import { checkPrefix, RESERVED_PREFIXES } from '../shared/address';
import { getConfig, type Env } from './env';
import { extract } from './extract';

const MAX_SUBJECT = 512;
const MAX_SENDER = 320;
const MAX_MESSAGE_ID = 256;

/**
 * 收信：校验 → 解析 → 按字节截断 → 提取 → 单条 INSERT OR IGNORE。
 * - 解析失败不拒收：退回用信头里的主题和原文开头。
 * - 同一个 Message-ID 只存一次，所以 D1 出错时直接抛出、让对方 MTA 重试是安全的。
 */
export async function handleEmail(message: ForwardableEmailMessage, env: Env, now = Date.now()): Promise<void> {
  const cfg = getConfig(env);
  if (message.rawSize > cfg.maxRawBytes) {
    message.setReject(`Message too large (limit ${cfg.maxRawBytes} bytes)`);
    return;
  }

  const sender = message.from.toLowerCase();
  if (cfg.blocked.has(sender) || cfg.blocked.has(sender.slice(sender.lastIndexOf('@') + 1))) {
    message.setReject('Sender blocked');
    return;
  }

  const to = message.to.toLowerCase();
  const at = to.lastIndexOf('@');
  const prefix = to.slice(0, at);
  if (to.slice(at + 1) !== cfg.domain) {
    message.setReject('Unknown recipient domain');
    return;
  }
  const prefixError = checkPrefix(prefix, cfg.extraReserved);
  if (prefixError === 'reserved' && cfg.forwardTo) {
    await message.forward(cfg.forwardTo);
    return;
  }
  if (prefixError) {
    message.setReject(RESERVED_PREFIXES.includes(prefix) ? 'Mailbox unavailable' : 'Invalid recipient');
    return;
  }

  // 先整体读出（已限制在 maxRawBytes 内）：流只能读一次，解析失败时还要用原文兜底
  const raw = await new Response(message.raw).arrayBuffer();
  let parsed: Awaited<ReturnType<typeof PostalMime.parse>> | null = null;
  try {
    // 附件不会被保存；用 base64 编码可以避免为每个附件分配 ArrayBuffer 拷贝
    parsed = await PostalMime.parse(raw, { attachmentEncoding: 'base64', maxRfc822NestingDepth: 0 });
  } catch (err) {
    console.warn('postal-mime parse failed, storing raw fallback', err);
  }

  let subject: string;
  let from: string;
  let text: string;
  let html: string;
  if (parsed) {
    subject = parsed.subject ?? '';
    from = formatFrom(parsed.from) || message.from;
    // text 优先保留，html 用剩余的字节预算
    text = truncateBytes(parsed.text ?? '', cfg.maxBodyBytes);
    html = truncateBytes(parsed.html ?? '', cfg.maxBodyBytes - byteLength(text));
  } else {
    subject = message.headers.get('subject') ?? '';
    from = message.from;
    const decoded = new TextDecoder().decode(raw);
    const bodyAt = decoded.search(/\r?\n\r?\n/);
    text = truncateBytes(bodyAt < 0 ? decoded : decoded.slice(bodyAt).trimStart(), cfg.maxBodyBytes);
    html = '';
  }
  subject = subject.slice(0, MAX_SUBJECT);
  const messageId = (message.headers.get('message-id') ?? parsed?.messageId ?? '').trim().slice(0, MAX_MESSAGE_ID) || null;
  const { code, link } = extract(subject, text, html);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO emails (address, sender, subject, text, html, code, link, received_at, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(to, from.slice(0, MAX_SENDER), subject, text || null, html || null, code, link, now, messageId)
    .run();
}

function formatFrom(from: { name: string; address?: string } | undefined): string {
  if (!from) return '';
  if (from.address && from.name) return `${from.name} <${from.address}>`;
  return from.address || from.name || '';
}

const encoder = new TextEncoder();

export function byteLength(s: string): number {
  // 纯 ASCII 时长度即字节数；否则精确计算
  return /^[\x00-\x7f]*$/.test(s) ? s.length : encoder.encode(s).length;
}

/** 按 UTF-8 字节截断，不会切断多字节字符或代理对 */
export function truncateBytes(s: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (s.length * 3 <= maxBytes) return s; // 每个 UTF-16 单元最多 3 字节，必然放得下
  const { read } = encoder.encodeInto(s, new Uint8Array(maxBytes));
  return read >= s.length ? s : s.slice(0, read);
}
