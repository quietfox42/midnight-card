import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from './motion';
import { T } from './text';

const FEEDBACK_MS = 1600;

export const TOAST_EVENT = 'mc:toast';
export const ANNOUNCE_EVENT = 'mc:announce';

export interface ToastDetail {
  message: string;
  tone?: 'info' | 'warn';
}

/** 看得见的底部提示：任何组件都可以调用，<Toast/> 负责显示 */
export function toast(message: string, tone: ToastDetail['tone'] = 'info'): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, tone } }));
}

/** 只给读屏软件的播报 */
export function announce(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(ANNOUNCE_EVENT, { detail: message }));
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
 * 复制到剪贴板。成功后：被复制的 key 在一小段时间内标记为“已复制”（按钮原位切换），
 * 轻微震动并给读屏播报。失败时才弹出看得见的提示。返回是否成功，供调用方播放动效。
 */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async (value: string, key: string = value): Promise<boolean> => {
    const ok = await writeClipboard(value);
    if (!ok) {
      toast(T.copyFailed, 'warn');
      return false;
    }
    haptic(12);
    announce(T.copiedValue(value));
    setCopied(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), FEEDBACK_MS);
    return true;
  }, []);

  return [copied, copy] as const;
}
