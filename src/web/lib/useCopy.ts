import { useCallback, useEffect, useRef, useState } from 'react';

/** 复制到剪贴板，返回 [copiedKey, copy]；copiedKey 在 1.5 秒后清空，用于显示“已复制” */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async (value: string, key = value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 非安全上下文的兜底
      const el = document.createElement('textarea');
      el.value = value;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1500);
  }, []);

  return [copied, copy] as const;
}
