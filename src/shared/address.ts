// 前端与 Worker 共用的地址规则。改这里两端同时生效。

export const PREFIX_MIN = 3;
export const PREFIX_MAX = 32;
export const RANDOM_PREFIX_LENGTH = 8;

const PREFIX_RE = /^[a-z0-9._-]{3,32}$/;

export const RESERVED_PREFIXES: readonly string[] = [
  'admin', 'administrator', 'root', 'postmaster', 'hostmaster', 'webmaster',
  'abuse', 'support', 'security', 'noreply', 'no-reply', 'mailer-daemon',
  'info', 'contact', 'help', 'billing', 'sales', 'legal', 'privacy',
  'ssl-admin', 'domains', 'dmarc', 'system', 'www',
];

export type PrefixError = 'length' | 'chars' | 'dots' | 'reserved';

/** 返回 null 表示合法。extraReserved 来自 EXTRA_RESERVED 变量。 */
export function checkPrefix(prefix: string, extraReserved: readonly string[] = []): PrefixError | null {
  if (prefix.length < PREFIX_MIN || prefix.length > PREFIX_MAX) return 'length';
  if (!PREFIX_RE.test(prefix)) return 'chars';
  // 首尾不能是点，也不能有连续的点，否则不是合法的 local-part
  if (prefix.startsWith('.') || prefix.endsWith('.') || prefix.includes('..')) return 'dots';
  if (RESERVED_PREFIXES.includes(prefix) || extraReserved.includes(prefix)) return 'reserved';
  return null;
}

export const PREFIX_ERROR_TEXT: Record<PrefixError, string> = {
  length: `长度需为 ${PREFIX_MIN}-${PREFIX_MAX} 个字符`,
  chars: '只能包含小写字母、数字、点、下划线和连字符',
  dots: '点不能出现在开头、结尾或连续出现',
  reserved: '该前缀为保留地址，请换一个',
};

/** 拆分并校验完整地址，域名必须等于 domain。合法时返回小写地址。 */
export function normalizeAddress(
  address: string,
  domain: string,
  extraReserved: readonly string[] = [],
): string | null {
  const lower = address.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return null;
  if (lower.slice(at + 1) !== domain.toLowerCase()) return null;
  return checkPrefix(lower.slice(0, at), extraReserved) === null ? lower : null;
}

/** 可选变量的“未设置”值。一键部署页要求每个变量非空，所以默认填 none。 */
export const UNSET = 'none';

export function isUnset(value: string | undefined): boolean {
  return !value || value.trim().toLowerCase() === UNSET;
}

export function parseList(value: string | undefined): string[] {
  if (isUnset(value)) return [];
  return value!.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s && s !== UNSET);
}
