import { getJsonBody, json, withCors } from '../../shared/http/http';
import { listWorkouts, upsertWorkout, type WorkoutInput } from '../../shared/persistence/data-store';
import { isNonEmptyString, isValidExerciseList, isValidLimitParam } from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type WorkoutUpsertBody = {
  workout: WorkoutInput;
};

export const handleWorkoutRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/data/workouts') {
    const { uid } = await context.requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 200);
    const workouts = listWorkouts(context.db, uid, limit);
    return withCors(req, json({ workouts }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/workouts') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<WorkoutUpsertBody>(req);

    if (
      !body.workout
      || !isNonEmptyString(body.workout.id)
      || !isNonEmptyString(body.workout.day)
      || !isNonEmptyString(body.workout.name)
    ) {
      return withCors(req, json({ error: 'invalid_workout' }, { status: 400 }), context.env.allowedOrigins);
    }

    if (!isValidExerciseList(body.workout.exercises)) {
      return withCors(req, json({ error: 'invalid_workout_exercises' }, { status: 400 }), context.env.allowedOrigins);
    }

    upsertWorkout(context.db, uid, body.workout);
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  return null;
};
