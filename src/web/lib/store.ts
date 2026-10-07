import { useEffect, useState } from 'preact/hooks';

/** 极小的外部状态：只有订阅它的组件会因变化而重渲染，不必把高频状态挂在 App 上 */
export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T>(initial: T, onFirstSubscribe?: (store: Store<T>) => () => void): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  let stop: (() => void) | undefined;
  const store: Store<T> = {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const fn of [...subs]) fn();
    },
    subscribe(fn) {
      subs.add(fn);
      if (subs.size === 1 && onFirstSubscribe) stop = onFirstSubscribe(store);
      return () => {
        subs.delete(fn);
        if (subs.size === 0) {
          stop?.();
          stop = undefined;
        }
      };
    },
  };
  return store;
}

export function useStore<T>(store: Store<T>): T {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
  return store.get();
}

/** 宽屏双栏断点，与 CSS 的 @media (min-width: 900px) 一致 */
export const WIDE_QUERY = '(min-width: 900px)';

// ---------- 共享的媒体查询：每个查询全局只挂一个 matchMedia 监听 ----------

const mediaStores = new Map<string, Store<boolean>>();

export function mediaStore(query: string): Store<boolean> {
  let s = mediaStores.get(query);
  if (!s) {
    const mq = window.matchMedia(query);
    s = createStore(mq.matches, (store) => {
      const onChange = () => store.set(mq.matches);
      mq.addEventListener('change', onChange);
      onChange();
      return () => mq.removeEventListener('change', onChange);
    });
    mediaStores.set(query, s);
  }
  return s;
}

export const useMediaQuery = (query: string): boolean => useStore(mediaStore(query));

// ---------- 共享时钟：相对时间（“3 分钟前”）每 30 秒刷新一次，只重渲染显示时间的那几个节点 ----------

export const clock = createStore(Date.now(), (store) => {
  store.set(Date.now()); // 可能闲置了很久，第一个订阅者到来时先校准
  const id = window.setInterval(() => store.set(Date.now()), 30_000);
  return () => window.clearInterval(id);
});
