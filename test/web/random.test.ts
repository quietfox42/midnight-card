import { describe, expect, it } from 'vitest';
import { checkPrefix } from '../../src/shared/address';
import { randomPrefix } from '../../src/web/lib/random';

describe('randomPrefix', () => {
  it('长度正确、首字符是字母、总是合法前缀', () => {
    for (let i = 0; i < 2000; i++) {
      const p = randomPrefix();
      expect(p).toMatch(/^[a-z][a-z0-9]{7}$/);
      expect(checkPrefix(p)).toBeNull();
    }
  });

  it('首字母均匀分布（旧实现把数字开头映射到 a–j，这 10 个字母出现概率是其它的 2 倍）', () => {
    const n = 52_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const c = randomPrefix()[0]!;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const expected = n / 26;
    const ratios = [...counts.values()].map((v) => v / expected);
    expect(counts.size).toBe(26);
    expect(Math.max(...ratios)).toBeLessThan(1.1);
    expect(Math.min(...ratios)).toBeGreaterThan(0.9);
  });
});
