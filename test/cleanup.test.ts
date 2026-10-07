import { describe, expect, it } from 'vitest';
import { cleanup, CLEANUP_BATCH } from '../src/worker/index';
import { insert } from './helpers/d1';
import { createEnv } from './helpers/env';

const NOW = 1_800_000_000_000;
const HOUR = 3600_000;

describe('定时清理', () => {
  it('分批删除过期邮件，保留未过期的', async () => {
    const { env, d1 } = createEnv();
    const expired = CLEANUP_BATCH * 2 + 7;
    insert(d1, Array.from({ length: expired }, () => ({ address: 'a@mail.test', received_at: NOW - 25 * HOUR })));
    insert(d1, [{ address: 'a@mail.test', received_at: NOW - HOUR }]);

    expect(await cleanup(env, NOW)).toBe(expired);
    expect(d1.queries).toHaveLength(3); // 5000 + 5000 + 7
    expect(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM emails').get()).toEqual({ n: 1 });
  });

  it('没有过期邮件时只查一次', async () => {
    const { env, d1 } = createEnv();
    expect(await cleanup(env, NOW)).toBe(0);
    expect(d1.queries).toHaveLength(1);
  });
});
