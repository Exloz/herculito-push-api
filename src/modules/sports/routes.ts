import { getJsonBody, json, withCors } from '../../shared/http/http';
import {
  addArcheryEnd,
  addArcheryRound,
  completeSportSession,
  deleteSportSession,
  getSportSessionWithDetails,
  getSportStats,
  listSportSessions,
  startSportSession,
  type SportSessionInput,
  type ArcheryRoundInput,
  type ArcheryEndInput
} from '../../shared/persistence/data-store';
import type { AppRouteHandler } from '../../app/router';

export const handleSportsRoutes: AppRouteHandler = async (req, url, context, meta) => {
  const origins = context.env.allowedOrigins;
  const isPath = (pathname: string): boolean => {
    return url.pathname === pathname || url.pathname === pathname.replace('/v1/', '/v1/data/');
  };
  const getSportsPathParts = (): string[] => {
    if (url.pathname.startsWith('/v1/data/sports/')) {
      return url.pathname.split('/').slice(4);
    }
    if (url.pathname.startsWith('/v1/sports/')) {
      return url.pathname.split('/').slice(3);
    }
    return [];
  };

  // List sport sessions
  if (req.method === 'GET' && isPath('/v1/sports/sessions')) {
    const { uid } = await context.requireAuth(req, meta);
    const sportType = url.searchParams.get('sportType') as 'archery' | undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
    const completedOnly = url.searchParams.get('completedOnly') === '1';

    const sessions = listSportSessions(context.db, uid, {
      sportType,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100,
      completedOnly
    });

    return withCors(req, json({ sessions }), origins);
  }

  // Get single session with details
  if (
    req.method === 'GET'
    && (url.pathname.startsWith('/v1/sports/sessions/') || url.pathname.startsWith('/v1/data/sports/sessions/'))
  ) {
    const { uid } = await context.requireAuth(req, meta);
    const pathParts = getSportsPathParts();
    const sessionId = pathParts[1];

    if (pathParts.length !== 2 || !sessionId) {
      return null;
    }

    const session = getSportSessionWithDetails(context.db, uid, sessionId);

    if (!session) {
      return withCors(req, json({ error: 'session_not_found' }, { status: 404 }), origins);
    }

    return withCors(req, json({ session }), origins);
  }

  // Start new sport session
  if (req.method === 'POST' && isPath('/v1/sports/sessions/start')) {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<SportSessionInput>(req);

    if (!body.sportType || body.sportType !== 'archery') {
      return withCors(req, json({ error: 'invalid_sport_type' }, { status: 400 }), origins);
    }

    if (body.sportType === 'archery' && !body.archeryConfig?.bowType) {
      return withCors(req, json({ error: 'missing_bow_type' }, { status: 400 }), origins);
    }

    const session = startSportSession(context.db, uid, body);
    return withCors(req, json({ session }), origins);
  }

  // Add archery round to session
  if (
    req.method === 'POST'
    && (url.pathname.match(/\/v1\/sports\/sessions\/[^/]+\/archery\/rounds$/)
      || url.pathname.match(/\/v1\/data\/sports\/sessions\/[^/]+\/archery\/rounds$/))
  ) {
    const { uid } = await context.requireAuth(req, meta);
    const pathParts = getSportsPathParts();
    const sessionId = pathParts[1];
    const body = await getJsonBody<ArcheryRoundInput>(req);

    if (!sessionId) {
      return withCors(req, json({ error: 'invalid_session_id' }, { status: 400 }), origins);
    }

    if (typeof body.distance !== 'number' || body.distance <= 0) {
      return withCors(req, json({ error: 'invalid_distance' }, { status: 400 }), origins);
    }

    if (typeof body.targetSize !== 'number' || body.targetSize <= 0) {
      return withCors(req, json({ error: 'invalid_target_size' }, { status: 400 }), origins);
    }

    const round = addArcheryRound(context.db, uid, sessionId, {
      distance: body.distance,
      targetSize: body.targetSize,
      arrowsPerEnd: body.arrowsPerEnd ?? 6
    });

    return withCors(req, json({ round }), origins);
  }

  // Add end to archery round
  if (
    req.method === 'POST'
    && (url.pathname.match(/\/v1\/sports\/sessions\/[^/]+\/archery\/rounds\/[^/]+\/ends$/)
      || url.pathname.match(/\/v1\/data\/sports\/sessions\/[^/]+\/archery\/rounds\/[^/]+\/ends$/))
  ) {
    const { uid } = await context.requireAuth(req, meta);
    const pathParts = getSportsPathParts();
    const sessionId = pathParts[1];
    const roundId = pathParts[4];

    if (!sessionId || !roundId) {
      return withCors(req, json({ error: 'invalid_ids' }, { status: 400 }), origins);
    }

    const body = await getJsonBody<ArcheryEndInput>(req);

    if (!Array.isArray(body.arrows) || body.arrows.length === 0) {
      return withCors(req, json({ error: 'invalid_arrows' }, { status: 400 }), origins);
    }

    // Validate arrow scores
    for (const arrow of body.arrows) {
      if (typeof arrow.score !== 'number' || arrow.score < 0 || arrow.score > 10) {
        return withCors(req, json({ error: 'invalid_arrow_score' }, { status: 400 }), origins);
      }
    }

    const end = addArcheryEnd(context.db, uid, sessionId, roundId, body);
    return withCors(req, json({ end }), origins);
  }

  // Complete sport session
  if (
    req.method === 'POST'
    && (url.pathname.match(/\/v1\/sports\/sessions\/[^/]+\/complete$/)
      || url.pathname.match(/\/v1\/data\/sports\/sessions\/[^/]+\/complete$/))
  ) {
    const { uid } = await context.requireAuth(req, meta);
    const pathParts = getSportsPathParts();
    const sessionId = pathParts[1];
    const body = await getJsonBody<{ notes?: string }>(req);

    if (!sessionId) {
      return withCors(req, json({ error: 'invalid_session_id' }, { status: 400 }), origins);
    }

    completeSportSession(context.db, uid, sessionId, body.notes);
    return withCors(req, json({ ok: true }), origins);
  }

  // Delete sport session
  if (
    req.method === 'DELETE'
    && (url.pathname.match(/\/v1\/sports\/sessions\/[^/]+$/)
      || url.pathname.match(/\/v1\/data\/sports\/sessions\/[^/]+$/))
  ) {
    const { uid } = await context.requireAuth(req, meta);
    const pathParts = getSportsPathParts();
    const sessionId = pathParts[1];

    if (!sessionId) {
      return withCors(req, json({ error: 'invalid_session_id' }, { status: 400 }), origins);
    }

    deleteSportSession(context.db, uid, sessionId);
    return withCors(req, json({ ok: true }), origins);
  }

  // Get sport stats
  if (req.method === 'GET' && isPath('/v1/sports/stats')) {
    const { uid } = await context.requireAuth(req, meta);
    const sportType = url.searchParams.get('sportType') as 'archery' | undefined;

    const stats = getSportStats(context.db, uid, sportType);
    return withCors(req, json({ stats }), origins);
  }

  return null;
};
