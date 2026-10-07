import { isUnset, parseList, RESERVED_PREFIXES } from '../shared/address';

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

/** 解析好的配置。变量在一个 isolate 的生命周期内不变，按 env 对象缓存。 */
export interface Config {
  domain: string;
  retentionHours: number;
  retentionMs: number;
  maxRawBytes: number;
  maxBodyBytes: number;
  pollSeconds: number;
  blocked: ReadonlySet<string>;
  extraReserved: readonly string[];
  reserved: readonly string[];
  forwardTo: string | null;
}

const cache = new WeakMap<Env, Config>();

export function getConfig(env: Env): Config {
  let c = cache.get(env);
  if (!c) {
    const retentionHours = num(env.RETENTION_HOURS, 24, 1);
    const extraReserved = parseList(env.EXTRA_RESERVED);
    c = {
      domain: env.DOMAIN.trim().toLowerCase(),
      retentionHours,
      retentionMs: retentionHours * 3600_000,
      maxRawBytes: num(env.MAX_RAW_BYTES, 1024 * 1024, 1024),
      maxBodyBytes: num(env.MAX_BODY_BYTES, 200 * 1024, 1024),
      pollSeconds: Math.max(10, num(env.POLL_SECONDS, 10)),
      blocked: new Set(parseList(env.BLOCKED_SENDERS)),
      extraReserved,
      reserved: [...RESERVED_PREFIXES, ...extraReserved],
      forwardTo: isUnset(env.FORWARD_TO) ? null : env.FORWARD_TO.trim(),
    };
    cache.set(env, c);
  }
  return c;
}
