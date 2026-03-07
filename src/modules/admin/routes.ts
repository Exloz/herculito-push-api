import { json, withCors } from '../../shared/http/http';
import { getAdminOverview } from '../../shared/persistence/data-store';
import { isAdminAuth } from '../../shared/auth/admin';
import type { AppRouteHandler } from '../../app/router';

export const handleAdminRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/data/admin/overview') {
    const auth = await context.requireAuth(req, meta);

    if (!isAdminAuth(auth)) {
      return withCors(req, json({ error: 'forbidden' }, { status: 403 }), context.env.allowedOrigins);
    }

    const overview = getAdminOverview(context.db);
    return withCors(req, json(overview), context.env.allowedOrigins);
  }

  return null;
};
