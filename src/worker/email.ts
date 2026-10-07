import PostalMime from 'postal-mime';
import { checkPrefix, parseList, RESERVED_PREFIXES } from '../shared/address';
import { num, type Env } from './env';
import { extract } from './extract';

/** 收信：校验 → 解析 → 截断 → 提取 → 单条 INSERT。整封邮件只写 D1 一次。 */
export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const maxRaw = num(env.MAX_RAW_BYTES, 1024 * 1024, 1024);
  if (message.rawSize > maxRaw) {
    message.setReject(`Message too large (limit ${maxRaw} bytes)`);
    return;
  }

  const sender = message.from.toLowerCase();
  const senderDomain = sender.slice(sender.lastIndexOf('@') + 1);
  const blocked = parseList(env.BLOCKED_SENDERS);
  if (blocked.includes(sender) || blocked.includes(senderDomain)) {
    message.setReject('Sender blocked');
    return;
  }

  const to = message.to.toLowerCase();
  const at = to.lastIndexOf('@');
  const prefix = to.slice(0, at);
  if (to.slice(at + 1) !== env.DOMAIN.toLowerCase()) {
    message.setReject('Unknown recipient domain');
    return;
  }
  const extraReserved = parseList(env.EXTRA_RESERVED);
  const prefixError = checkPrefix(prefix, extraReserved);
  if (prefixError === 'reserved' && env.FORWARD_TO) {
    await message.forward(env.FORWARD_TO);
    return;
  }
  if (prefixError) {
    message.setReject(RESERVED_PREFIXES.includes(prefix) ? 'Mailbox unavailable' : 'Invalid recipient');
    return;
  }

  // 附件不会被保存；用 base64 编码可以避免为每个附件分配 ArrayBuffer 拷贝
  const email = await PostalMime.parse(message.raw, { attachmentEncoding: 'base64', maxRfc822NestingDepth: 0 });

  const maxBody = num(env.MAX_BODY_BYTES, 200 * 1024, 1024);
  let text = email.text ?? '';
  let html = email.html ?? '';
  // 字符数近似字节数即可；text 优先保留，html 用剩余预算
  text = text.slice(0, maxBody);
  html = html.slice(0, Math.max(0, maxBody - text.length));

  const subject = (email.subject ?? '').slice(0, 512);
  const from = formatFrom(email.from) || message.from;
  const { code, link } = extract(subject, text, html);

  await env.DB.prepare(
    'INSERT INTO emails (address, sender, subject, text, html, code, link, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(to, from.slice(0, 320), subject, text || null, html || null, code, link, Date.now())
    .run();
}

function formatFrom(from: { name: string; address?: string } | undefined): string {
  if (!from) return '';
  if (from.address && from.name) return `${from.name} <${from.address}>`;
  return from.address || from.name || '';
}
