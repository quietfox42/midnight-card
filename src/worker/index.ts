import { handleApi } from './api';
import { cleanup } from './cleanup';
import { handleEmail } from './email';
import type { Env } from './env';

// 注意：入口模块的每个具名导出都会被 Workers 当作入口点，这里只能有 default 导出。

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
