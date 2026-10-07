import { CodeChip } from './CodeChip';
import { LinkIcon, MailIcon, RefreshIcon } from './Icons';
import type { MailSummary } from '../lib/api';
import { senderName, shortTime } from '../lib/format';
import { T } from '../lib/text';
import type { InboxStatus } from '../lib/useInbox';

interface Props {
  ready: boolean;
  messages: MailSummary[];
  status: InboxStatus;
  checkedAt: number | null;
  selectedId: number | null;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  onOpen: (id: number) => void;
  onRefresh: () => void;
}

export function Inbox({ ready, messages, status, checkedAt, selectedId, copied, onCopy, onOpen, onRefresh }: Props) {
  const warn = status === 'error' || status === 'rate_limited';
  const showSkeleton = status === 'loading' && messages.length === 0;

  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <header className="inbox-head">
        <div className="inbox-title-row">
          <h2 id="inbox-title" className="section-title">
            {T.inbox}
            {messages.length > 0 && <span className="count">{messages.length}</span>}
          </h2>
          <p className={`inbox-status${warn ? ' is-warn' : ''}`} aria-live="polite">
            {T.status[status]}
            {status === 'ok' && checkedAt ? ` · ${shortTime(checkedAt)}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={T.refresh}
          title={T.refresh}
          disabled={!ready}
          onClick={onRefresh}
        >
          <RefreshIcon />
        </button>
      </header>

      {showSkeleton ? (
        <ul className="mail-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="mail-item is-skeleton">
              <span className="skeleton-bar" style={{ width: '38%' }} />
              <span className="skeleton-bar" style={{ width: '82%' }} />
              <span className="skeleton-bar skeleton-code" />
            </li>
          ))}
        </ul>
      ) : messages.length === 0 ? (
        <div className="empty">
          <MailIcon />
          <h3 className="empty-title">{T.emptyTitle}</h3>
          <p className="empty-body">{T.emptyBody}</p>
        </div>
      ) : (
        <ul className="mail-list">
          {messages.map((m) => (
            <li key={m.id} className={`mail-item${m.id === selectedId ? ' is-selected' : ''}`}>
              <div className="mail-meta">
                <span className="mail-sender">{senderName(m.sender) || T.unknownSender}</span>
                <time className="mail-time" dateTime={new Date(m.received_at).toISOString()}>
                  {shortTime(m.received_at)}
                </time>
              </div>
              {/* 整行可点：按钮的 ::after 铺满整个条目，验证码和链接按钮叠在其上 */}
              <button
                type="button"
                className="mail-open"
                data-mail-id={m.id}
                aria-current={m.id === selectedId ? 'true' : undefined}
                onClick={() => onOpen(m.id)}
              >
                {m.subject || T.noSubject}
              </button>
              {(m.code || m.link) && (
                <div className="mail-actions">
                  {m.code && (
                    <CodeChip
                      code={m.code}
                      copied={copied === `code-${m.id}`}
                      onCopy={() => onCopy(m.code!, `code-${m.id}`)}
                    />
                  )}
                  {m.link && (
                    <a className="btn btn-secondary btn-sm" href={m.link} target="_blank" rel="noopener noreferrer">
                      {T.openLink}
                      <LinkIcon />
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
