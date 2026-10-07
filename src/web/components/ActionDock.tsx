import { useRef } from 'react';
import { CheckIcon, CopyIcon, EditIcon, RenewIcon } from './Icons';
import { EASE, play, useReducedMotion } from '../lib/motion';
import { T } from '../lib/text';

interface Props {
  disabled: boolean;
  copied: boolean;
  onCopy: () => void;
  onRenew: () => void;
  onCustomize: () => void;
}

/** 复制 / 换一个 / 自定义。手机竖屏时是固定在拇指区的金属操作条，宽屏回到卡片下方。 */
export function ActionDock({ disabled, copied, onCopy, onRenew, onCustomize }: Props) {
  const reduced = useReducedMotion();
  const renewIcon = useRef<HTMLSpanElement>(null);

  return (
    <div className="dock">
      <div className="dock-bar" role="group" aria-label="地址操作">
        <button
          type="button"
          className={`btn btn-primary dock-copy${copied ? ' is-done' : ''}`}
          disabled={disabled}
          onClick={onCopy}
        >
          <span className="stack" aria-hidden="true">
            <span className={copied ? 'is-off' : undefined}>
              <CopyIcon />
            </span>
            <span className={copied ? undefined : 'is-off'}>
              <CheckIcon />
            </span>
          </span>
          <span className="stack">
            <span className={copied ? 'is-off' : undefined} aria-hidden={copied}>
              {T.copy}
            </span>
            <span className={copied ? undefined : 'is-off'} aria-hidden={!copied}>
              {T.copied}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          onClick={() => {
            if (!reduced) play(renewIcon.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 900, easing: EASE.inOut });
            onRenew();
          }}
        >
          <span className="icon-wrap" ref={renewIcon}>
            <RenewIcon />
          </span>
          {T.renew}
        </button>
        <button type="button" className="btn btn-ghost" disabled={disabled} onClick={onCustomize}>
          <EditIcon />
          {T.customize}
        </button>
      </div>
    </div>
  );
}
