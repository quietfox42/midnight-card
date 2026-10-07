// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/preact';
import { useMemo, useRef } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { media, setIntersecting } from './setup';
import { stepSpring, type SpringState } from '../../src/web/components/card/spring';
import { useTilt, type TiltTargets } from '../../src/web/components/card/useTilt';

/** 从 1 回到 0、直到静止所需的时间（ms） */
function settleMs(hz: number): number {
  const s: SpringState = { cur: { x: 1, y: 0 }, vel: { x: 0, y: 0 } };
  const dt = 1000 / hz;
  let t = 0;
  while (!stepSpring(s, { x: 0, y: 0 }, dt) && t < 10_000) t += dt;
  return t;
}

/** 旧实现：每帧固定一步，与帧率无关 → 帧率越高越快 */
function oldSettleMs(hz: number): number {
  let cur = 1;
  let vel = 0;
  let frames = 0;
  while (frames < 10_000) {
    vel = (vel + (0 - cur) * 0.11) * 0.74;
    cur += vel;
    frames++;
    if (Math.abs(cur) < 0.001 && Math.abs(vel) < 0.0005) break;
  }
  return frames * (1000 / hz);
}

describe('倾斜弹簧', () => {
  it('不同刷新率下回正时间一致（旧实现 120Hz 快一倍、30Hz 慢一倍）', () => {
    const at60 = settleMs(60);
    const rows = [30, 60, 90, 120, 144].map((hz) => ({ hz, before: Math.round(oldSettleMs(hz)), after: Math.round(settleMs(hz)) }));
    console.table(rows);
    for (const { after } of rows) expect(Math.abs(after - at60) / at60).toBeLessThan(0.15);
    expect(oldSettleMs(120) / oldSettleMs(60)).toBeCloseTo(0.5, 2);
  });

  it('60fps 时与原逐帧公式逐步一致', () => {
    const s: SpringState = { cur: { x: 0.8, y: -0.3 }, vel: { x: 0, y: 0 } };
    let cur = 0.8;
    let vel = 0;
    for (let i = 0; i < 20; i++) {
      stepSpring(s, { x: 0, y: -0.3 }, 1000 / 60);
      vel = (vel + (0 - cur) * 0.11) * 0.74;
      cur += vel;
      expect(s.cur.x).toBeCloseTo(cur, 10);
    }
  });
});

function Card() {
  const stage = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const none = useRef<HTMLElement>(null);
  const targets = useMemo<TiltTargets>(() => ({ stage, tilt, glare: none, spec: none, foil: none, shadow: none }), []);
  useTilt(targets, true);
  return (
    <div ref={stage}>
      <div ref={tilt} />
    </div>
  );
}

describe('陀螺仪监听', () => {
  afterEach(() => {
    cleanup();
    media['(hover: none) and (pointer: coarse)'] = false;
    vi.restoreAllMocks();
  });

  it('卡片离屏时卸掉 deviceorientation，回到屏幕再挂上', () => {
    media['(hover: none) and (pointer: coarse)'] = true; // 触屏、无需权限（Android）→ 自动开启
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === 'deviceorientation').length;

    render(<Card />);
    expect(count(add)).toBe(1);
    setIntersecting(false);
    expect(count(remove)).toBe(1); // 旧实现：离屏时仍以 ~60Hz 处理陀螺仪事件
    setIntersecting(true);
    expect(count(add)).toBe(2);
  });

  it('指针移动时只读一次卡片尺寸', () => {
    const { container } = render(<Card />);
    const stage = container.firstElementChild as HTMLElement;
    const rect = vi.spyOn(stage, 'getBoundingClientRect');
    for (let i = 0; i < 30; i++) stage.dispatchEvent(new PointerEvent('pointermove', { clientX: i, clientY: i, pointerType: 'mouse' }));
    expect(rect).toHaveBeenCalledTimes(1); // 旧实现：30 次
  });
});
