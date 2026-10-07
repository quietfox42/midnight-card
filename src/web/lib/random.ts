import { RANDOM_PREFIX_LENGTH } from '../../shared/address';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ALPHABET = LETTERS + '0123456789';

/** 从 chars 里均匀取 count 个字符。拒绝采样避免取模偏差。 */
function pick(chars: string, count: number): string {
  const limit = 256 - (256 % chars.length); // 小于 limit 的字节取模后才是均匀的
  const buf = new Uint8Array(count * 2);
  let out = '';
  while (out.length < count) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < count) out += chars[b % chars.length];
    }
  }
  return out;
}

/** 纯前端生成随机前缀，不请求后端。第一个字符用字母，看起来更像正常地址。 */
export function randomPrefix(length = RANDOM_PREFIX_LENGTH): string {
  return pick(LETTERS, 1) + pick(ALPHABET, length - 1);
}
