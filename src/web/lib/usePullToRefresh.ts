import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { EASE, haptic, prefersReducedMotion } from './motion';

const THRESHOLD = 64; // 拉过这个距离（阻尼后，手指约移动 140px）松手就刷新
const HOLD = 56; // 刷新期间内容停在这里
const MAX = 140; // 阻尼后的最大位移
const STIFF = 220; // 阻尼系数：越大越“松”
const MIN_SPIN_MS = 650; // 刷新再快也至少转这么久，避免一闪而过

/** 橡皮筋阻尼：越拉越重，永远到不了 MAX */
const rubber = (dy: number) => MAX * (1 - Math.exp(-dy / STIFF));

interface Options {
  /** 跟手下移的内容 */
  target: RefObject<HTMLElement | null>;
  /** 指示器（被拉开的空隙里出现）；JS 只写它的 transform/opacity 和 data-state */
  indicator: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<unknown>;
  enabled: boolean;
}

/**
 * 页面顶部下拉刷新。只在 scrollY === 0 且手势向下时接管；横向或向上的手势完全不碰。
 * 每帧直接写 transform，不经过 React。
 */
export function usePullToRefresh({ target, indicator, onRefresh, enabled }: Options) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = target.current;
    const ind = indicator.current;
    if (!enabled || !el || !ind) return;

    let startX = 0;
    let startY = 0;
    let decided = false;
    let pulling = false;
    let armed = false;
    let busy = false;
    let dist = 0;

    const paint = (d: number) => {
      el.style.transform = d ? `translate3d(0, ${d.toFixed(1)}px, 0)` : '';
      const p = Math.min(1, d / THRESHOLD);
      ind.style.opacity = p.toFixed(3);
      ind.style.transform = `translate3d(0, ${(d * 0.5 - 20).toFixed(1)}px, 0) scale(${(0.7 + 0.3 * p).toFixed(3)})`;
      ind.style.setProperty('--p', p.toFixed(3));
    };

    const settle = (to: number, done?: () => void) => {
      const reduced = prefersReducedMotion();
      const ms = reduced ? 0 : 420;
      el.style.transition = ind.style.transition = ms ? `transform ${ms}ms ${EASE.spring}, opacity ${ms}ms ${EASE.out}` : '';
      paint(to);
      window.setTimeout(() => {
        el.style.transition = ind.style.transition = '';
        done?.();
      }, ms);
    };

    const onStart = (e: TouchEvent) => {
      decided = true; // 先当作“不归我管”，满足条件再改回来
      pulling = false;
      if (busy || e.touches.length !== 1 || window.scrollY > 0) return;
      // 弹层、对话框里的手势不管
      if ((e.target as Element).closest('dialog, .detail, .dock')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      decided = pulling = armed = false;
      dist = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        pulling = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2 && window.scrollY <= 0;
        if (pulling) {
          ind.dataset.state = 'pull';
          el.style.willChange = 'transform';
        }
      }
      if (!pulling) return;
      e.preventDefault();
      dist = rubber(Math.max(0, dy));
      const nowArmed = dist >= THRESHOLD;
      if (nowArmed !== armed) {
        armed = nowArmed;
        ind.dataset.state = armed ? 'armed' : 'pull';
        if (armed) haptic(8);
      }
      paint(dist);
    };

    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      if (!armed) {
        settle(0, () => {
          el.style.willChange = '';
          delete ind.dataset.state;
        });
        return;
      }
      busy = true;
      ind.dataset.state = 'refreshing';
      settle(HOLD);
      const minSpin = new Promise((r) => window.setTimeout(r, MIN_SPIN_MS));
      Promise.allSettled([onRefreshRef.current(), minSpin]).then(() => {
        ind.dataset.state = 'done';
        settle(0, () => {
          busy = false;
          el.style.willChange = '';
          delete ind.dataset.state;
        });
      });
    };

    // 阻塞式 touchmove 会让滚动等主线程，所以只在页面停在顶部时挂上
    let blocking = false;
    const syncBlocking = () => {
      const want = window.scrollY <= 0;
      if (want === blocking) return;
      blocking = want;
      if (want) window.addEventListener('touchmove', onMove, { passive: false });
      else window.removeEventListener('touchmove', onMove);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    window.addEventListener('scroll', syncBlocking, { passive: true });
    syncBlocking();
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('scroll', syncBlocking);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      el.style.transform = el.style.transition = el.style.willChange = '';
      ind.style.transform = ind.style.transition = ind.style.opacity = '';
      delete ind.dataset.state;
    };
  }, [enabled, target, indicator]);
}
