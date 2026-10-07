import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { EASE, prefersReducedMotion } from './motion';

const CLOSE_RATIO = 0.25; // 拉过面板高度的这个比例，或
const CLOSE_VELOCITY = 0.6; // 松手时速度超过这个值（px/ms），就关闭

interface Options {
  /** 被拖动的面板 */
  panel: RefObject<HTMLElement | null>;
  /** 随拖动变淡的遮罩（可选） */
  scrim?: RefObject<HTMLElement | null>;
  /** 把手区域：从这里开始的下拉永远算数 */
  handle?: RefObject<HTMLElement | null>;
  /** 可滚动内容：只有滚到顶时，从内容区开始的下拉才算数 */
  scroller?: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** 面板滑出屏幕之后调用 */
  onDismiss: () => void;
}

/**
 * 底部面板下拉关闭（邮件详情、自定义抽屉共用）。
 * 手指跟随时直接写 transform；松手后要么弹回，要么顺着速度滑出再通知关闭。
 */
export function useSheetDrag({ panel, scrim, handle, scroller, enabled, onDismiss }: Options) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const p = panel.current;
    if (!enabled || !p) return;
    const s = scrim?.current ?? null;

    let startX = 0;
    let startY = 0;
    let eligible = false;
    let decided = false;
    let dragging = false;
    let dy = 0;
    let lastY = 0;
    let lastT = 0;
    let vy = 0;

    const setTransition = (value: string) => {
      p.style.transition = value;
      if (s) s.style.transition = value ? value.replace(/transform/g, 'opacity') : '';
    };

    const onStart = (e: TouchEvent) => {
      decided = dragging = false;
      const t = e.touches[0];
      if (!t || e.touches.length !== 1) {
        eligible = false;
        return;
      }
      const target = e.target as Node;
      const sc = scroller?.current;
      const fromHandle = !!handle?.current?.contains(target);
      eligible = fromHandle || !sc || sc.scrollTop <= 0;
      startX = t.clientX;
      startY = lastY = t.clientY;
      lastT = e.timeStamp;
      dy = vy = 0;
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!eligible || !t) return;
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (!decided) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        decided = true;
        dragging = my > 0 && Math.abs(my) > Math.abs(mx);
        if (dragging) setTransition('none');
      }
      if (!dragging) return;
      e.preventDefault();
      dy = Math.max(0, my);
      vy = (t.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
      lastY = t.clientY;
      lastT = e.timeStamp;
      p.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
      if (s) s.style.opacity = String(Math.max(0, 1 - dy / p.clientHeight));
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      const reduced = prefersReducedMotion();
      if (dy > p.clientHeight * CLOSE_RATIO || vy > CLOSE_VELOCITY) {
        // 顺着手指的速度滑出：越快越短
        const remaining = p.clientHeight - dy;
        const ms = reduced ? 0 : Math.round(Math.min(320, Math.max(160, remaining / Math.max(vy, 1.2))));
        setTransition(ms ? `transform ${ms}ms ${EASE.out}` : 'none');
        p.style.transform = 'translate3d(0, 100%, 0)';
        if (s) s.style.opacity = '0';
        window.setTimeout(() => onDismissRef.current(), ms);
      } else {
        setTransition(reduced ? 'none' : `transform 420ms ${EASE.spring}`);
        p.style.transform = '';
        if (s) s.style.opacity = '';
        window.setTimeout(() => setTransition(''), 420);
      }
    };

    p.addEventListener('touchstart', onStart, { passive: true });
    p.addEventListener('touchmove', onMove, { passive: false });
    p.addEventListener('touchend', onEnd);
    p.addEventListener('touchcancel', onEnd);
    return () => {
      p.removeEventListener('touchstart', onStart);
      p.removeEventListener('touchmove', onMove);
      p.removeEventListener('touchend', onEnd);
      p.removeEventListener('touchcancel', onEnd);
      // 关闭后清掉内联样式；此时 CSS 的目标位置与内联值相同，不会跳
      p.style.transition = p.style.transform = '';
      if (s) s.style.transition = s.style.opacity = '';
    };
  }, [enabled, panel, scrim, handle, scroller]);
}
