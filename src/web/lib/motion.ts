// 动效约定：只动 transform / opacity；所有入口都先看 prefers-reduced-motion。
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** 与 styles/tokens.css 里的 --ease-* 保持一致 */
export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.55, 0, 0.75, 0.1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
} as const;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Web Animations 的薄封装：元素不存在或浏览器不支持时什么也不做 */
export function play(
  el: Element | null | undefined,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (!el || typeof el.animate !== 'function') return null;
  return el.animate(frames, options);
}
