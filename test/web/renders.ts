// 统计每个组件真正执行 render 的次数（memo 跳过的不算）。
// options.__r 是 Preact 的 _render 钩子（压缩后的名字），hooks 包也挂在这里，所以要串起来。
import { options } from 'preact';

type Hook = (vnode: { type: unknown }) => void;
const opts = options as unknown as { __r?: Hook };

export function trackRenders() {
  const counts = new Map<string, number>();
  const prev = opts.__r;
  opts.__r = (vnode) => {
    prev?.(vnode);
    const t = vnode.type as { displayName?: string; name?: string } | string;
    if (typeof t !== 'function') return;
    const name = (t as { displayName?: string }).displayName || (t as { name: string }).name || 'Anonymous';
    if (name.startsWith('Memo')) return; // memo 外壳本身不算，里面的组件真渲染了才算
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  return {
    reset: () => counts.clear(),
    snapshot: () => Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])),
    total: () => [...counts.values()].reduce((a, b) => a + b, 0),
    restore: () => {
      opts.__r = prev;
    },
  };
}
