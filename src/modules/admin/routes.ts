import { json, withCors } from '../../shared/http/http';
import { getAdminOverview } from '../../shared/persistence/data-store';
import { isAdminAuth } from '../../shared/auth/admin';
import type { AppRouteHandler } from '../../app/router';

const ADMIN_OVERVIEW_CACHE_TTL_MS = 15 * 1000;

let cachedOverview: { payload: ReturnType<typeof getAdminOverview>; expiresAt: number } | null = null;

export const handleAdminRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/data/admin/overview') {
    const auth = await context.requireAuth(req, meta);

    if (!isAdminAuth(auth)) {
      return withCors(req, json({ error: 'forbidden' }, { status: 403 }), context.env.allowedOrigins);
    }

    const now = Date.now();
    const overview = cachedOverview && cachedOverview.expiresAt > now
      ? cachedOverview.payload
      : (() => {
        const payload = getAdminOverview(context.db);
        cachedOverview = {
          payload,
          expiresAt: now + ADMIN_OVERVIEW_CACHE_TTL_MS
        };
        return payload;
      })();

    return withCors(req, json(overview), context.env.allowedOrigins);
  }

  return null;
};
