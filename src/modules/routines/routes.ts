import { getJsonBody, json, withCors } from '../../shared/http/http';
import {
  createRoutine,
  deleteRoutine,
  incrementRoutineUsage,
  listHiddenPublicRoutineIds,
  listRoutines,
  setRoutineVisibility,
  updateRoutine,
  type RoutineInput
} from '../../shared/persistence/data-store';
import {
  isBoolean,
  isNonEmptyString,
  isValidExerciseList,
  isValidLimitParam
} from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type RoutineCreateBody = RoutineInput;

type RoutineUpdateBody = {
  id: string;
  updates: Partial<RoutineCreateBody>;
};

type RoutineDeleteBody = {
  id: string;
};

type RoutineUsageBody = {
  id: string;
};

type RoutineVisibilityBody = {
  routineId: string;
  visible: boolean;
};

export const handleRoutineRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/data/routines') {
    const { uid } = await context.requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 200);
    const routines = listRoutines(context.db, uid, limit);
    return withCors(req, json({ routines }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines') {
    const auth = await context.requireAuth(req, meta);
    const body = await getJsonBody<RoutineCreateBody>(req);

    if (!isNonEmptyString(body.name) || !isValidExerciseList(body.exercises)) {
      return withCors(req, json({ error: 'invalid_routine' }, { status: 400 }), context.env.allowedOrigins);
    }

    try {
      const routine = createRoutine(context.db, auth.uid, {
        ...body,
        createdByName: auth.displayName ?? body.createdByName
      });
      return withCors(req, json({ routine }), context.env.allowedOrigins);
    } catch (error) {
      if (error instanceof Error && error.message === 'routine_id_conflict') {
        return withCors(req, json({ error: 'routine_id_conflict' }, { status: 409 }), context.env.allowedOrigins);
      }
      throw error;
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/update') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<RoutineUpdateBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    if (body.updates?.exercises && !isValidExerciseList(body.updates.exercises)) {
      return withCors(req, json({ error: 'invalid_routine_exercises' }, { status: 400 }), context.env.allowedOrigins);
    }

    updateRoutine(context.db, uid, body.id, body.updates ?? {});
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/delete') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<RoutineDeleteBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    deleteRoutine(context.db, uid, body.id);
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/use') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<RoutineUsageBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    incrementRoutineUsage(context.db, uid, body.id);
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/routines/visibility') {
    const { uid } = await context.requireAuth(req, meta);
    const hiddenRoutineIds = listHiddenPublicRoutineIds(context.db, uid);
    return withCors(req, json({ hiddenRoutineIds }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/visibility') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<RoutineVisibilityBody>(req);

    if (!isNonEmptyString(body.routineId) || !isBoolean(body.visible)) {
      return withCors(req, json({ error: 'invalid_routine_visibility' }, { status: 400 }), context.env.allowedOrigins);
    }

    const updated = setRoutineVisibility(context.db, uid, {
      routineId: body.routineId,
      visible: body.visible
    });

    if (!updated) {
      return withCors(req, json({ error: 'routine_not_visible_to_user' }, { status: 404 }), context.env.allowedOrigins);
    }

    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  return null;
};
