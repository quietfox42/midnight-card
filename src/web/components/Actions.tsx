import { CheckIcon, CopyIcon, EditIcon, RenewIcon } from './Icons';
import { T } from '../lib/text';

interface Props {
  disabled: boolean;
  copied: boolean;
  onCopy: () => void;
  onRenew: () => void;
  onCustomize: () => void;
}

/** 复制 / 换一个 / 自定义。手机竖屏时固定在屏幕底部的拇指区。 */
export function Actions({ disabled, copied, onCopy, onRenew, onCustomize }: Props) {
  return (
    <div className="actions" role="group" aria-label="地址操作">
      <button type="button" className="btn btn-primary" disabled={disabled} onClick={onCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span className="stack">
          <span className={copied ? 'is-off' : undefined} aria-hidden={copied}>
            {T.copy}
          </span>
          <span className={copied ? undefined : 'is-off'} aria-hidden={!copied}>
            {T.copied}
          </span>
        </span>
      </button>
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={onRenew}>
        <RenewIcon />
        {T.renew}
      </button>
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={onCustomize}>
        <EditIcon />
        {T.customize}
      </button>
    </div>
  );
}
