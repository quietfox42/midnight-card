// 动效约定：只动 transform / opacity；所有入口都先看 prefers-reduced-motion。
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const hasLinear = typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)');

/** 与 styles/tokens.css 里的 --ease-* / --spring-* 保持一致 */
export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.55, 0, 0.75, 0.1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: hasLinear
    ? 'linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001 85.9%, 1)'
    : 'cubic-bezier(0.25, 1.1, 0.4, 1)',
  pop: hasLinear
    ? 'linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)'
    : 'cubic-bezier(0.34, 1.5, 0.64, 1)',
} as const;

export function prefersReducedMotion(): boolean {
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * 性能档：中低端机（≤4 核或 ≤4GB 内存）用 lite，关掉环境光扫、背景缩放等纯装饰效果。
 * 结果写在 <html data-perf>，CSS 也能据此降级。
 */
export type PerfTier = 'full' | 'lite';
let tier: PerfTier | null = null;

export function perfTier(): PerfTier {
  if (tier) return tier;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  tier = cores <= 4 || memory <= 4 ? 'lite' : 'full';
  document.documentElement.dataset.perf = tier;
  return tier;
}

/** 轻触感反馈；不支持的设备（包括 iOS Safari）静默忽略 */
export function haptic(pattern: number | number[] = 10): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 忽略 */
  }
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

/** 等动画结束（被取消也算结束），用于串联退场 → 卸载 */
export function finished(anim: Animation | null): Promise<void> {
  if (!anim) return Promise.resolve();
  return anim.finished.then(
    () => undefined,
    () => undefined,
  );
}
