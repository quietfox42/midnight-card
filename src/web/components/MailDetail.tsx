import { useEffect, useRef, useState } from 'react';
import { CodeChip } from './CodeChip';
import { BackIcon, LinkIcon, MailIcon } from './Icons';
import { fetchMessage, type MailDetail as Detail, type MailSummary } from '../lib/api';
import { fullTime } from '../lib/format';
import { T } from '../lib/text';

// 邮件内容不会变，读过一次就缓存在内存里，避免重复请求
const cache = new Map<string, Detail>();

// iframe 内的策略：禁止一切外部资源（图片、字体、样式、脚本），只允许内联样式和 data: 图片
const FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

function buildSrcDoc(html: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
    '<meta name="referrer" content="no-referrer"><base target="_blank">' +
    '<style>html{color-scheme:light}body{margin:16px;font:15px/1.55 system-ui,-apple-system,sans-serif;color:#1c2024;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>' +
    `</head><body>${html}</body></html>`
  );
}

interface Props {
  address: string | null;
  summary: MailSummary | null;
  open: boolean;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  onBack: () => void;
}

/** 邮件详情。手机上是从右侧滑入的全屏页，宽屏上是右栏。 */
export function MailDetail({ address, summary, open, copied, onCopy, onBack }: Props) {
  const key = address && summary ? `${address}#${summary.id}` : null;
  const [detail, setDetail] = useState<Detail | null>(key ? cache.get(key) ?? null : null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<'html' | 'text'>('html');
  const backRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFailed(false);
    setMode('html');
    scrollRef.current?.scrollTo(0, 0);
    if (!key || !address || !summary) {
      setDetail(null);
      return;
    }
    const hit = cache.get(key);
    if (hit) {
      setDetail(hit);
      return;
    }
    setDetail(null);
    let cancelled = false;
    fetchMessage(address, summary.id)
      .then((d) => {
        cache.set(key, d);
        if (!cancelled) setDetail(d);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [key, address, summary]);

  // 打开后把焦点交给“返回”，方便读屏和键盘用户
  useEffect(() => {
    if (open) backRef.current?.focus({ preventScroll: true });
  }, [open, summary?.id]);

  if (!summary) {
    return (
      <section className="detail" aria-label={T.mailFrameTitle}>
        <div className="empty detail-empty">
          <MailIcon />
          <p className="empty-body">{T.selectMail}</p>
        </div>
      </section>
    );
  }

  const showHtml = !!detail?.html && (mode === 'html' || !detail.text);
  const codeKey = `detail-code-${summary.id}`;

  return (
    <section className={`detail${open ? ' is-open' : ''}`} aria-labelledby="detail-subject">
      <div className="detail-scroll" ref={scrollRef}>
        <div className="detail-bar">
          <button ref={backRef} type="button" className="back-btn" onClick={onBack}>
            <BackIcon />
            {T.back}
          </button>
        </div>

        <header className="detail-head">
          <h2 id="detail-subject" className="detail-subject">
            {summary.subject || T.noSubject}
          </h2>
          <p className="detail-from">{summary.sender || T.unknownSender}</p>
          <p className="detail-time">{fullTime(summary.received_at)}</p>

          {(summary.code || summary.link) && (
            <div className="detail-actions">
              {summary.code && (
                <CodeChip
                  size="lg"
                  code={summary.code}
                  copied={copied === codeKey}
                  onCopy={() => onCopy(summary.code!, codeKey)}
                />
              )}
              {summary.link && (
                <a className="btn btn-secondary" href={summary.link} target="_blank" rel="noopener noreferrer">
                  {T.openLink}
                  <LinkIcon />
                </a>
              )}
            </div>
          )}

          {detail?.html && detail.text && (
            <div className="segmented" role="group" aria-label={T.bodyFormat}>
              <button type="button" aria-pressed={mode === 'html'} onClick={() => setMode('html')}>
                {T.viewHtml}
              </button>
              <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
                {T.viewText}
              </button>
            </div>
          )}
        </header>

        <div className="detail-body">
          {failed ? (
            <div className="empty">
              <p className="empty-body">{T.mailLoadError}</p>
              <button type="button" className="btn btn-secondary" onClick={onBack}>
                {T.back}
              </button>
            </div>
          ) : !detail ? (
            <div className="detail-loading" aria-busy="true">
              <span className="skeleton-bar" style={{ width: '90%' }} />
              <span className="skeleton-bar" style={{ width: '76%' }} />
              <span className="skeleton-bar" style={{ width: '84%' }} />
              <span className="skeleton-bar" style={{ width: '40%' }} />
            </div>
          ) : showHtml ? (
            <iframe
              className="mail-frame"
              title={T.mailFrameTitle}
              // 不给 allow-scripts / allow-same-origin：脚本不执行，内容拿不到本站任何数据
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={buildSrcDoc(detail.html!)}
            />
          ) : (
            <pre className="mail-text">{detail.text || T.emptyBody2}</pre>
          )}
        </div>
      </div>
    </section>
  );
}
