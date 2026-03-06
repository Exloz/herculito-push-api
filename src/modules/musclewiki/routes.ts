import { getJsonBody, json, withCors } from '../../shared/http/http';
import { isNonEmptyString, isValidLimit, isValidSlug } from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type MusclewikiSuggestBody = {
  query: string;
  limit?: number;
};

type MusclewikiVideoBody = {
  slug: string;
};

export const handleMusclewikiRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'POST' && url.pathname === '/v1/musclewiki/suggest') {
    await context.requireAuth(req, meta);
    const body = await getJsonBody<MusclewikiSuggestBody>(req);

    if (!isNonEmptyString(body.query)) {
      return withCors(req, json({ error: 'invalid_query' }, { status: 400 }), context.env.allowedOrigins);
    }

    const limit = isValidLimit(body.limit) ? body.limit : 5;
    const suggestions = await context.musclewiki.suggest(body.query, limit);
    return withCors(req, json({ suggestions }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/musclewiki/videos') {
    await context.requireAuth(req, meta);
    const body = await getJsonBody<MusclewikiVideoBody>(req);

    if (!isValidSlug(body.slug)) {
      return withCors(req, json({ error: 'invalid_slug' }, { status: 400 }), context.env.allowedOrigins);
    }

    const entry = await context.musclewiki.getVideos(body.slug);
    return withCors(
      req,
      json({
        pageUrl: entry.pageUrl,
        defaultVideoUrl: entry.defaultVideoUrl,
        variants: entry.variants
      }),
      context.env.allowedOrigins
    );
  }

  return null;
};
