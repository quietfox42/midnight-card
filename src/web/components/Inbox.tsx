import { useLayoutEffect, useRef } from 'react';
import { MailSlip } from './MailSlip';
import { MailIcon, RefreshIcon } from './Icons';
import type { MailSummary } from '../lib/api';
import { shortTime } from '../lib/format';
import { EASE, play, useReducedMotion } from '../lib/motion';
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
  /** 轮询拿到新邮件（首次加载不算） */
  onArrive: (count: number) => void;
}

export function Inbox(props: Props) {
  const { ready, messages, status, checkedAt, selectedId, copied, onCopy, onOpen, onRefresh, onArrive } = props;
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const refreshIcon = useRef<HTMLSpanElement>(null);
  const seen = useRef(new Set<number>());
  const primed = useRef(false);

  // 新邮件像卡片一样从卡槽滑出：整列先上移到槽口之上（被裁掉），再落回原位
  useLayoutEffect(() => {
    if (status === 'loading') {
      // 新地址：重新记账，首批邮件不播动画
      seen.current.clear();
      primed.current = false;
      return;
    }
    if (!primed.current) {
      for (const m of messages) seen.current.add(m.id);
      primed.current = true;
      return;
    }
    const fresh = messages.filter((m) => !seen.current.has(m.id));
    if (!fresh.length) return;
    for (const m of fresh) seen.current.add(m.id);
    onArrive(fresh.length);

    play(slotRef.current, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 1400, easing: 'ease-out' });

    const ul = listRef.current;
    if (!ul) return;
    const els = fresh
      .map((m) => ul.querySelector<HTMLElement>(`[data-slip="${m.id}"]`))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;

    if (reduced) {
      for (const el of els) play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    const gap = parseFloat(getComputedStyle(ul).rowGap) || 0;
    const shift = last.offsetTop + last.offsetHeight - first.offsetTop + gap;
    play(ul, [{ transform: `translate3d(0, ${-shift}px, 0)` }, { transform: 'none' }], { duration: 680, easing: EASE.out });
    els.forEach((el, i) => {
      play(el.querySelector('.slip-glow'), [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], {
        duration: 1800,
        delay: 380 + i * 80,
        easing: 'ease-out',
      });
    });
  }, [messages, status, onArrive, reduced]);

  const warn = status === 'error' || status === 'rate_limited';
  const showSkeleton = status === 'loading' && messages.length === 0;

  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <header className="inbox-head">
        <div className="inbox-title-row">
          <h2 id="inbox-title" className="section-title">
            {T.inbox}
            {messages.length > 0 && (
              <span className="count" key={messages.length}>
                {messages.length}
              </span>
            )}
          </h2>
          <p className={`inbox-status${warn ? ' is-warn' : ''}${status === 'ok' ? ' is-live' : ''}`} aria-live="polite">
            <span className="live-dot" aria-hidden="true" />
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
          onClick={() => {
            if (!reduced) play(refreshIcon.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 700, easing: EASE.out });
            onRefresh();
          }}
        >
          <span className="icon-wrap" ref={refreshIcon}>
            <RefreshIcon />
          </span>
        </button>
      </header>

      <div className="slot" aria-hidden="true">
        <span className="slot-glow" ref={slotRef} />
      </div>

      <div className="slip-well">
        {showSkeleton ? (
          <ul className="slip-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="slip is-skeleton">
                <span className="skeleton-bar slip-mono" />
                <span className="slip-main">
                  <span className="skeleton-bar" style={{ width: '38%' }} />
                  <span className="skeleton-bar" style={{ width: '82%' }} />
                </span>
              </li>
            ))}
          </ul>
        ) : messages.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden="true">
              <MailIcon />
            </span>
            <h3 className="empty-title">{T.emptyTitle}</h3>
            <p className="empty-body">{T.emptyBody}</p>
          </div>
        ) : (
          <ul className="slip-list" ref={listRef}>
            {messages.map((m) => (
              <MailSlip
                key={m.id}
                mail={m}
                selected={m.id === selectedId}
                copied={copied}
                onCopy={onCopy}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
