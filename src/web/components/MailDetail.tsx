import { useEffect, useRef, useState } from 'preact/hooks';
import { CodeChip } from './CodeChip';
import { BackIcon, LinkIcon, MailIcon } from './Icons';
import { monogram } from './MailSlip';
import { fetchMessage, type MailDetail as Detail, type MailSummary } from '../lib/api';
import { fullTime, senderName } from '../lib/format';
import { T } from '../lib/text';
import { useSheetDrag } from '../lib/useSheetDrag';

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
  /** overlay：手机上从底部升起的全高面板；pane：宽屏右栏 */
  variant: 'overlay' | 'pane';
  address: string | null;
  summary: MailSummary | null;
  open: boolean;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  onBack: () => void;
}

export function MailDetail({ variant, address, summary, open, copied, onCopy, onBack }: Props) {
  const key = address && summary ? `${address}#${summary.id}` : null;
  const [detail, setDetail] = useState<Detail | null>(key ? cache.get(key) ?? null : null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<'html' | 'text'>('html');
  const backRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<HTMLDivElement>(null);
  const overlay = variant === 'overlay';

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

  // 下拉关闭：从把手开始，或内容已经滚到顶时从内容区开始
  useSheetDrag({
    panel: panelRef,
    scrim: scrimRef,
    handle: grabRef,
    scroller: scrollRef,
    enabled: overlay && open,
    onDismiss: onBack,
  });

  const showHtml = !!detail?.html && (mode === 'html' || !detail.text);
  const codeKey = summary ? `detail-code-${summary.id}` : '';

  const actions = summary && (summary.code || summary.link) && (
    <>
      {summary.code && (
        <CodeChip
          size={overlay ? 'md' : 'lg'}
          code={summary.code}
          copied={copied === codeKey}
          onCopy={() => onCopy(summary.code!, codeKey)}
        />
      )}
      {summary.link && (
        <a className="btn btn-secondary detail-link" href={summary.link} target="_blank" rel="noopener noreferrer">
          {T.openLink}
          <LinkIcon />
        </a>
      )}
    </>
  );

  return (
    <>
      {overlay && (
        <div className={`detail-scrim${open ? ' is-on' : ''}`} ref={scrimRef} aria-hidden="true" onClick={onBack} />
      )}
      <section
        ref={panelRef}
        className={`detail is-${variant}${open ? ' is-open' : ''}`}
        aria-labelledby={summary ? 'detail-subject' : undefined}
        aria-label={summary ? undefined : T.mailFrameTitle}
        aria-modal={overlay ? true : undefined}
        role={overlay ? 'dialog' : undefined}
      >
        {overlay && (
          <div className="detail-grab" ref={grabRef} aria-hidden="true">
            <span className="grabber" />
          </div>
        )}
        {!summary ? (
          <div className="empty detail-empty">
            <span className="empty-mark" aria-hidden="true">
              <MailIcon />
            </span>
            <p className="empty-body">{T.selectMail}</p>
          </div>
        ) : (
          <>
            <div className="detail-scroll" ref={scrollRef}>
              <div className="detail-content" key={summary.id}>
                <header className="detail-head">
                  <h2 id="detail-subject" className="detail-subject">
                    {summary.subject || T.noSubject}
                  </h2>
                  <div className="detail-sender">
                    <span className="slip-mono" aria-hidden="true">
                      {monogram(summary.sender)}
                    </span>
                    <span className="detail-sender-text">
                      <span className="detail-from-name">{senderName(summary.sender) || T.unknownSender}</span>
                      <span className="detail-from">{summary.sender || T.unknownSender}</span>
                    </span>
                    <span className="detail-time">{fullTime(summary.received_at)}</span>
                  </div>

                  {!overlay && actions && <div className="detail-actions">{actions}</div>}

                  {detail?.html && detail.text && (
                    <div className="segmented" role="group" aria-label={T.bodyFormat}>
                      <span className={`segmented-thumb${mode === 'text' ? ' is-right' : ''}`} aria-hidden="true" />
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
                    </div>
                  ) : !detail ? (
                    <div className="detail-loading" aria-busy="true">
                      <span className="skeleton-bar" style={{ width: '90%' }} />
                      <span className="skeleton-bar" style={{ width: '76%' }} />
                      <span className="skeleton-bar" style={{ width: '84%' }} />
                      <span className="skeleton-bar" style={{ width: '40%' }} />
                    </div>
                  ) : showHtml ? (
                    <div className="paper">
                      <iframe
                        className="mail-frame"
                        title={T.mailFrameTitle}
                        // 不给 allow-scripts / allow-same-origin：脚本不执行，内容拿不到本站任何数据
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        referrerPolicy="no-referrer"
                        srcDoc={buildSrcDoc(detail.html!)}
                      />
                    </div>
                  ) : (
                    <pre className="mail-text">{detail.text || T.emptyBody2}</pre>
                  )}
                </div>
              </div>
            </div>

            {overlay && (
              <div className="detail-bar">
                <button ref={backRef} type="button" className="btn btn-secondary detail-back" onClick={onBack}>
                  <BackIcon />
                  {T.back}
                </button>
                {actions}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
