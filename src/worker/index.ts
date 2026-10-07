import { handleApi } from './api';
import { handleEmail } from './email';
import { getConfig, type Env } from './env';

/** 每批删除的行数与每次 Cron 最多跑几批：单条语句耗时有界，积压时分多次 Cron 消化 */
export const CLEANUP_BATCH = 5000;
export const CLEANUP_MAX_BATCHES = 20;

export default {
  // 只有 /api/* 会进到这里（见 wrangler.toml assets.run_worker_first），其余由静态资源直接响应
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },

  async email(message, env): Promise<void> {
    await handleEmail(message, env);
  },

  async scheduled(_controller, env): Promise<void> {
    await cleanup(env);
  },
} satisfies ExportedHandler<Env>;

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
