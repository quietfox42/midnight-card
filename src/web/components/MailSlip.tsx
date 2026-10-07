import { CodeChip } from './CodeChip';
import { LinkIcon } from './Icons';
import type { MailSummary } from '../lib/api';
import { senderName, shortTime } from '../lib/format';
import { T } from '../lib/text';

interface Props {
  mail: MailSummary;
  selected: boolean;
  unread: boolean;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  onOpen: (id: number) => void;
}

/** 首字母徽记，没有发件人时用圆点 */
export function monogram(sender: string): string {
  const name = senderName(sender).trim();
  return (Array.from(name)[0] ?? '·').toUpperCase();
}

/** 收件箱里的一封邮件：分组面板里的一行，整行可点开详情，验证码和链接叠在上层。 */
export function MailSlip({ mail: m, selected, unread, copied, onCopy, onOpen }: Props) {
  return (
    <li className={`slip${selected ? ' is-selected' : ''}${unread ? ' is-unread' : ''}`} data-slip={m.id}>
      <span className="slip-glow" aria-hidden="true" />
      <span className="slip-mono" aria-hidden="true">
        {monogram(m.sender)}
        <span className="slip-dot" />
      </span>
      <div className="slip-main">
        <div className="slip-meta">
          <span className="slip-sender">{senderName(m.sender) || T.unknownSender}</span>
          <time className="slip-time" dateTime={new Date(m.received_at).toISOString()}>
            {shortTime(m.received_at)}
          </time>
        </div>
        <button
          type="button"
          className="slip-open"
          data-mail-id={m.id}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onOpen(m.id)}
        >
          {unread && <span className="visually-hidden">{T.unread} </span>}
          {m.subject || T.noSubject}
        </button>
        {(m.code || m.link) && (
          <div className="slip-actions">
            {m.code && (
              <CodeChip code={m.code} copied={copied === `code-${m.id}`} onCopy={() => onCopy(m.code!, `code-${m.id}`)} />
            )}
            {m.link && (
              <a className="btn btn-secondary btn-sm" href={m.link} target="_blank" rel="noopener noreferrer">
                {T.openLink}
                <LinkIcon />
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
