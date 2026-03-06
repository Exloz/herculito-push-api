import { getJsonBody, json, withCors } from '../../shared/http/http';
import {
  createExercise,
  incrementExerciseUsage,
  listExercises,
  updateExercise,
  type ExerciseInput
} from '../../shared/persistence/data-store';
import {
  isNonEmptyString,
  isValidIntegerInRange,
  isValidLimitParam
} from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type ExerciseCreateBody = ExerciseInput;

type ExerciseUpdateBody = {
  id: string;
  updates: Partial<ExerciseCreateBody>;
};

type ExerciseUsageBody = {
  id: string;
};

export const handleExerciseRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/data/exercises') {
    const { uid } = await context.requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 500);
    const exercises = listExercises(context.db, uid, limit);
    return withCors(req, json({ exercises }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises') {
    const auth = await context.requireAuth(req, meta);
    const body = await getJsonBody<ExerciseCreateBody>(req);

    if (!isNonEmptyString(body.name) || !isNonEmptyString(body.category)) {
      return withCors(req, json({ error: 'invalid_name_or_category' }, { status: 400 }), context.env.allowedOrigins);
    }

    if (
      !isValidIntegerInRange(body.sets, 1, 20)
      || !isValidIntegerInRange(body.reps, 1, 100)
      || !isValidIntegerInRange(body.restTime, 0, 3600)
    ) {
      return withCors(req, json({ error: 'invalid_defaults' }, { status: 400 }), context.env.allowedOrigins);
    }

    const exercise = createExercise(context.db, auth.uid, {
      ...body,
      createdByName: auth.displayName ?? body.createdByName
    });

    return withCors(req, json({ exercise }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises/update') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<ExerciseUpdateBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_exercise_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    updateExercise(context.db, uid, body.id, body.updates ?? {});
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises/use') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<ExerciseUsageBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_exercise_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    incrementExerciseUsage(context.db, uid, body.id);
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  return null;
};
