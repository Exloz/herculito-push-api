import { json, withCors } from '../../shared/http/http';
import type { AppRouteContext, AppRouteHandler } from '../../app/router';

export const handleSystemRoutes: AppRouteHandler = async (
  req,
  url,
  context: AppRouteContext
) => {
  if (req.method === 'GET' && url.pathname === '/health') {
    const probe = context.db.query<{ ok: number }, []>('SELECT 1 as ok').get();
    if (!probe || probe.ok !== 1) {
      return withCors(req, json({ ok: false, db: false }, { status: 503 }), context.env.allowedOrigins);
    }
    return withCors(req, json({ ok: true, db: true }), context.env.allowedOrigins);
  }

  return null;
};
