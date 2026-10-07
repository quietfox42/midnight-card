export interface AppConfig {
  domain: string;
  retentionHours: number;
  pollSeconds: number;
  reserved: string[];
}

export interface MailSummary {
  id: number;
  sender: string;
  subject: string;
  code: string | null;
  link: string | null;
  received_at: number;
  has_html: number;
}

export interface MailDetail extends Omit<MailSummary, 'has_html'> {
  text: string | null;
  html: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** 429 时服务端给的 Retry-After（毫秒） */
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status}`);
  }
}

const TIMEOUT_MS = 15_000;

/** 调用方的取消信号 + 超时；旧浏览器没有 AbortSignal.any 时手动合并 */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  signal.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  return ctrl.signal;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  // 超时后按失败处理，避免一个卡住的请求让轮询永远停在“进行中”
  // 不加自定义请求头：config 请求要和 index.html 里的 <link rel=preload> 完全一致才能复用
  const res = await fetch(path, { signal: withTimeout(signal) });
  if (!res.ok) {
    const retry = Number(res.headers.get('retry-after'));
    throw new ApiError(res.status, retry > 0 ? retry * 1000 : undefined);
  }
  return res.json() as Promise<T>;
}

export const fetchConfig = () => get<AppConfig>('/api/config');

export interface MessagePage {
  messages: MailSummary[];
  /** 比这一页更新的邮件还有，应立即用新的 since 续拉 */
  more: boolean;
}

export const fetchMessages = (address: string, since: number, signal?: AbortSignal) =>
  get<MessagePage>(`/api/messages?address=${encodeURIComponent(address)}&since=${since}`, signal).then((r) => ({
    messages: r.messages,
    more: r.more === true,
  }));

export const fetchMessage = (address: string, id: number, signal?: AbortSignal) =>
  get<{ message: MailDetail }>(`/api/messages/${id}?address=${encodeURIComponent(address)}`, signal).then(
    (r) => r.message,
  );
