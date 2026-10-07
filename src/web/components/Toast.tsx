import { useEffect, useRef, useState } from 'react';

/** 全局底部提示，配合 lib/useCopy 的 toast() 使用 */
export function Toast() {
  const [message, setMessage] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onToast = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      setSeq((n) => n + 1);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), 1600);
    };
    window.addEventListener('mc:toast', onToast);
    return () => {
      window.removeEventListener('mc:toast', onToast);
      window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className="toast" key={seq}>
          {message}
        </div>
      )}
    </div>
  );
}
