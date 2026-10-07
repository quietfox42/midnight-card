// 验证码与验证链接提取。收信时在 Worker 内运行一次，结果写入 D1。
// 纯函数。所有扫描都是线性的（html 用 indexOf 单遍扫描，不用会回溯的正则），
// 输入被截到 HTML_STRIP_LIMIT / SCAN_LIMIT，最坏情况也远低于 1ms。

export const SCAN_LIMIT = 5 * 1024;
/** html → 文本 时最多处理的 html 长度 */
const HTML_STRIP_LIMIT = 64 * 1024;

// 中文关键词没有单词边界；英文关键词要求单词边界，避免 "Unicode"、"barcode" 等误触发
const KEYWORD_RE =
  /验证码|校验码|驗證碼|动态码|動態碼|确认码|安全码|激活码|登录码|一次性密码|一次性密碼|\b(?:verification|verify|code|otp|passcode|pin|one[- ]time)\b/gi;
// 4-8 位字母数字；或 "123 456" / "123-456" 这类分组数字
const TOKEN_RE = /(?<![A-Za-z0-9])(\d{3}[ -]\d{3}|\d{4}[ -]\d{4}|[A-Za-z0-9]{4,8})(?![A-Za-z0-9])/g;
const URL_RE = /https?:\/\/[^\s"'<>()\[\]{}]+/gi;
const LINK_KEYWORD_RE = /verify|verification|confirm|activate|activation|validate|magic/i;
// 退订、偏好设置之类的链接即使带 confirm 也不是验证链接
const LINK_EXCLUDE_RE = /unsubscribe|opt-?out|preferences|privacy|\/help\b|support\./i;

const WINDOW_AFTER = 80;
const WINDOW_BEFORE = 40;
/** 安全阀：输入已截到 SCAN_LIMIT，正常邮件远到不了这个数 */
const MAX_KEYWORDS = 200;

export interface Extracted {
  code: string | null;
  link: string | null;
}

export function extract(subject: string, text: string | undefined, html: string | undefined): Extracted {
  const head = subject.slice(0, 256);
  const textBody = text && text.trim() ? text.slice(0, SCAN_LIMIT) : '';
  let htmlBody: string | null = null;
  const fromHtml = () => (htmlBody ??= html ? htmlToText(html).slice(0, SCAN_LIMIT) : '');

  // 先看主题 + 纯文本；纯文本经常只是“请在浏览器中查看”，找不到时再看 html
  let code = textBody ? findCode(scanText(head, textBody)) : null;
  if (!code && html) code = findCode(scanText(head, fromHtml()));
  if (!code && !textBody && !html) code = findCode(scanText(head, ''));

  const link = (textBody && findLink(textBody)) || (html ? findLink(fromHtml()) : null);
  return { code, link };
}

/** 主题放在最前面：很多服务把验证码直接写在主题里。去掉 URL，避免把链接里的数字当成验证码 */
function scanText(subject: string, body: string): string {
  return `${subject}\n${body}`.slice(0, SCAN_LIMIT).replace(URL_RE, ' ');
}

export function findCode(input: string): string | null {
  let best: { code: string; score: number } | null = null;
  let seen = 0;
  KEYWORD_RE.lastIndex = 0;
  for (let m = KEYWORD_RE.exec(input); m && seen < MAX_KEYWORDS; m = KEYWORD_RE.exec(input)) {
    seen++;
    const kwStart = m.index;
    const kwEnd = kwStart + m[0].length;
    const after = input.slice(kwEnd, kwEnd + WINDOW_AFTER);
    const beforeStart = Math.max(0, kwStart - WINDOW_BEFORE);
    const before = input.slice(beforeStart, kwStart);
    for (const c of candidates(after)) {
      const score = c.weight * 1000 - c.index; // 关键词后面，越近越好
      if (!best || score > best.score) best = { code: c.code, score };
    }
    for (const c of candidates(before)) {
      const score = c.weight * 1000 - (before.length - c.index) - 50; // 关键词前面，略低优先级
      if (!best || score > best.score) best = { code: c.code, score };
    }
  }
  return best ? best.code : null;
}

function candidates(windowText: string): { code: string; index: number; weight: number }[] {
  const out: { code: string; index: number; weight: number }[] = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(windowText); m; m = TOKEN_RE.exec(windowText)) {
    const raw = m[1]!;
    const prev = windowText[m.index - 1];
    // 价格、颜色、话题标签、@提及等不是验证码
    if (prev && '$¥€£#@%/.'.includes(prev)) continue;
    const next = windowText[m.index + raw.length];
    if (next === '%' || next === '@' || (next === '.' && /\d/.test(windowText[m.index + raw.length + 1] ?? ''))) continue;

    if (/^\d{3}[ -]\d{3}$|^\d{4}[ -]\d{4}$/.test(raw)) {
      out.push({ code: raw.replace(/[ -]/g, ''), index: m.index, weight: 3 });
      continue;
    }
    if (!/\d/.test(raw)) continue; // 必须至少含一位数字，排除普通单词
    if (/^\d+$/.test(raw)) {
      if (/^(19|20)\d{2}$/.test(raw)) continue; // 年份
      out.push({ code: raw, index: m.index, weight: 3 });
      continue;
    }
    // 字母数字混合：要求全大写或含至少 2 位数字，排除 "10px"、"h1" 之类
    const digits = raw.replace(/\D/g, '').length;
    if (/^\d+(px|pt|em|ms|kb|mb|gb)$/i.test(raw)) continue;
    if (raw === raw.toUpperCase() || digits >= 2) out.push({ code: raw, index: m.index, weight: 2 });
  }
  return out;
}

