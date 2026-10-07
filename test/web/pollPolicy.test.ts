import { describe, expect, it } from 'vitest';
import { nextDelay, POLL } from '../../src/web/lib/pollPolicy';

const mid = () => 0.5; // 抖动取中值
const base = 10_000;

describe('nextDelay', () => {
  it('正常：基础间隔；5 分钟没有新邮件放慢到 30 秒', () => {
    expect(nextDelay({ outcome: 'ok', base, failures: 0, sinceNew: 0 }, mid)).toBe(base);
    expect(nextDelay({ outcome: 'ok', base, failures: 0, sinceNew: POLL.idleAfter + 1 }, mid)).toBe(POLL.idle);
    expect(nextDelay({ outcome: 'ok', base: 60_000, failures: 0, sinceNew: POLL.idleAfter + 1 }, mid)).toBe(60_000);
  });

  it('失败：20s → 40s → 80s → 封顶 120s', () => {
    const seq = [1, 2, 3, 4, 8].map((failures) => nextDelay({ outcome: 'error', base, failures, sinceNew: 0 }, mid));
    expect(seq).toEqual([20_000, 40_000, 80_000, 120_000, 120_000]);
  });

  it('失败时抖动在 ±20% 内', () => {
    expect(nextDelay({ outcome: 'error', base, failures: 1, sinceNew: 0 }, () => 0)).toBe(16_000);
    expect(nextDelay({ outcome: 'error', base, failures: 1, sinceNew: 0 }, () => 1)).toBe(24_000);
  });

  it('限流：按 Retry-After，没有就 60 秒，不低于基础间隔', () => {
    expect(nextDelay({ outcome: 'rate_limited', base, failures: 0, sinceNew: 0 }, mid)).toBe(60_000);
    expect(nextDelay({ outcome: 'rate_limited', base, failures: 0, sinceNew: 0, retryAfterMs: 5_000 }, mid)).toBe(base);
    expect(nextDelay({ outcome: 'rate_limited', base, failures: 0, sinceNew: 0, retryAfterMs: 90_000 }, mid)).toBe(90_000);
  });
});
