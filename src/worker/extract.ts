// 验证码与验证链接提取。收信时在 Worker 内运行一次，结果写入 D1。
// 纯函数、只做线性正则扫描，输入被截到 SCAN_LIMIT，保证 CPU 时间远低于 10ms。

export const SCAN_LIMIT = 5 * 1024;
/** html → 文本 时最多处理的 html 长度，之后再截到 SCAN_LIMIT */
const HTML_STRIP_LIMIT = 64 * 1024;

// 中文关键词没有单词边界；英文关键词要求单词边界，避免 "Unicode"、"barcode" 等误触发
const KEYWORD_RE =
  /验证码|校验码|驗證碼|动态码|動態碼|确认码|安全码|激活码|登录码|一次性密码|一次性密碼|\b(?:verification|verify|code|otp|passcode|pin|one[- ]time)\b/gi;
// 4-8 位字母数字；或 "123 456" / "123-456" 这类分组数字
const TOKEN_RE = /(?<![A-Za-z0-9])(\d{3}[ -]\d{3}|\d{4}[ -]\d{4}|[A-Za-z0-9]{4,8})(?![A-Za-z0-9])/g;
const URL_RE = /https?:\/\/[^\s"'<>()\[\]{}]+/gi;
const LINK_KEYWORD_RE = /verify|verification|confirm|activate|activation/i;

const WINDOW_AFTER = 80;
const WINDOW_BEFORE = 40;
const MAX_KEYWORDS = 20;

export interface Extracted {
  code: string | null;
  link: string | null;
}

export function extract(subject: string, text: string | undefined, html: string | undefined): Extracted {
  const body = text && text.trim() ? text.slice(0, SCAN_LIMIT) : htmlToText(html ?? '').slice(0, SCAN_LIMIT);
  const link = findLink(body);
  // 主题放在最前面：很多服务把验证码直接写在主题里
  const scan = `${subject.slice(0, 256)}\n${body}`.slice(0, SCAN_LIMIT).replace(URL_RE, ' ');
  return { code: findCode(scan), link };
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
    const raw = m[1];
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

export function findLink(input: string): string | null {
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(input); m; m = URL_RE.exec(input)) {
    const url = m[0].replace(/[.,;:!?'"]+$/, '');
    if (LINK_KEYWORD_RE.test(url)) return url;
  }
  return null;
}

/** 廉价 html → 文本：保留 <a href> 中的 URL，去掉 style/script/标签，解码常见实体 */
export function htmlToText(html: string): string {
  return html
    .slice(0, HTML_STRIP_LIMIT)
    .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\r\f\v]+/g, ' ');
}
