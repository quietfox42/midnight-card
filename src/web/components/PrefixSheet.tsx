import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';
import { checkPrefix, PREFIX_MAX } from '../../shared/address';
import { CheckIcon } from './Icons';
import { EASE, finished, play, prefersReducedMotion } from '../lib/motion';
import { PREFIX_ERRORS, T } from '../lib/text';
import { useSheetDrag } from '../lib/useSheetDrag';

interface Props {
  open: boolean;
  domain: string;
  current: string;
  reserved: string[];
  onClose: () => void;
  onSubmit: (prefix: string) => void;
}

/**
 * 底部抽屉（宽屏居中弹窗）。用原生 <dialog>：自带焦点限制、Esc 关闭、背景不可交互。
 * 顶部是一张实时预览的迷你黑卡，输入时地址同步变化。
 */
export function PrefixSheet({ open, domain, current, reserved, onClose, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const grabRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false); // dialog 是否真的打开着（含退场动画期间）

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue(current);
      setError(null);
      dialog.showModal();
      setShown(true);
      // 等抽屉渲染后再聚焦，避免移动端键盘弹起时页面跳动
      requestAnimationFrame(() => inputRef.current?.select());
    } else if (!open && dialog.open) {
      // 退场：滑下去再真正关闭（Esc 触发的原生关闭不会走到这里）
      const wide = window.matchMedia('(min-width: 900px)').matches;
      const anim = prefersReducedMotion()
        ? play(dialog, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 })
        : play(
            dialog,
            wide
              ? [{ opacity: 1 }, { opacity: 0, transform: 'translate3d(0,12px,0) scale(0.97)' }]
              : [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,100%,0)' }],
            { duration: 260, easing: EASE.in, fill: 'forwards' },
          );
      try {
        dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, pseudoElement: '::backdrop', fill: 'forwards' });
      } catch {
        /* 不支持对 ::backdrop 做动画的浏览器直接消失 */
      }
      void finished(anim).then(() => {
        if (dialog.open) dialog.close();
        dialog.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        setShown(false);
      });
    }
  }, [open, current]);

  // 键盘弹起时（iOS 不缩小布局视口），把抽屉抬到键盘上面
  useEffect(() => {
    const vv = window.visualViewport;
    const dialog = ref.current;
    if (!shown || !vv || !dialog) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      dialog.style.setProperty('--kb', `${Math.round(kb)}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      dialog.style.removeProperty('--kb');
    };
  }, [shown]);

  useSheetDrag({
    panel: ref,
    handle: grabRef,
    scroller: ref,
    enabled: shown,
    onDismiss: () => {
      ref.current?.close();
      setShown(false);
      onClose();
    },
  });

  const validate = (v: string) => {
    const err = checkPrefix(v, reserved);
    return err ? PREFIX_ERRORS[err] : null;
  };

  const shake = () => {
    if (prefersReducedMotion()) return;
    play(
      fieldRef.current,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 360, easing: EASE.out },
    );
  };

  const submit = (e: TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = value.trim().toLowerCase();
    const err = validate(v);
    setError(err);
    if (err) {
      shake();
      inputRef.current?.focus();
      return;
    }
    onSubmit(v);
  };

  const preview = value.trim().toLowerCase() || current;
  const previewValid = !validate(preview);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      aria-describedby="sheet-help"
      onClose={() => {
        setShown(false);
        onClose();
      }}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // 点遮罩关闭
      }}
    >
      <form className="sheet-body" onSubmit={submit} noValidate>
        <span className="sheet-grab" ref={grabRef} aria-hidden="true">
          <span className="grabber" />
        </span>
        <h2 id="sheet-title" className="sheet-title">
          {T.sheetTitle}
        </h2>
        <p id="sheet-help" className="sheet-help">
          {T.sheetHelp}
        </p>

        {/* 实时预览 */}
        <div className={`preview-card${previewValid ? ' is-valid' : ''}`} aria-hidden="true">
          <span className="preview-top">
            <span className="mini-chip preview-chip" />
            <span className="preview-tag">{T.sheetPreview}</span>
            <span className="preview-ok">
              <CheckIcon />
            </span>
          </span>
          <span className="preview-addr">
            <span className="preview-prefix">{preview}</span>
            <span className="preview-domain">@{domain}</span>
          </span>
        </div>

        <label htmlFor="prefix-input" className="field-label">
          {T.sheetInputLabel}
        </label>
        <div className={`field${error ? ' is-invalid' : ''}`} ref={fieldRef}>
          <input
            ref={inputRef}
            id="prefix-input"
            className="field-input"
            value={value}
            maxLength={PREFIX_MAX}
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellcheck={false}
            enterKeyHint="done"
            aria-invalid={!!error}
            aria-errormessage={error ? 'prefix-error' : undefined}
            onInput={(e) => {
              setValue(e.currentTarget.value);
              if (error) setError(null);
            }}
            onBlur={() => value.trim() && setError(validate(value.trim().toLowerCase()))}
          />
          <span className="field-suffix">@{domain}</span>
        </div>
        <p id="prefix-error" className="field-error" aria-live="polite">
          {error}
        </p>

        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {T.cancel}
          </button>
          <button type="submit" className="btn btn-primary">
            {T.sheetSubmit}
          </button>
        </div>
      </form>
    </dialog>
  );
}
