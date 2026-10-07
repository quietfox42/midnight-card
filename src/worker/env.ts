export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  API_LIMITER?: RateLimit;
  DOMAIN: string;
  RETENTION_HOURS: string;
  MAX_RAW_BYTES: string;
  MAX_BODY_BYTES: string;
  POLL_SECONDS: string;
  BLOCKED_SENDERS: string;
  EXTRA_RESERVED: string;
  FORWARD_TO: string;
}

export function num(value: string | undefined, fallback: number, min = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}
