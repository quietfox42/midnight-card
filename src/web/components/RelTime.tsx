import { shortTime } from '../lib/format';
import { clock, useStore } from '../lib/store';

/** 相对时间（“刚刚”“3 分钟前”）：订阅共享时钟，只有这个文本节点按时刷新 */
export function RelTime({ ms }: { ms: number }) {
  useStore(clock);
  return <>{shortTime(ms)}</>;
}
