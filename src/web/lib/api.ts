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
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function get<T>(path: string): Promise<T> {
  // 超时后按失败处理，避免一个卡住的请求让轮询永远停在“进行中”
  const res = await fetch(path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

export const fetchConfig = () => get<AppConfig>('/api/config');

export const fetchMessages = (address: string, since: number) =>
  get<{ messages: MailSummary[] }>(
    `/api/messages?address=${encodeURIComponent(address)}&since=${since}`,
  ).then((r) => r.messages);

export const fetchMessage = (address: string, id: number) =>
  get<{ message: MailDetail }>(`/api/messages/${id}?address=${encodeURIComponent(address)}`).then((r) => r.message);
