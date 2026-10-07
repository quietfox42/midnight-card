// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { useInbox } from '../../src/web/lib/useInbox';

const ADDR = 'abc@mail.test';
type Reply = { status?: number; messages?: { id: number }[]; more?: boolean } | 'network';

let requests: string[] = [];
let aborted = 0;
let reply: (url: string) => Reply = () => ({ messages: [] });

function mail(id: number) {
  return { id, sender: '', subject: `m${id}`, code: null, link: null, received_at: 0, has_html: 0 };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // 抖动取中值，结果可复现
  requests = [];
  aborted = 0;
  reply = () => ({ messages: [] });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      requests.push(url);
      init?.signal?.addEventListener('abort', () => aborted++);
      const r = reply(url);
      if (r === 'network') return Promise.reject(new TypeError('Failed to fetch'));
      const body = { messages: (r.messages ?? []).map((m) => mail(m.id)), more: r.more ?? false };
      return Promise.resolve(new Response(JSON.stringify(body), { status: r.status ?? 200 }));
    }),
  );
  setHidden(false);
});

afterEach(() => {
  cleanup(); // 没开 vitest globals 时 testing-library 不会自动卸载
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('轮询策略', () => {
  it('网络断开 10 分钟内的请求数（指数退避，最长 2 分钟）', async () => {
    reply = () => 'network';
    renderHook(() => useInbox(ADDR, 10));
    await advance(10 * 60_000);
    console.log(`断网 10 分钟请求数：${requests.length}`);
    // 旧实现：失败后固定 30 秒重试 → 21 次
    expect(requests.length).toBeLessThanOrEqual(9);
  });

  it('退避后恢复：一次成功就回到正常间隔', async () => {
    let down = true;
    reply = () => (down ? 'network' : { messages: [] });
    renderHook(() => useInbox(ADDR, 10));
    await advance(50_000); // 0s、20s 两次失败，下一次重试在 60s
    down = false;
    await advance(15_000);
    const before = requests.length;
    await advance(60_000);
    expect(requests.length - before).toBe(6); // 回到 10 秒一次（仍在 5 分钟空闲阈值内）
  });

  it('两次轮询之间到了很多封：按 more 立即续拉，一封不漏', async () => {
    let page = 0;
    reply = (url) => {
      if (url.includes('since=0')) return { messages: [{ id: 1 }] };
      page++;
      if (page === 1) return { messages: [{ id: 51 }, { id: 2 }], more: true }; // 简化：每页 2 封
      if (page === 2) return { messages: [{ id: 101 }, { id: 52 }], more: true };
      if (page === 3) return { messages: [{ id: 102 }], more: false };
      return { messages: [] };
    };
    const { result } = renderHook(() => useInbox(ADDR, 10));
    await advance(0);
    await advance(10_000);
    expect(result.current.messages.map((m) => m.id)).toEqual([102, 101, 52, 51, 2, 1]);
    expect(requests.filter((u) => u.includes('since=')).map((u) => /since=(\d+)/.exec(u)![1])).toEqual(['0', '1', '51', '101']);
  });

  it('页面隐藏时不轮询；重新可见时距上次不足 5 秒则不立刻补拉', async () => {
    renderHook(() => useInbox(ADDR, 10));
    await advance(0);
    expect(requests).toHaveLength(1);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(5 * 60_000);
    expect(requests).toHaveLength(1);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);
    expect(requests).toHaveLength(2); // 隐藏了很久：立刻拉一次

    // 快速切走再切回
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);
    expect(requests).toHaveLength(2);
    await advance(10_000);
    expect(requests).toHaveLength(3); // 按原节奏继续
  });

  it('切换地址时中止进行中的请求', async () => {
    reply = () => ({ messages: [] });
    (fetch as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(
      (url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          requests.push(url);
          init?.signal?.addEventListener('abort', () => {
            aborted++;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const { rerender } = renderHook(({ a }) => useInbox(a, 10), { initialProps: { a: ADDR } });
    await advance(0);
    rerender({ a: 'other@mail.test' });
    await advance(0);
    expect(aborted).toBeGreaterThanOrEqual(1);
  });

  it('请求进行中时 refresh() 复用同一个请求，并在它结束时完成', async () => {
    let resolve!: () => void;
    (fetch as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation((url: string) => {
      requests.push(url);
      return new Promise<Response>((r) => {
        resolve = () => r(new Response(JSON.stringify({ messages: [], more: false })));
      });
    });
    const { result } = renderHook(() => useInbox(ADDR, 10));
    await advance(0);
    let done = false;
    void result.current.refresh().then(() => (done = true));
    await advance(0);
    expect(requests).toHaveLength(1);
    expect(done).toBe(false); // 旧实现：立刻 resolve，下拉刷新的转圈一闪而过
    resolve();
    await advance(0);
    expect(done).toBe(true);
  });

  it('网络恢复（online 事件）时立即拉一次', async () => {
    reply = () => 'network';
    renderHook(() => useInbox(ADDR, 10));
    await advance(0);
    reply = () => ({ messages: [] });
    const before = requests.length;
    window.dispatchEvent(new Event('online'));
    await advance(0);
    expect(requests.length).toBe(before + 1);
  });

  it('被限流时等 60 秒', async () => {
    reply = () => ({ status: 429 });
    const { result } = renderHook(() => useInbox(ADDR, 10));
    await advance(0);
    expect(result.current.status).toBe('rate_limited');
    await advance(59_000);
    expect(requests).toHaveLength(1);
    await advance(1_000);
    expect(requests).toHaveLength(2);
  });
});
