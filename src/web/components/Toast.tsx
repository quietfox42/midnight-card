import { useEffect, useRef, useState } from 'react';
import { ANNOUNCE_EVENT, TOAST_EVENT, type ToastDetail } from '../lib/useCopy';

const SHOW_MS = 2200;

/**
 * 全局提示。两条通道：
 * - toast()：看得见的药丸（错误、无法就地反馈的结果），有进场和退场动画；
 * - announce()：只给读屏的礼貌播报（复制成功这类已经在原位有视觉反馈的事）。
 */
export function Toast() {
  const [item, setItem] = useState<(ToastDetail & { seq: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [spoken, setSpoken] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      setItem({ ...(e as CustomEvent<ToastDetail>).detail, seq: ++seq });
      setLeaving(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLeaving(true), SHOW_MS);
    };
    const onAnnounce = (e: Event) => {
      // 先清空再写入，同一句话重复出现也会被读出
      setSpoken('');
      requestAnimationFrame(() => setSpoken((e as CustomEvent<string>).detail));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener(ANNOUNCE_EVENT, onAnnounce);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
      window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <>
      <div className="toast-region" role="status" aria-live="polite">
        {item && (
          <div
            className={`toast${item.tone === 'warn' ? ' is-warn' : ''}${leaving ? ' is-leaving' : ''}`}
            key={item.seq}
            onAnimationEnd={() => leaving && setItem(null)}
          >
            {item.message}
          </div>
        )}
      </div>
      <div className="visually-hidden" aria-live="polite">
        {spoken}
      </div>
    </>
  );
}
