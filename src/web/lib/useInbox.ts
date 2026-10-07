import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, fetchMessages, type MailSummary } from './api';
import { nextDelay, POLL, type Outcome } from './pollPolicy';
import { createStore, type Store } from './store';

const MAX_KEPT = 100;

export type InboxStatus = 'loading' | 'ok' | 'error' | 'rate_limited';

/**
 * 轮询收件箱（节奏见 pollPolicy.ts）：
 * - 正常 ≥10 秒一次；5 分钟没有新邮件放慢到 30 秒；失败时指数退避到最长 2 分钟；被限流按 Retry-After。
 * - 页面不可见时完全暂停；重新可见时若距上次轮询超过 5 秒立刻拉一次，否则按原节奏。
 * - 浏览器报告离线时暂停，`online` 时立刻拉一次。
 * - 增量拉取（since = 已知最大 id）；服务端返回 more 时同一次轮询里立即续拉，突发大量邮件也不漏。
 * - 切换地址或卸载时中止进行中的请求；请求进行中调用 refresh() 会复用它。
 */
export function useInbox(address: string | null, pollSeconds: number) {
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [status, setStatus] = useState<InboxStatus>('loading');
  // 每次轮询都会变：放在独立 store 里，只有状态行订阅，空轮询不会让 App 重渲染
  const [checkedAt] = useState<Store<number | null>>(() => createStore<number | null>(null));
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const base = Math.max(POLL.min, pollSeconds * 1000);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    let timer: number | undefined;
    let inFlight: Promise<void> | null = null;
    let since = 0;
    let failures = 0;
    let lastNew = Date.now();
    let lastPoll = 0;

    setMessages([]);
    setStatus('loading');
    checkedAt.set(null);

    const stopped = () => ctrl.signal.aborted;
    const paused = () => document.hidden || navigator.onLine === false;

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (!stopped() && !paused()) timer = window.setTimeout(poll, delay);
    };

    async function run(): Promise<void> {
      lastPoll = Date.now();
      let outcome: Outcome = 'ok';
      let retryAfterMs: number | undefined;
      try {
        const fresh: MailSummary[] = [];
        for (let page = 0; page < POLL.maxPages; page++) {
          const r = await fetchMessages(address!, since, ctrl.signal);
          if (r.messages.length) {
            since = Math.max(since, ...r.messages.map((m) => m.id));
            fresh.unshift(...r.messages); // 每页内部是倒序；后一页更新，放到前面
          }
          if (!r.more) break;
        }
        if (stopped()) return;
        if (fresh.length) {
          lastNew = Date.now();
          setMessages((prev) => [...fresh, ...prev].slice(0, MAX_KEPT));
        }
        failures = 0;
        setStatus('ok');
        checkedAt.set(Date.now());
      } catch (err) {
        if (stopped()) return;
        if (err instanceof ApiError && err.status === 429) {
          outcome = 'rate_limited';
          retryAfterMs = err.retryAfterMs;
          setStatus('rate_limited');
        } else {
          outcome = 'error';
          failures++;
          setStatus('error');
        }
      }
      schedule(nextDelay({ outcome, base, failures, sinceNew: Date.now() - lastNew, retryAfterMs }));
    }

    /** 同一时间只有一个请求；正在进行时返回它 */
    function poll(): Promise<void> {
      if (stopped()) return Promise.resolve();
      window.clearTimeout(timer);
      inFlight ??= run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    }

    refreshRef.current = () => {
      lastNew = Date.now(); // 用户操作视为活跃，恢复正常频率
      return poll();
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        return;
      }
      const elapsed = Date.now() - lastPoll;
      if (elapsed >= POLL.visibleGap) void poll();
      else schedule(base - elapsed);
    };
    const onOnline = () => void poll();
    const onOffline = () => window.clearTimeout(timer);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (!paused()) void poll();

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [address, base, checkedAt]);

  /** 立即拉一次；返回的 Promise 在这次请求结束时完成（供下拉刷新收尾） */
  const refresh = useCallback(() => refreshRef.current(), []);

  return { messages, status, checkedAt, refresh };
}
