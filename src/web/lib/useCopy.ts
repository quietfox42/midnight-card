import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from './text';

const FEEDBACK_MS = 1500;

/** 底部提示：任何组件都可以调用，<Toast/> 负责显示 */
export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent<string>('mc:toast', { detail: message }));
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // 非安全上下文或权限被拒时的兜底
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  }
}

/**
 * 复制到剪贴板。成功后：被复制的 key 在 1.5 秒内标记为“已复制”，
 * 弹出底部提示，并在支持的设备上轻微震动。
 */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async (value: string, key: string = value) => {
    const ok = await writeClipboard(value);
    if (!ok) {
      toast(T.copyFailed);
      return;
    }
    navigator.vibrate?.(12);
    toast(T.copied);
    setCopied(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), FEEDBACK_MS);
  }, []);

  return [copied, copy] as const;
}
