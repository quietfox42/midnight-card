import { CheckIcon, EnvelopeClosedIcon, ExternalLinkIcon, ReloadIcon } from '@radix-ui/react-icons';
import { Badge, Button, Flex, IconButton, Spinner, Text, Tooltip } from '@radix-ui/themes';
import type { MailSummary } from '../lib/api';
import { senderName, shortTime } from '../lib/format';
import type { InboxStatus } from '../lib/useInbox';
import { useCopy } from '../lib/useCopy';

interface Props {
  address: string | null;
  messages: MailSummary[];
  status: InboxStatus;
  checkedAt: number | null;
  selectedId: number | null;
  retentionHours: number;
  onSelect: (id: number) => void;
  onRefresh: () => void;
}

const STATUS_TEXT: Record<InboxStatus, string> = {
  loading: '正在连接…',
  ok: '自动刷新中',
  error: '刷新失败，稍后自动重试',
  rate_limited: '请求太频繁，1 分钟后自动重试',
};

export function MailList({ address, messages, status, checkedAt, selectedId, retentionHours, onSelect, onRefresh }: Props) {
  const [copied, copy] = useCopy();

  return (
    <>
      <Flex className="pane-header" align="center" justify="between" gap="2">
        <Flex align="center" gap="2" minWidth="0">
          <Text size="2" weight="medium">
            收件箱
          </Text>
          {messages.length > 0 && (
            <Badge color="gray" variant="soft" radius="full">
              {messages.length}
            </Badge>
          )}
          <Text size="1" color={status === 'ok' || status === 'loading' ? 'gray' : 'amber'} truncate>
            {STATUS_TEXT[status]}
            {status === 'ok' && checkedAt ? ` · ${shortTime(checkedAt)}` : ''}
          </Text>
        </Flex>
        <Tooltip content="立即刷新">
          <IconButton size="1" variant="ghost" color="gray" aria-label="立即刷新" onClick={onRefresh} disabled={!address}>
            <ReloadIcon />
          </IconButton>
        </Tooltip>
      </Flex>

      {messages.length === 0 ? (
        <Flex className="empty" direction="column" align="center" justify="center" gap="3">
          {status === 'loading' ? <Spinner size="3" /> : <EnvelopeClosedIcon width="28" height="28" />}
          <Text size="3" weight="medium">
            还没有邮件
          </Text>
          <Text size="2" color="gray" align="center">
            把上面的地址填到需要注册的网站，新邮件会在几秒内出现在这里。
            <br />
            邮件保留 {retentionHours} 小时。
          </Text>
          {address && (
            <Button variant="soft" size="2" onClick={() => copy(address, 'address')}>
              {copied === 'address' ? <CheckIcon /> : null}
              {copied === 'address' ? '已复制' : '复制地址'}
            </Button>
          )}
        </Flex>
      ) : (
        <ul className="mail-list" role="list">
          {messages.map((m) => (
            <li key={m.id}>
              <div
                className={`mail-item${m.id === selectedId ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-current={m.id === selectedId}
                onClick={() => onSelect(m.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(m.id);
                  }
                }}
              >
                <Flex justify="between" gap="2" align="baseline">
                  <Text size="2" weight="medium" truncate>
                    {senderName(m.sender) || '(未知发件人)'}
                  </Text>
                  <Text size="1" color="gray" className="nowrap">
                    {shortTime(m.received_at)}
                  </Text>
                </Flex>
                <Text as="div" size="2" color="gray" truncate>
                  {m.subject || '(无主题)'}
                </Text>
                {(m.code || m.link) && (
                  <Flex gap="2" mt="2" align="center" wrap="wrap">
                    {m.code && (
                      <Tooltip content="点击复制验证码">
                        <button
                          type="button"
                          className="code-badge"
                          aria-label={`复制验证码 ${m.code}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void copy(m.code!, `code-${m.id}`);
                          }}
                        >
                          <Badge size="2" color={copied === `code-${m.id}` ? 'grass' : 'indigo'} variant="soft">
                            {copied === `code-${m.id}` ? (
                              <>
                                <CheckIcon /> 已复制
                              </>
                            ) : (
                              <span className="mono">{m.code}</span>
                            )}
                          </Badge>
                        </button>
                      </Tooltip>
                    )}
                    {m.link && (
                      <Button asChild size="1" variant="soft" color="gray">
                        <a href={m.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          打开链接 <ExternalLinkIcon />
                        </a>
                      </Button>
                    )}
                  </Flex>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
