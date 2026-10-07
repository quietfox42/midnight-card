import { useState } from 'react';
import { BRAND, T } from '../lib/text';

interface Props {
  prefix: string | null;
  domain: string | null;
  onCopy: () => void;
}

/** 金属黑卡：左上芯片，右上品牌，左下地址。高光在加载时划过一次，悬停时再划一次。 */
export function BlackCard({ prefix, domain, onCopy }: Props) {
  // key 变化会重新挂载高光层，从而重新播放一次动画
  const [sheen, setSheen] = useState(0);
  const ready = prefix && domain;

  return (
    <div
      className="card"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setSheen((n) => n + 1);
      }}
    >
      <span className="card-sheen" key={sheen} aria-hidden="true" />
      <div className="card-top">
        <span className="chip" aria-hidden="true" />
        <span className="card-brand">{BRAND}</span>
      </div>
      <div className="card-bottom">
        <span className="card-label" id="address-label">
          {T.addressLabel}
        </span>
        {ready ? (
          <button type="button" className="card-address" aria-describedby="address-label" onClick={onCopy}>
            <span className="addr-prefix">{prefix}</span>
            <span className="addr-domain">@{domain}</span>
          </button>
        ) : (
          <span className="card-address is-placeholder" aria-busy="true">
            <span className="skeleton-bar" style={{ width: '72%' }} />
            <span className="visually-hidden">{T.addressPlaceholder}</span>
          </span>
        )}
      </div>
    </div>
  );
}
