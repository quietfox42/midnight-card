// 轮询节奏。纯函数，便于单测；useInbox 只负责执行。

export const POLL = {
  /** 正常间隔下限（与服务端 POLL_SECONDS 取大） */
  min: 10_000,
  /** 这么久没有新邮件就放慢 */
  idleAfter: 5 * 60_000,
  idle: 30_000,
  /** 连续失败时的退避上限 */
  maxBackoff: 120_000,
  /** 被限流且服务端没给 Retry-After 时 */
  rateLimited: 60_000,
  /** 页面重新可见时，距上次轮询不到这么久就不立刻补拉 */
  visibleGap: 5_000,
  /** 一次轮询里按 more 最多续拉几页（防止异常时死循环） */
  maxPages: 10,
} as const;

export type Outcome = 'ok' | 'error' | 'rate_limited';

export interface DelayInput {
  outcome: Outcome;
  /** 正常间隔（ms） */
  base: number;
  /** 连续失败次数（含这一次），outcome 为 error 时 ≥ 1 */
  failures: number;
  /** 距上次收到新邮件（ms） */
  sinceNew: number;
  retryAfterMs?: number;
}

/** 下一次轮询前等待多久 */
export function nextDelay(i: DelayInput, random: () => number = Math.random): number {
  if (i.outcome === 'rate_limited') return Math.max(i.base, i.retryAfterMs ?? POLL.rateLimited);
  if (i.outcome === 'error') {
    // 指数退避 + ±20% 抖动：断网时少发请求，恢复时大家不会同一秒涌回来
    const d = Math.min(POLL.maxBackoff, i.base * 2 ** Math.max(1, i.failures));
    return Math.round(d * (0.8 + 0.4 * random()));
  }
  return i.sinceNew > POLL.idleAfter ? Math.max(i.base, POLL.idle) : i.base;
}
