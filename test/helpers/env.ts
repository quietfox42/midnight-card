import type { Env } from '../../src/worker/env';
import { createD1, type TestD1 } from './d1';

export const DOMAIN = 'mail.test';

/** 每次返回新的 env 对象（getConfig 按 env 对象缓存） */
export function createEnv(overrides: Partial<Env> = {}): { env: Env; d1: TestD1 } {
  const d1 = createD1();
  const env: Env = {
    DB: d1.db,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    DOMAIN,
    RETENTION_HOURS: '24',
    MAX_RAW_BYTES: '1048576',
    MAX_BODY_BYTES: '204800',
    POLL_SECONDS: '10',
    BLOCKED_SENDERS: 'none',
    EXTRA_RESERVED: 'none',
    FORWARD_TO: 'none',
    ...overrides,
  };
  return { env, d1 };
}
