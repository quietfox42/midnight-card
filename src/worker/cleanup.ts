import { getConfig, type Env } from './env';

/** 每批删除的行数与每次 Cron 最多跑几批：单条语句耗时有界，积压时分多次 Cron 消化 */
export const CLEANUP_BATCH = 5000;
export const CLEANUP_MAX_BATCHES = 20;

/** 分批删除过期邮件，走 idx_emails_received_at。返回删除的总行数。 */
export async function cleanup(env: Env, now = Date.now()): Promise<number> {
  const cutoff = now - getConfig(env).retentionMs;
  const stmt = env.DB.prepare(
    'DELETE FROM emails WHERE id IN (SELECT id FROM emails WHERE received_at < ? LIMIT ?)',
  );
  let total = 0;
  for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
    const { meta } = await stmt.bind(cutoff, CLEANUP_BATCH).run();
    const changes = meta.changes ?? 0;
    total += changes;
    if (changes < CLEANUP_BATCH) break;
  }
  return total;
}
