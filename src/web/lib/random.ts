import { RANDOM_PREFIX_LENGTH } from '../../shared/address';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 纯前端生成随机前缀，不请求后端。拒绝采样避免取模偏差。 */
export function randomPrefix(length = RANDOM_PREFIX_LENGTH): string {
  let out = '';
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 252 && out.length < length) out += ALPHABET[b % 36]; // 252 = 36 * 7
    }
  }
  // 第一个字符用字母，看起来更像正常地址
  if (/^\d/.test(out)) out = ALPHABET[(out.charCodeAt(0) - 48) % 26] + out.slice(1);
  return out;
}
