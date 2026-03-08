import { json, withCors } from '../../shared/http/http';
import { getDashboardData } from '../../shared/persistence/data-store';
import type { AppRouteHandler } from '../../app/router';

export const handleDashboardRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/data/dashboard') {
    const { uid } = await context.requireAuth(req, meta);
    const dashboard = getDashboardData(context.db, uid);
    return withCors(req, json(dashboard), context.env.allowedOrigins);
  }

  return null;
};
