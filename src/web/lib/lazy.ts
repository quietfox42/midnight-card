import { h, type ComponentType } from 'preact';
import { useEffect, useReducer } from 'preact/hooks';
import { memo } from './memo';

export type LazyComponent<P> = ComponentType<P> & { preload(): Promise<void> };

/**
 * 按需加载的组件：模块到达之前渲染 null，到达后原样渲染。
 * 比 preact/compat 的 lazy + Suspense 小得多，也不会因为挂起而卸载兄弟节点。
 * 调用 preload() 可以在空闲时提前拉取，保证第一次打开时已经就绪（入场动画要求组件先以关闭态挂载）。
 */
export function lazy<P extends object>(load: () => Promise<ComponentType<P>>): LazyComponent<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const preload = () =>
    (pending ??= load().then(
      (c) => {
        loaded = c;
      },
      (err) => {
        pending = null; // 允许下次重试（例如网络恢复后）
        throw err;
      },
    ));

  function Lazy(props: P) {
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      if (loaded) return;
      let alive = true;
      preload().then(
        () => alive && rerender(undefined),
        () => {},
      );
      return () => {
        alive = false;
      };
    }, []);
    return loaded ? h(loaded, props) : null;
  }
  // memo：父组件重渲染而 props 不变时，懒加载的组件也跳过
  return Object.assign(memo(Lazy), { preload });
}

/** 浏览器空闲时执行（不支持 requestIdleCallback 的 Safari 退回 setTimeout） */
export function whenIdle(fn: () => void, timeout = 2000): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else window.setTimeout(fn, 200);
}
