import { useEffect, useRef, useState } from 'react';
import { CodeChip } from './CodeChip';
import { BackIcon, LinkIcon, MailIcon } from './Icons';
import { monogram } from './MailSlip';
import { fetchMessage, type MailDetail as Detail, type MailSummary } from '../lib/api';
import { fullTime, senderName } from '../lib/format';
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

// 边缘右滑返回：超过宽度的这个比例，或松手时速度够快，就关闭
const SWIPE_CLOSE_RATIO = 0.33;
const SWIPE_CLOSE_VELOCITY = 0.5; // px/ms

interface Props {
  /** overlay：手机上从右侧滑入的全屏页；pane：宽屏右栏 */
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
  const gripRef = useRef<HTMLDivElement>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

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

  // 从左边缘右滑返回。手指跟随时直接写 transform；松手后交还给 CSS 过渡。
  useEffect(() => {
    const grip = gripRef.current;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (variant !== 'overlay' || !open || !grip || !panel || !scrim) return;

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    let decided = false;
    let dragging = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = lastX = t.clientX;
      startY = t.clientY;
      lastT = e.timeStamp;
      dx = vx = 0;
      decided = dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (!decided) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        decided = true;
        dragging = mx > 0 && Math.abs(mx) > Math.abs(my);
        if (dragging) {
          panel.style.transition = 'none';
          scrim.style.transition = 'none';
        }
      }
      if (!dragging) return;
      e.preventDefault();
      dx = Math.max(0, mx);
      vx = (t.clientX - lastX) / Math.max(1, e.timeStamp - lastT);
      lastX = t.clientX;
      lastT = e.timeStamp;
      panel.style.transform = `translate3d(${dx}px, 0, 0)`;
      scrim.style.opacity = String(Math.max(0, 1 - dx / panel.clientWidth));
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = '';
      scrim.style.transition = '';
      if (dx > panel.clientWidth * SWIPE_CLOSE_RATIO || vx > SWIPE_CLOSE_VELOCITY) {
        // 先从当前位置滑走，再走正常的返回流程（历史记录、焦点恢复）
        panel.style.transform = 'translate3d(100%, 0, 0)';
        scrim.style.opacity = '0';
        onBackRef.current();
      } else {
        panel.style.transform = '';
        scrim.style.opacity = '';
      }
    };

    grip.addEventListener('touchstart', onStart, { passive: true });
    grip.addEventListener('touchmove', onMove, { passive: false });
    grip.addEventListener('touchend', onEnd);
    grip.addEventListener('touchcancel', onEnd);
    return () => {
      grip.removeEventListener('touchstart', onStart);
      grip.removeEventListener('touchmove', onMove);
      grip.removeEventListener('touchend', onEnd);
      grip.removeEventListener('touchcancel', onEnd);
      // 关闭后清掉内联样式，此时 CSS 的目标位置与内联值相同，不会跳
      panel.style.transition = panel.style.transform = '';
      scrim.style.transition = scrim.style.opacity = '';
    };
  }, [variant, open]);

  const overlay = variant === 'overlay';
  const showHtml = !!detail?.html && (mode === 'html' || !detail.text);
  const codeKey = summary ? `detail-code-${summary.id}` : '';

  return (
    <>
      {overlay && <div className={`detail-scrim${open ? ' is-on' : ''}`} ref={scrimRef} aria-hidden="true" />}
      <section
        ref={panelRef}
        className={`detail is-${variant}${open ? ' is-open' : ''}`}
        aria-labelledby={summary ? 'detail-subject' : undefined}
        aria-label={summary ? undefined : T.mailFrameTitle}
      >
        {overlay && <div className="edge-grip" ref={gripRef} aria-hidden="true" />}
        {!summary ? (
          <div className="empty detail-empty">
            <span className="empty-mark" aria-hidden="true">
              <MailIcon />
            </span>
            <p className="empty-body">{T.selectMail}</p>
          </div>
        ) : (
          <div className="detail-scroll" ref={scrollRef}>
            {overlay && (
              <div className="detail-bar">
                <button ref={backRef} type="button" className="back-btn" onClick={onBack}>
                  <BackIcon />
                  {T.back}
                </button>
              </div>
            )}

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
        )}
      </section>
    </>
  );
}
