import { useRef } from 'preact/hooks';
import { CheckIcon, CopyIcon, EditIcon, RenewIcon } from './Icons';
import { EASE, play, useReducedMotion } from '../lib/motion';
import { T } from '../lib/text';

interface Props {
  disabled: boolean;
  copied: boolean;
  /** 卡片已滑出屏幕：主按钮里换成迷你卡 + 当前地址，让用户知道复制的是什么 */
  compact: boolean;
  address: string | null;
  onCopy: () => void;
  onRenew: () => void;
  onCustomize: () => void;
}

/**
 * 拇指区的悬浮金属胶囊：[复制地址][换一个][自定义]。
 * 手机竖屏固定在底部；宽屏和矮屏横屏回到卡片下方。
 */
export function ActionDock({ disabled, copied, compact, address, onCopy, onRenew, onCustomize }: Props) {
  const reduced = useReducedMotion();
  const renewIcon = useRef<HTMLSpanElement>(null);
  const [prefix, domain] = address ? address.split('@') : ['', ''];

  return (
    <div className={`dock${compact ? ' is-compact' : ''}`}>
      <div className="dock-bar" role="group" aria-label={T.addressActions}>
        <button
          type="button"
          className={`dock-copy${copied ? ' is-done' : ''}`}
          disabled={disabled}
          onClick={onCopy}
          aria-label={address ? `${T.copyAddress} ${address}` : T.copyAddress}
        >
          <span className="dock-copy-sheen" aria-hidden="true" />
          <span className="stack dock-copy-face" aria-hidden="true">
            {/* 默认：图标 + 复制地址 */}
            <span className={copied || compact ? 'is-off' : undefined}>
              <CopyIcon />
              {T.copyAddress}
            </span>
            {/* 卡片离屏：迷你卡 + 地址 */}
            <span className={`dock-mini${copied || !compact ? ' is-off' : ''}`}>
              <span className="mini-card">
                <span className="mini-chip" />
              </span>
              <span className="mini-addr">
                <span className="mini-prefix">{prefix}</span>
                <span className="mini-domain">@{domain}</span>
              </span>
              <CopyIcon />
            </span>
            {/* 复制成功 */}
            <span className={copied ? 'dock-done' : 'dock-done is-off'}>
              <CheckIcon />
              {T.copied}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="dock-tool"
          disabled={disabled}
          onClick={() => {
            if (!reduced) play(renewIcon.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 860, easing: EASE.spring });
            onRenew();
          }}
        >
          <span className="icon-wrap" ref={renewIcon}>
            <RenewIcon />
          </span>
          <span className="dock-tool-label">{T.renew}</span>
        </button>
        <button type="button" className="dock-tool" disabled={disabled} onClick={onCustomize}>
          <EditIcon />
          <span className="dock-tool-label">{T.customize}</span>
        </button>
      </div>
    </div>
  );
}