/**
 * 找验证/激活链接。关键词出现在域名或路径里得 2 分，只出现在查询参数里得 1 分；
 * 退订、隐私、帮助类链接直接跳过。同分取最先出现的。
 */
export function findLink(input: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(input); m; m = URL_RE.exec(input)) {
    const url = m[0].replace(/[.,;:!?'"]+$/, '');
    if (!LINK_KEYWORD_RE.test(url) || LINK_EXCLUDE_RE.test(url)) continue;
    const queryAt = url.search(/[?#]/);
    const score = LINK_KEYWORD_RE.test(queryAt < 0 ? url : url.slice(0, queryAt)) ? 2 : 1;
    if (score > bestScore) {
      best = url;
      bestScore = score;
      if (score === 2) break;
    }
  }
  return best;
}

// ---------------- html → 文本 ----------------

/** 整块跳过内容的标签 */
const SKIP_BLOCK = new Set(['style', 'script', 'head', 'title', 'noscript', 'template', 'svg']);
/** 结束后换行的块级标签（<br> 无论开闭都换行） */
const BREAK_AFTER = new Set(['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'blockquote', 'section']);
const TAG_NAME_RE = /^\/?([a-z][a-z0-9]*)/;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  zwnj: '',
  zwj: '',
  shy: '',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  middot: '·',
  copy: '©',
  reg: '®',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
};
const ENTITY_RE = /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g;
// 营销邮件常用零宽字符填充预览文本，会把验证码和关键词隔开
const INVISIBLE_RE = /[­​-‏⁠﻿]/g;

export function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (whole, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (cp === 0xa0) return ' ';
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * 廉价 html → 文本：保留 <a href> 中的 URL，跳过 style/script/head 等整块内容，
 * 块级标签换行，其余标签变空格，解码实体。
 *
 * 单遍扫描、只用 indexOf：每个字符最多被看常数次。
 * 找不到闭合 '>' 或闭合标签时会记住“后面再也没有了”，避免对每个起点重复扫到末尾（二次方）。
 */
export function htmlToText(input: string): string {
  const html = input.slice(0, HTML_STRIP_LIMIT);
  // 只把 ASCII 大写转小写：长度不变，下标与原文一一对应
  const lower = html.replace(/[A-Z]+/g, (s) => s.toLowerCase());
  const out: string[] = [];
  const missingClose = new Set<string>(); // 这些闭合标签在剩余文本里已确定不存在
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out.push(decodeEntities(html.slice(i)));
      break;
    }
    if (lt > i) out.push(decodeEntities(html.slice(i, lt)));

    // 注释
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end < 0) break; // 未闭合注释：后面全是注释
      i = end + 3;
      continue;
    }

    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) {
      // 后面再也没有 '>'：剩下的都当纯文本
      out.push(decodeEntities(html.slice(lt)));
      break;
    }

    const tag = lower.slice(lt + 1, gt);
    const name = TAG_NAME_RE.exec(tag)?.[1];
    i = gt + 1;
    if (!name) {
      // "<!doctype>"、"< 5" 之类：不是标签就原样保留，是声明就丢弃
      if (tag[0] !== '!' && tag[0] !== '?') out.push(decodeEntities(html.slice(lt, i)));
      continue;
    }
    const closing = tag[0] === '/';

    if (!closing && SKIP_BLOCK.has(name) && !tag.endsWith('/')) {
      const closer = `</${name}`;
      const end = missingClose.has(closer) ? -1 : lower.indexOf(closer, i);
      if (end < 0) {
        missingClose.add(closer); // 只跳过开标签本身
      } else {
        const endGt = html.indexOf('>', end);
        i = endGt < 0 ? html.length : endGt + 1;
      }
      out.push(' ');
      continue;
    }

    if (name === 'a' && !closing) {
      const href = HREF_RE.exec(html.slice(lt + 1, gt));
      const url = href && (href[1] ?? href[2] ?? href[3]);
      out.push(url ? ` ${decodeEntities(url)} ` : ' ');
      continue;
    }

    out.push(name === 'br' || (closing && BREAK_AFTER.has(name)) ? '\n' : ' ');
  }

  return out
    .join('')
    .replace(INVISIBLE_RE, '')
    .replace(/[ \t\r\f\v ]+/g, ' ');
}
