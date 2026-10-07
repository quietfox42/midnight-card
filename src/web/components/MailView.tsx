import { ArrowLeftIcon, CheckIcon, CopyIcon, EnvelopeOpenIcon, ExternalLinkIcon } from '@radix-ui/react-icons';
import { Button, Flex, Heading, IconButton, SegmentedControl, Spinner, Text } from '@radix-ui/themes';
import { useEffect, useState } from 'react';
import { fetchMessage, type MailDetail, type MailSummary } from '../lib/api';
import { fullTime } from '../lib/format';
import { useCopy } from '../lib/useCopy';

// 邮件内容不会变，详情读过一次就缓存在内存里，避免重复请求
const cache = new Map<string, MailDetail>();

// iframe 内的策略：禁止一切外部资源（图片、字体、样式、脚本），只允许内联样式和 data: 图片
const FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

function buildSrcDoc(html: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
    '<meta name="referrer" content="no-referrer"><base target="_blank">' +
    '<style>html{color-scheme:light}body{margin:16px;font:14px/1.5 system-ui,sans-serif;color:#1c2024;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>' +
    `</head><body>${html}</body></html>`
  );
}

interface Props {
  address: string | null;
  summary: MailSummary | null;
  onBack: () => void;
}

export function MailView({ address, summary, onBack }: Props) {
  const key = address && summary ? `${address}#${summary.id}` : null;
  const [detail, setDetail] = useState<MailDetail | null>(key ? cache.get(key) ?? null : null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<'html' | 'text'>('html');
  const [copied, copy] = useCopy();

  useEffect(() => {
    setFailed(false);
    setMode('html');
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

  if (!summary) {
    return (
      <Flex className="empty" direction="column" align="center" justify="center" gap="2">
        <EnvelopeOpenIcon width="28" height="28" />
        <Text size="2" color="gray">
          选择一封邮件查看内容
        </Text>
      </Flex>
    );
  }

  const showHtml = !!detail?.html && (mode === 'html' || !detail.text);

  return (
    <div className="mail-view">
      <div className="mail-head">
        <Button variant="ghost" color="gray" size="2" className="back-btn" onClick={onBack}>
          <ArrowLeftIcon /> 返回收件箱
        </Button>
        <Heading as="h2" size="4" mb="2" className="subject">
          {summary.subject || '(无主题)'}
        </Heading>
        <Text as="div" size="2" truncate>
          {summary.sender}
        </Text>
        <Text as="div" size="1" color="gray">
          {fullTime(summary.received_at)}
        </Text>
        {(summary.code || summary.link || (detail?.html && detail.text)) && (
          <Flex gap="2" mt="3" align="center" wrap="wrap">
            {summary.code && (
              <Button size="2" variant="soft" onClick={() => copy(summary.code!)}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? '已复制' : <>验证码 <span className="mono">{summary.code}</span></>}
              </Button>
            )}
            {summary.link && (
              <Button asChild size="2" variant="soft" color="gray">
                <a href={summary.link} target="_blank" rel="noopener noreferrer">
                  打开链接 <ExternalLinkIcon />
                </a>
              </Button>
            )}
            {detail?.html && detail.text && (
              <SegmentedControl.Root
                size="1"
                value={mode}
                onValueChange={(v) => setMode(v as 'html' | 'text')}
                className="mode-switch"
                aria-label="正文格式"
              >
                <SegmentedControl.Item value="html">HTML</SegmentedControl.Item>
                <SegmentedControl.Item value="text">纯文本</SegmentedControl.Item>
              </SegmentedControl.Root>
            )}
          </Flex>
        )}
      </div>

      <div className="mail-body">
        {failed ? (
          <Flex className="empty" direction="column" align="center" justify="center" gap="2">
            <Text size="2" color="gray">
              这封邮件加载失败，可能已过期被清理。
            </Text>
            <IconButton variant="soft" aria-label="返回" onClick={onBack}>
              <ArrowLeftIcon />
            </IconButton>
          </Flex>
        ) : !detail ? (
          <Flex className="empty" align="center" justify="center">
            <Spinner size="3" />
          </Flex>
        ) : showHtml ? (
          <iframe
            className="mail-frame"
            title={summary.subject || '邮件内容'}
            // 不给 allow-scripts / allow-same-origin：脚本不执行，内容拿不到本站任何数据
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            srcDoc={buildSrcDoc(detail.html!)}
          />
        ) : (
          <pre className="mail-text">{detail.text || '(空正文)'}</pre>
        )}
      </div>
    </div>
  );
}
