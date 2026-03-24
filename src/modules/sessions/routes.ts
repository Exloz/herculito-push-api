import { getJsonBody, json, withCors } from '../../shared/http/http';
import {
  completeSession,
  getCompetitiveLeaderboard,
  listExerciseLogsForDate,
  listSessions,
  startSession,
  updateSessionProgress,
  upsertExerciseLog,
  type WorkoutSessionInput
} from '../../shared/persistence/data-store';
import {
  isNonEmptyString,
  isValidDateKey,
  isValidLimitParam,
  isValidNumber,
  isValidRepsBySetUpdates,
  isValidSessionExercisesPayload,
  isValidSetsPayload,
  sanitizeCompletedAtMs,
  sanitizeSessionStartedAtMs
} from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type SessionStartBody = WorkoutSessionInput;

type SessionProgressBody = {
  sessionId: string;
  exercises: unknown[];
};

type SessionCompleteBody = {
  sessionId: string;
  exercises: unknown[];
  completedAt?: number;
  totalDuration?: number;
  repsBySetUpdates?: Record<string, number[]>; // exerciseId -> final repsBySet to persist to routine
};

type ExerciseLogBody = {
  exerciseId: string;
  date: string;
  sets: unknown[];
  userId?: string;
};

export const handleSessionRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/data/sessions') {
    const { uid } = await context.requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 500) ?? 500;
    const includeExercises = url.searchParams.get('includeExercises') === '1';
    const completedOnly = url.searchParams.get('completedOnly') === '1';
    const sessions = listSessions(context.db, uid, { limit, includeExercises, completedOnly });
    return withCors(req, json({ sessions }), context.env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/leaderboard') {
    const { uid } = await context.requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 50, 10) ?? 10;
    const leaderboard = getCompetitiveLeaderboard(context.db, uid, limit);
    return withCors(req, json(leaderboard), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/start') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<SessionStartBody>(req);

    if (!isNonEmptyString(body.routineName)) {
      return withCors(req, json({ error: 'invalid_routine_name' }, { status: 400 }), context.env.allowedOrigins);
    }

    const sanitizedStartedAt = sanitizeSessionStartedAtMs(body.startedAt);
    if (body.startedAt !== undefined && sanitizedStartedAt === undefined) {
      return withCors(req, json({ error: 'invalid_started_at' }, { status: 400 }), context.env.allowedOrigins);
    }

    try {
      const session = startSession(context.db, uid, {
        id: body.id,
        routineId: body.routineId,
        routineName: body.routineName,
        primaryMuscleGroup: body.primaryMuscleGroup,
        startedAt: sanitizedStartedAt
      });
      return withCors(req, json({ session }), context.env.allowedOrigins);
    } catch (error) {
      if (error instanceof Error && error.message === 'session_id_conflict') {
        return withCors(req, json({ error: 'session_id_conflict' }, { status: 409 }), context.env.allowedOrigins);
      }
      throw error;
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/progress') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<SessionProgressBody>(req);

    if (!isNonEmptyString(body.sessionId) || !isValidSessionExercisesPayload(body.exercises)) {
      return withCors(req, json({ error: 'invalid_session' }, { status: 400 }), context.env.allowedOrigins);
    }

    updateSessionProgress(context.db, uid, body.sessionId, body.exercises);
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/complete') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<SessionCompleteBody>(req);

    if (!isNonEmptyString(body.sessionId) || !isValidSessionExercisesPayload(body.exercises)) {
      return withCors(req, json({ error: 'invalid_session' }, { status: 400 }), context.env.allowedOrigins);
    }

    // Validate repsBySetUpdates if provided
    const repsBySetUpdates = body.repsBySetUpdates;
    if (repsBySetUpdates !== undefined && !isValidRepsBySetUpdates(repsBySetUpdates)) {
      return withCors(req, json({ error: 'invalid_reps_by_set_updates' }, { status: 400 }), context.env.allowedOrigins);
    }

    const completedAt = sanitizeCompletedAtMs(body.completedAt);
    const totalDurationMin = isValidNumber(body.totalDuration)
      ? Math.min(24 * 60, Math.max(1, Math.round(body.totalDuration)))
      : 1;
    completeSession(context.db, uid, body.sessionId, body.exercises, completedAt, totalDurationMin, repsBySetUpdates);
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercise-logs') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<ExerciseLogBody>(req);

    if (!isNonEmptyString(body.exerciseId) || !isValidDateKey(body.date) || !isValidSetsPayload(body.sets)) {
      return withCors(req, json({ error: 'invalid_exercise_log' }, { status: 400 }), context.env.allowedOrigins);
    }

    if (isNonEmptyString(body.userId) && body.userId !== uid) {
      return withCors(req, json({ error: 'invalid_user' }, { status: 403 }), context.env.allowedOrigins);
    }

    upsertExerciseLog(context.db, uid, {
      exerciseId: body.exerciseId,
      date: body.date,
      sets: body.sets
    });
    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/exercise-logs') {
    const { uid } = await context.requireAuth(req, meta);
    const date = url.searchParams.get('date') ?? '';
    if (!isValidDateKey(date)) {
      return withCors(req, json({ error: 'missing_date' }, { status: 400 }), context.env.allowedOrigins);
    }
    const logs = listExerciseLogsForDate(context.db, uid, date);
    return withCors(req, json({ logs }), context.env.allowedOrigins);
  }

  return null;
};
