import { handleApi } from './api';
import { handleEmail } from './email';
import { num, type Env } from './env';

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

  // 单条 DELETE 清理过期邮件，走 idx_emails_received_at
  async scheduled(_controller, env): Promise<void> {
    const cutoff = Date.now() - num(env.RETENTION_HOURS, 24, 1) * 3600 * 1000;
    await env.DB.prepare('DELETE FROM emails WHERE received_at < ?').bind(cutoff).run();
  },
} satisfies ExportedHandler<Env>;
