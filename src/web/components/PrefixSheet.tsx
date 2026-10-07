import { useEffect, useRef, useState, type FormEvent } from 'react';
import { checkPrefix, PREFIX_MAX } from '../../shared/address';
import { PREFIX_ERRORS, T } from '../lib/text';

interface Props {
  open: boolean;
  domain: string;
  current: string;
  reserved: string[];
  onClose: () => void;
  onSubmit: (prefix: string) => void;
}

/** 底部抽屉。用原生 <dialog>：自带焦点限制、Esc 关闭、背景不可交互。 */
export function PrefixSheet({ open, domain, current, reserved, onClose, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue(current);
      setError(null);
      dialog.showModal();
      // 等抽屉渲染后再聚焦，避免移动端键盘弹起时页面跳动
      requestAnimationFrame(() => inputRef.current?.select());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, current]);

  const validate = (v: string) => {
    const err = checkPrefix(v, reserved);
    return err ? PREFIX_ERRORS[err] : null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim().toLowerCase();
    const err = validate(v);
    setError(err);
    if (err) {
      inputRef.current?.focus();
      return;
    }
    onSubmit(v);
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      aria-describedby="sheet-help"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // 点遮罩关闭
      }}
    >
      <form className="sheet-body" onSubmit={submit} noValidate>
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="sheet-title" className="sheet-title">
          {T.sheetTitle}
        </h2>
        <p id="sheet-help" className="sheet-help">
          {T.sheetHelp}
        </p>

        <label htmlFor="prefix-input" className="field-label">
          {T.sheetInputLabel}
        </label>
        <div className={`field${error ? ' is-invalid' : ''}`}>
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
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={!!error}
            aria-errormessage={error ? 'prefix-error' : undefined}
            onChange={(e) => {
              setValue(e.target.value);
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
