// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaListeners, setIntersecting } from './setup';
import { trackRenders } from './renders';
import { App } from '../../src/web/App';
import { clock } from '../../src/web/lib/store';

const N = 20;
const now = Date.now();
const mails = Array.from({ length: N }, (_, i) => ({
  id: N - i,
  sender: `Sender ${i} <s${i}@example.org>`,
  subject: `Subject ${i}`,
  code: String(100000 + i),
  link: null,
  received_at: now - i * 60_000,
  has_html: 0,
}));

let calls: string[] = [];
function mockFetch() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      calls.push(input);
      const body = input.startsWith('/api/config')
        ? { domain: 'mail.test', retentionHours: 24, pollSeconds: 10, reserved: [] }
        : input.includes('since=0')
          ? { messages: mails, more: false }
          : { messages: [], more: false };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

const tracker = trackRenders();
/** 场景名 → { total, perComponent } ，最后打印成表 */
const report: Record<string, { total: number; components: Record<string, number> }> = {};

async function boot() {
  localStorage.setItem('mc.address', 'k3j9x2ab@mail.test');
  render(<App />);
  await screen.findByText('Subject 0');
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function measure(name: string, action: () => Promise<void> | void): Promise<number> {
  tracker.reset();
  await act(async () => {
    await action();
    await new Promise((r) => setTimeout(r, 20));
  });
  const total = tracker.total();
  report[name] = { total, components: tracker.snapshot() };
  return total;
}

beforeEach(mockFetch);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => {
  tracker.restore();
  console.log(`\n渲染次数（${N} 封邮件）\n` + JSON.stringify(report, null, 2));
});

// 优化前（React/Preact 未做 memo）：三个场景都是 78 次组件渲染（整棵树），matchMedia 监听器 24 个（每个验证码一个）。
describe(`渲染次数（${N} 封邮件）`, () => {
  it('一次没有新邮件的轮询', async () => {
    await boot();
    const total = await measure('空轮询', async () => {
      fireEvent.click(screen.getByLabelText('立即刷新'));
      await waitFor(() => expect(calls.some((c) => c.includes('since=20'))).toBe(true));
    });
    // 只有状态行（“检查时间”）
    expect(total).toBeLessThanOrEqual(3);
    expect(report['空轮询']!.components).not.toHaveProperty('MailSlip');
  });

  it('复制一条验证码', async () => {
    await boot();
    const total = await measure('复制验证码', async () => {
      fireEvent.click(screen.getByLabelText('复制验证码 100003'));
      await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('100003'));
    });
    // App → Inbox → 被复制的那一行和它的验证码；其余 19 行不动
    expect(total).toBeLessThanOrEqual(6);
    expect(document.querySelectorAll('.code-chip.is-copied')).toHaveLength(1);
  });

  it('卡片滑出屏幕', async () => {
    await boot();
    const total = await measure('卡片离屏', () => setIntersecting(false));
    expect(total).toBeLessThanOrEqual(2); // App + 操作条
  });

  it('matchMedia 监听器数量', async () => {
    mediaListeners.clear();
    await boot();
    report['matchMedia 监听器'] = { total: mediaListeners.size, components: {} };
    expect(mediaListeners.size).toBeLessThanOrEqual(2); // 每个查询一个
  });

  it('memo 之后相对时间仍然按时钟刷新，且只重渲染时间节点', async () => {
    await boot();
    expect(screen.getAllByText('刚刚').length).toBeGreaterThan(0);
    const later = Date.now() + 10 * 60_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    const total = await measure('时钟走一格', () => clock.set(later));
    expect(screen.queryAllByText('刚刚')).toHaveLength(0);
    expect(Object.keys(report['时钟走一格']!.components)).toEqual(['RelTime']);
    expect(total).toBe(N + 1); // 每封邮件一个 + 状态行一个
  });
});
