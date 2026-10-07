import { CheckIcon } from './Icons';
import { T } from '../lib/text';

interface Props {
  code: string;
  copied: boolean;
  onCopy: () => void;
  size?: 'md' | 'lg';
}

/** 验证码：大号等宽字，一点就复制。两种状态叠放在同一格，切换时不改变尺寸。 */
export function CodeChip({ code, copied, onCopy, size = 'md' }: Props) {
  return (
    <button
      type="button"
      className={`code-chip code-${size}${copied ? ' is-copied' : ''}`}
      aria-label={copied ? T.copied : T.copyCode(code)}
      onClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
    >
      <span className="code-label" aria-hidden="true">
        {T.codeLabel}
      </span>
      <span className="stack" aria-hidden="true">
        <span className={copied ? 'code-value is-off' : 'code-value'}>{code}</span>
        <span className={copied ? 'code-done' : 'code-done is-off'}>
          <CheckIcon />
          {T.copied}
        </span>
      </span>
    </button>
  );
}
