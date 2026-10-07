// jsdom 缺少的浏览器 API 的最小替身。只给 test/web 下的用例 import。
import { vi } from 'vitest';

export const media: Record<string, boolean> = {
  '(min-width: 900px)': false,
  '(prefers-reduced-motion: reduce)': false,
  '(hover: none) and (pointer: coarse)': false,
};

/** 记下每个 matchMedia 监听，测试可以统计监听器数量 */
export const mediaListeners = new Set<() => void>();

window.matchMedia = (query: string) =>
  ({
    matches: media[query] ?? false,
    media: query,
    addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn),
  }) as unknown as MediaQueryList;

/** 所有 IntersectionObserver 实例，测试用它模拟卡片离屏 */
export const observers: { cb: IntersectionObserverCallback; targets: Element[] }[] = [];
window.IntersectionObserver = class {
  private entry: { cb: IntersectionObserverCallback; targets: Element[] };
  constructor(cb: IntersectionObserverCallback) {
    this.entry = { cb, targets: [] };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    observers.splice(observers.indexOf(this.entry), 1);
  }
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

export function setIntersecting(visible: boolean): void {
  for (const o of [...observers]) {
    for (const target of o.targets) {
      o.cb([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0, target } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  }
}

Element.prototype.animate = function () {
  return { cancel() {}, finish() {}, onfinish: null, finished: Promise.resolve() } as unknown as Animation;
};
Element.prototype.getAnimations = () => [];
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
window.scrollTo = () => {};
Element.prototype.scrollTo = () => {};
Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true });
