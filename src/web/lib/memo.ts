import { h, type Component, type FunctionComponent } from 'preact';

/**
 * 与 React.memo 相同：props 浅相等时跳过渲染。
 * 不用 preact/compat 的 memo：引入 compat 会顺带注册它的全局 options 钩子（onChange 改写等），改变整个应用的行为。
 */
export function memo<P extends object>(
  component: FunctionComponent<P>,
  equal: (prev: P, next: P) => boolean = shallowEqual,
): FunctionComponent<P> {
  function Memoed(this: Component<P>, props: P) {
    this.shouldComponentUpdate ??= function (this: Component<P>, next: P) {
      return !equal(this.props as P, next);
    };
    return h(component, props);
  }
  Memoed.displayName = `Memo(${component.displayName || component.name})`;
  return Memoed as FunctionComponent<P>;
}

export function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}
