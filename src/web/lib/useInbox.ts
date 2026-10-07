import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchMessages, type MailSummary } from './api';

const MIN_INTERVAL = 10_000;
const IDLE_INTERVAL = 30_000;
const IDLE_AFTER = 5 * 60_000;
const RATE_LIMIT_WAIT = 60_000;
const MAX_KEPT = 100;

export type InboxStatus = 'loading' | 'ok' | 'error' | 'rate_limited';

/**
 * 轮询收件箱：
 * - 间隔不低于 10 秒；5 分钟没有新邮件后放慢到 30 秒，有新邮件或手动刷新时恢复
 * - 页面不可见时完全暂停，重新可见时立刻拉一次
 * - 用 since（最大 id）增量拉取，通常返回 0 行
 */
export function useInbox(address: string | null, pollSeconds: number) {
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [status, setStatus] = useState<InboxStatus>('loading');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const sinceRef = useRef(0);
  const lastNewRef = useRef(Date.now());
  const timerRef = useRef<number | undefined>(undefined);
  const pollRef = useRef<() => void>(() => {});

  const baseInterval = Math.max(MIN_INTERVAL, pollSeconds * 1000);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    let inFlight = false; // 每个地址独立，切换地址不会被旧请求挡住
    sinceRef.current = 0;
    lastNewRef.current = Date.now();
    setMessages([]);
    setStatus('loading');
    setCheckedAt(null);

    const schedule = (delay: number) => {
      window.clearTimeout(timerRef.current);
      if (cancelled || document.hidden) return;
      timerRef.current = window.setTimeout(poll, delay);
    };

    async function poll() {
      if (cancelled || document.hidden || inFlight) return;
      inFlight = true;
      let next = baseInterval;
      try {
        const fresh = await fetchMessages(address!, sinceRef.current);
        if (cancelled) return;
        if (fresh.length) {
          sinceRef.current = Math.max(sinceRef.current, ...fresh.map((m) => m.id));
          lastNewRef.current = Date.now();
          setMessages((prev) => [...fresh, ...prev].slice(0, MAX_KEPT));
        }
        setStatus('ok');
        setCheckedAt(Date.now());
        if (Date.now() - lastNewRef.current > IDLE_AFTER) next = Math.max(baseInterval, IDLE_INTERVAL);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 429) {
          setStatus('rate_limited');
          next = RATE_LIMIT_WAIT;
        } else {
          setStatus('error');
          next = Math.max(baseInterval, IDLE_INTERVAL);
        }
      } finally {
        inFlight = false;
      }
      schedule(next);
    }

    pollRef.current = () => {
      lastNewRef.current = Date.now(); // 用户操作视为活跃，恢复正常频率
      window.clearTimeout(timerRef.current);
      void poll();
    };

    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timerRef.current);
      else void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [address, baseInterval]);

  const refresh = useCallback(() => pollRef.current(), []);

  return { messages, status, checkedAt, refresh };
}
