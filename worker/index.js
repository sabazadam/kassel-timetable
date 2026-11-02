// Worker entry: only /api/* reaches this script (run_worker_first in wrangler.jsonc);
// every other path is served straight from the static assets in dist/.
import { handleFeedback } from './feedback.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/feedback') return handleFeedback(request, env, ctx);
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
