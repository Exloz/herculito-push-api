import { Database } from 'bun:sqlite';

export type ExerciseVideoVariant = {
  url: string;
  kind: string;
};

export type ExerciseVideo = {
  provider: 'musclewiki';
  slug: string;
  url: string;
  pageUrl: string;
  variants?: ExerciseVideoVariant[];
};

export type ExerciseTemplate = {
  id: string;
  name: string;
  category: string;
  sets: number;
  reps: number;
  restTime: number;
  description?: string;
  video?: ExerciseVideo;
  createdBy: string;
  createdByName?: string;
  isPublic: boolean;
  createdAt: number;
  timesUsed: number;
};

export type ExerciseInput = {
  name: string;
  category: string;
  sets: number;
  reps: number;
  restTime: number;
  description?: string;
  isPublic?: boolean;
  createdByName?: string;
  muscleGroup?: string;
  video?: ExerciseVideo;
};

export type RoutineInput = {
  id?: string;
  name: string;
  description?: string;
  exercises: Array<{
    id: string;
    name: string;
    sets: number;
    reps: number;
    restTime?: number;
    video?: ExerciseVideo;
  }>;
  isPublic?: boolean;
  primaryMuscleGroup?: string;
  createdByName?: string;
};

export type RoutineOutput = {
  id: string;
  name: string;
  description?: string;
  exercises: RoutineInput['exercises'];
  createdBy: string;
  createdByName?: string;
  createdByAvatarUrl?: string;
  isPublic: boolean;
  timesUsed?: number;
  createdAt: number;
  updatedAt: number;
  primaryMuscleGroup?: string;
};

export type WorkoutSessionInput = {
  id?: string;
  routineId?: string;
  routineName: string;
  primaryMuscleGroup?: string;
  startedAt?: number;
  exercises?: unknown;
};

export type WorkoutSessionOutput = {
  id: string;
  routineId?: string;
  routineName: string;
  userId: string;
  primaryMuscleGroup?: string;
  startedAt: number;
  completedAt?: number;
  exercises: unknown[];
  totalDuration?: number;
};

export type LeaderboardEntryOutput = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  totalWorkouts: number;
  position: number;
};

export type LeaderboardPeriodOutput = {
  top: LeaderboardEntryOutput[];
  currentUser: LeaderboardEntryOutput | null;
};

export type CompetitiveLeaderboardOutput = {
  week: LeaderboardPeriodOutput;
  month: LeaderboardPeriodOutput;
};

export type AdminSummaryOutput = {
  totalUsers: number;
  totalRoutines: number;
  totalCompletedSessions: number;
  averageDurationMin: number;
};

export type AdminUserOverview = {
  userId: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  createdRoutines: number;
  completedSessions: number;
  lastActivityAt?: number;
};

export type AdminRoutineExerciseOverview = {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  restTime?: number;
};

export type AdminRoutineOverview = {
  routineId: string;
  name: string;
  createdBy: string;
  createdByName?: string;
  timesUsed: number;
  lastCompletedAt?: number;
  exercises: AdminRoutineExerciseOverview[];
};

export type AdminSessionOverview = {
  sessionId: string;
  userId: string;
  userName?: string;
  routineId?: string;
  routineName: string;
  startedAt: number;
  completedAt?: number;
  totalDuration?: number;
  exercises: unknown[];
};

export type AdminOverviewOutput = {
  summary: AdminSummaryOutput;
  users: AdminUserOverview[];
  routines: AdminRoutineOverview[];
  sessions: AdminSessionOverview[];
};

export type ExerciseLogInput = {
  exerciseId: string;
  date: string;
  sets: unknown[];
};

export type WorkoutInput = {
  id: string;
  day: string;
  name: string;
  exercises: Array<{
    id: string;
    name: string;
    sets: number;
    reps: number;
    restTime?: number;
    video?: ExerciseVideo;
  }>;
};

export type RoutineVisibilityInput = {
  routineId: string;
  visible: boolean;
};

const normalizeName = (value: string): string => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const safeJsonParse = <T>(value: string | null | undefined): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const toVideoJson = (video?: ExerciseVideo): string | null => {
  if (!video) return null;
  try {
    return JSON.stringify(video);
  } catch {
    return null;
  }
};

const makeCustomExerciseId = (): string => {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `custom:${id}`;
};

const ROUTINE_EXERCISE_QUERY_CHUNK_SIZE = 400;
const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;

const getStartOfWeekMs = (referenceDate = new Date()): number => {
  const startOfWeek = new Date(referenceDate);
  const dayOfWeek = startOfWeek.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek.getTime();
};

const getStartOfMonthMs = (referenceDate = new Date()): number => {
  const startOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth.getTime();
};

const listLeaderboardByPeriod = (
  db: Database,
  requesterUid: string,
  periodStartMs: number,
  limit: number
): LeaderboardPeriodOutput => {
  const rows = db.query<{
    uid: string;
    total_workouts: number;
    position: number;
    display_name: string | null;
    avatar_url: string | null;
  }, [number]>(`
    WITH aggregated AS (
      SELECT
        ws.uid AS uid,
        COUNT(1) AS total_workouts
      FROM workout_sessions ws
      WHERE ws.completed_at_ms IS NOT NULL AND ws.completed_at_ms >= ?
      GROUP BY ws.uid
    ),
    ranked AS (
      SELECT
        aggregated.uid,
        aggregated.total_workouts,
        ROW_NUMBER() OVER (
          ORDER BY aggregated.total_workouts DESC, aggregated.uid ASC
        ) AS position
      FROM aggregated
    )
    SELECT
      ranked.uid,
      ranked.total_workouts,
      ranked.position,
      COALESCE(
        NULLIF(TRIM(up.display_name), ''),
        (
        SELECT r.created_by_name
        FROM routines r
        WHERE
          r.owner_uid = ranked.uid
          AND r.created_by_name IS NOT NULL
          AND LENGTH(TRIM(r.created_by_name)) > 0
        ORDER BY r.updated_at_ms DESC
        LIMIT 1
        )
      ) AS display_name,
      up.avatar_url AS avatar_url
    FROM ranked
    LEFT JOIN user_profiles up ON up.uid = ranked.uid
    ORDER BY ranked.position ASC
  `).all(periodStartMs);

  const fullLeaderboard = rows.map((row) => ({
    userId: row.uid,
    name: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    totalWorkouts: Number.isFinite(row.total_workouts) ? row.total_workouts : 0,
    position: row.position
  }));

  return {
    top: fullLeaderboard.slice(0, limit),
    currentUser: fullLeaderboard.find((entry) => entry.userId === requesterUid) ?? null
  };
};

const resolveExerciseId = (input: ExerciseInput): string => {
  const slug = input.video?.slug?.trim();
  if (slug) return `mw:${slug}`;
  return makeCustomExerciseId();
};

export const listExercises = (db: Database, uid: string, limit?: number): ExerciseTemplate[] => {
  const rows = limit
    ? db.query<{
      id: string;
      name: string;
      category: string;
      description: string | null;
      default_sets: number;
      default_reps: number;
      default_rest_time_s: number;
      times_used: number;
      created_by_uid: string | null;
      created_by_name: string | null;
      is_public: number;
      video_json: string | null;
      created_at_ms: number;
      user_sets: number | null;
      user_reps: number | null;
      user_rest: number | null;
      user_display_name: string | null;
    }, [string, string, number]>(`
      SELECT
        e.id,
        e.name,
        e.category,
        e.description,
        e.default_sets,
        e.default_reps,
        e.default_rest_time_s,
        e.times_used,
        e.created_by_uid,
        e.created_by_name,
        e.is_public,
        e.video_json,
        e.created_at_ms,
        u.default_sets as user_sets,
        u.default_reps as user_reps,
        u.default_rest_time_s as user_rest,
        u.display_name as user_display_name
      FROM exercises e
      LEFT JOIN user_exercise_defaults u
        ON u.exercise_id = e.id AND u.uid = ?
      WHERE e.is_public = 1 OR e.created_by_uid = ?
      ORDER BY e.times_used DESC, e.created_at_ms DESC
      LIMIT ?
    `).all(uid, uid, limit)
    : db.query<{
      id: string;
      name: string;
      category: string;
      description: string | null;
      default_sets: number;
      default_reps: number;
      default_rest_time_s: number;
      times_used: number;
      created_by_uid: string | null;
      created_by_name: string | null;
      is_public: number;
      video_json: string | null;
      created_at_ms: number;
      user_sets: number | null;
      user_reps: number | null;
      user_rest: number | null;
      user_display_name: string | null;
    }, [string, string]>(`
      SELECT
        e.id,
        e.name,
        e.category,
        e.description,
        e.default_sets,
        e.default_reps,
        e.default_rest_time_s,
        e.times_used,
        e.created_by_uid,
        e.created_by_name,
        e.is_public,
        e.video_json,
        e.created_at_ms,
        u.default_sets as user_sets,
        u.default_reps as user_reps,
        u.default_rest_time_s as user_rest,
        u.display_name as user_display_name
      FROM exercises e
      LEFT JOIN user_exercise_defaults u
        ON u.exercise_id = e.id AND u.uid = ?
      WHERE e.is_public = 1 OR e.created_by_uid = ?
      ORDER BY e.times_used DESC, e.created_at_ms DESC
    `).all(uid, uid);

  return rows.map((row) => {
    const video = safeJsonParse<ExerciseVideo>(row.video_json);
    return {
      id: row.id,
      name: row.user_display_name ?? row.name,
      category: row.category,
      sets: row.user_sets ?? row.default_sets,
      reps: row.user_reps ?? row.default_reps,
      restTime: row.user_rest ?? row.default_rest_time_s,
      description: row.description ?? undefined,
      video,
      createdBy: row.created_by_uid ?? 'system',
      createdByName: row.created_by_name ?? undefined,
      isPublic: row.is_public === 1,
      createdAt: row.created_at_ms,
      timesUsed: row.times_used
    };
  });
};

export const createExercise = (db: Database, uid: string, input: ExerciseInput): ExerciseTemplate => {
  const run = db.transaction(() => {
    const now = Date.now();
    const normalizedName = normalizeName(input.name);
    let exerciseId = input.video?.slug ? `mw:${input.video.slug}` : '';

    if (!exerciseId) {
      const existingByName = db.query<{ id: string }, [string, string, string]>(`
        SELECT id
        FROM exercises
        WHERE normalized_name = ?
          AND category = ?
          AND (is_public = 1 OR created_by_uid = ?)
        LIMIT 1
      `).get(normalizedName, input.category, uid);
      if (existingByName?.id) {
        exerciseId = existingByName.id;
      }
    }

    if (!exerciseId) {
      exerciseId = resolveExerciseId(input);
    }

    const existing = db.query<{ id: string; video_json: string | null }, [string]>(`
      SELECT id, video_json FROM exercises WHERE id = ? LIMIT 1
    `).get(exerciseId);

    const videoJson = toVideoJson(input.video);
    const isPublic = input.isPublic !== false;

    if (!existing) {
      db.query(`
        INSERT INTO exercises (
          id,
          name,
          normalized_name,
          category,
          description,
          default_sets,
          default_reps,
          default_rest_time_s,
          times_used,
          created_by_uid,
          created_by_name,
          is_public,
          muscle_group,
          video_json,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        exerciseId,
        input.name,
        normalizedName,
        input.category,
        input.description ?? null,
        input.sets,
        input.reps,
        input.restTime,
        uid,
        input.createdByName ?? null,
        isPublic ? 1 : 0,
        input.muscleGroup ?? null,
        videoJson,
        now,
        now
      );
    } else if (videoJson) {
      const existingVideo = safeJsonParse<ExerciseVideo>(existing.video_json);
      const shouldUpdateVideo = !existingVideo || ((input.video?.variants?.length ?? 0) > (existingVideo.variants?.length ?? 0));
      if (shouldUpdateVideo) {
        db.query(`
          UPDATE exercises
          SET video_json = ?, updated_at_ms = ?
          WHERE id = ?
        `).run(videoJson, now, exerciseId);
      }
    }

    db.query(`
      INSERT INTO user_exercise_defaults (
        uid,
        exercise_id,
        display_name,
        default_sets,
        default_reps,
        default_rest_time_s,
        notes,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(uid, exercise_id) DO UPDATE SET
        display_name = excluded.display_name,
        default_sets = excluded.default_sets,
        default_reps = excluded.default_reps,
        default_rest_time_s = excluded.default_rest_time_s,
        updated_at_ms = excluded.updated_at_ms
    `).run(
      uid,
      exerciseId,
      null,
      input.sets,
      input.reps,
      input.restTime,
      now,
      now
    );

    const row = db.query<{
      id: string;
      name: string;
      category: string;
      description: string | null;
      default_sets: number;
      default_reps: number;
      default_rest_time_s: number;
      times_used: number;
      created_by_uid: string | null;
      created_by_name: string | null;
      is_public: number;
      video_json: string | null;
      created_at_ms: number;
    }, [string]>(`
      SELECT id, name, category, description, default_sets, default_reps, default_rest_time_s, times_used, created_by_uid, created_by_name, is_public, video_json, created_at_ms
      FROM exercises WHERE id = ? LIMIT 1
    `).get(exerciseId);

    const video = safeJsonParse<ExerciseVideo>(row?.video_json ?? null);

    return {
      id: exerciseId,
      name: row?.name ?? input.name,
      category: row?.category ?? input.category,
      sets: input.sets,
      reps: input.reps,
      restTime: input.restTime,
      description: row?.description ?? input.description,
      video,
      createdBy: row?.created_by_uid ?? uid,
      createdByName: row?.created_by_name ?? input.createdByName,
      isPublic: row ? row.is_public === 1 : isPublic,
      createdAt: row?.created_at_ms ?? now,
      timesUsed: row?.times_used ?? 0
    };
  });

  return run();
};

export const updateExercise = (db: Database, uid: string, exerciseId: string, updates: Partial<ExerciseInput>): void => {
  const now = Date.now();
  const updatesRecord = updates as Record<string, unknown>;

  const ownerRow = db.query<{ created_by_uid: string | null }, [string]>(`
    SELECT created_by_uid FROM exercises WHERE id = ? LIMIT 1
  `).get(exerciseId);
  const isOwner = ownerRow?.created_by_uid === uid;
  const isMusclewiki = exerciseId.startsWith('mw:');

  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.name && isOwner) {
    fields.push('name = ?');
    values.push(updates.name);
    fields.push('normalized_name = ?');
    values.push(normalizeName(updates.name));
  }

  if (updates.category && isOwner) {
    fields.push('category = ?');
    values.push(updates.category);
  }

  if (isOwner && updatesRecord.description !== undefined) {
    if (typeof updatesRecord.description === 'string') {
      fields.push('description = ?');
      values.push(updatesRecord.description);
    } else if (updatesRecord.description === null) {
      fields.push('description = ?');
      values.push(null);
    }
  }

  if (typeof updates.isPublic === 'boolean' && isOwner) {
    fields.push('is_public = ?');
    values.push(updates.isPublic ? 1 : 0);
  }

  if (updates.video) {
    const canUpdateVideo = isOwner || (isMusclewiki && updates.video.slug && exerciseId === `mw:${updates.video.slug}`);
    if (canUpdateVideo) {
      fields.push('video_json = ?');
      values.push(toVideoJson(updates.video));
    }
  }

  if (isOwner && updatesRecord.muscleGroup !== undefined) {
    if (typeof updatesRecord.muscleGroup === 'string' && updatesRecord.muscleGroup.trim().length > 0) {
      fields.push('muscle_group = ?');
      values.push(updatesRecord.muscleGroup);
    } else if (updatesRecord.muscleGroup === null) {
      fields.push('muscle_group = ?');
      values.push(null);
    }
  }

  if (fields.length > 0) {
    fields.push('updated_at_ms = ?');
    values.push(now);
    values.push(exerciseId);
    db.query(`UPDATE exercises SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  if (updates.sets !== undefined || updates.reps !== undefined || updates.restTime !== undefined) {
    db.query(`
      INSERT INTO user_exercise_defaults (
        uid,
        exercise_id,
        display_name,
        default_sets,
        default_reps,
        default_rest_time_s,
        notes,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(uid, exercise_id) DO UPDATE SET
        default_sets = COALESCE(excluded.default_sets, user_exercise_defaults.default_sets),
        default_reps = COALESCE(excluded.default_reps, user_exercise_defaults.default_reps),
        default_rest_time_s = COALESCE(excluded.default_rest_time_s, user_exercise_defaults.default_rest_time_s),
        updated_at_ms = excluded.updated_at_ms
    `).run(
      uid,
      exerciseId,
      updates.sets ?? null,
      updates.reps ?? null,
      updates.restTime ?? null,
      now,
      now
    );
  }
};

export const incrementExerciseUsage = (db: Database, uid: string, exerciseId: string): void => {
  db.query(`
    UPDATE exercises
    SET times_used = times_used + 1
    WHERE id = ?
      AND (created_by_uid = ? OR is_public = 1)
  `).run(exerciseId, uid);
};

export const listRoutines = (db: Database, uid: string, options?: { limit?: number; includeVideos?: boolean }): RoutineOutput[] => {
  const limit = options?.limit;
  const includeVideos = options?.includeVideos === true;
  const routines = limit
    ? db.query<{
      id: string;
      owner_uid: string;
      name: string;
      description: string | null;
      is_public: number;
      primary_muscle_group: string | null;
      times_used: number;
      created_by_name: string | null;
      created_by_avatar_url: string | null;
      created_at_ms: number;
      updated_at_ms: number;
    }, [string, string, number]>(`
      SELECT
        r.id,
        r.owner_uid,
        r.name,
        r.description,
        r.is_public,
        r.primary_muscle_group,
        r.times_used,
        COALESCE(NULLIF(TRIM(up.display_name), ''), r.created_by_name) AS created_by_name,
        up.avatar_url AS created_by_avatar_url,
        r.created_at_ms,
        r.updated_at_ms
      FROM routines r
      LEFT JOIN user_profiles up ON up.uid = r.owner_uid
      WHERE
        r.owner_uid = ?
        OR (
          r.is_public = 1
          AND r.owner_uid <> ?
          AND r.owner_uid <> 'system'
          AND (
            COALESCE(NULLIF(TRIM(up.display_name), ''), r.created_by_name) IS NULL
            OR LOWER(TRIM(REPLACE(COALESCE(NULLIF(TRIM(up.display_name), ''), r.created_by_name), CHAR(160), ' '))) NOT IN ('sistema', 'usuario')
          )
        )
      ORDER BY r.created_at_ms DESC
      LIMIT ?
    `).all(uid, uid, limit)
    : db.query<{
      id: string;
      owner_uid: string;
      name: string;
      description: string | null;
      is_public: number;
      primary_muscle_group: string | null;
      times_used: number;
      created_by_name: string | null;
      created_by_avatar_url: string | null;
      created_at_ms: number;
      updated_at_ms: number;
  }, [string, string]>(`
    SELECT
      r.id,
      r.owner_uid,
      r.name,
      r.description,
      r.is_public,
      r.primary_muscle_group,
      r.times_used,
      COALESCE(NULLIF(TRIM(up.display_name), ''), r.created_by_name) AS created_by_name,
      up.avatar_url AS created_by_avatar_url,
      r.created_at_ms,
      r.updated_at_ms
    FROM routines r
    LEFT JOIN user_profiles up ON up.uid = r.owner_uid
    WHERE
      r.owner_uid = ?
      OR (
        r.is_public = 1
        AND r.owner_uid <> ?
        AND r.owner_uid <> 'system'
        AND (
          COALESCE(NULLIF(TRIM(up.display_name), ''), r.created_by_name) IS NULL
          OR LOWER(TRIM(REPLACE(COALESCE(NULLIF(TRIM(up.display_name), ''), r.created_by_name), CHAR(160), ' '))) NOT IN ('sistema', 'usuario')
        )
      )
    ORDER BY r.created_at_ms DESC
  `).all(uid, uid);

  if (routines.length === 0) {
    return [];
  }

  const routineIds = routines.map((routine) => routine.id);
  const exercises: Array<{
    routine_id: string;
    exercise_id: string;
    display_name: string | null;
    sets: number;
    reps: number;
    rest_time_s: number | null;
    name: string | null;
    video_json?: string | null;
  }> = [];

  for (let index = 0; index < routineIds.length; index += ROUTINE_EXERCISE_QUERY_CHUNK_SIZE) {
    const batchIds = routineIds.slice(index, index + ROUTINE_EXERCISE_QUERY_CHUNK_SIZE);
    if (batchIds.length === 0) continue;
    const placeholders = batchIds.map(() => '?').join(', ');
    const batch = db.query<{
      routine_id: string;
      exercise_id: string;
      display_name: string | null;
      sets: number;
      reps: number;
      rest_time_s: number | null;
      name: string | null;
      video_json?: string | null;
    }, string[]>(`
      SELECT re.routine_id, re.exercise_id, re.display_name, re.sets, re.reps, re.rest_time_s, e.name${includeVideos ? ', e.video_json' : ''}
      FROM routine_exercises re
      LEFT JOIN exercises e ON e.id = re.exercise_id
      WHERE re.routine_id IN (${placeholders})
      ORDER BY re.routine_id ASC, re.position ASC
    `).all(...batchIds);
    exercises.push(...batch);
  }

  const exercisesByRoutine = new Map<string, RoutineInput['exercises']>();
  exercises.forEach((exercise) => {
    const list = exercisesByRoutine.get(exercise.routine_id) ?? [];
    const name = exercise.display_name ?? exercise.name ?? exercise.exercise_id;
    list.push({
      id: exercise.exercise_id,
      name,
      sets: exercise.sets,
      reps: exercise.reps,
      restTime: exercise.rest_time_s ?? undefined,
      video: includeVideos ? safeJsonParse<ExerciseVideo>(exercise.video_json ?? null) : undefined
    });
    exercisesByRoutine.set(exercise.routine_id, list);
  });

  return routines.map((routine) => ({
    id: routine.id,
    name: routine.name,
    description: routine.description ?? undefined,
    exercises: exercisesByRoutine.get(routine.id) ?? [],
    createdBy: routine.owner_uid,
    createdByName: routine.created_by_name ?? undefined,
    createdByAvatarUrl: routine.created_by_avatar_url ?? undefined,
    isPublic: routine.is_public === 1,
    timesUsed: routine.times_used,
    createdAt: routine.created_at_ms,
    updatedAt: routine.updated_at_ms,
    primaryMuscleGroup: routine.primary_muscle_group ?? undefined
  }));
};

export const createRoutine = (db: Database, uid: string, input: RoutineInput): RoutineOutput => {
  const run = db.transaction(() => {
    const now = Date.now();
    const routineId = input.id ?? (globalThis.crypto?.randomUUID?.() ?? `${now}_${Math.random().toString(16).slice(2)}`);
    const isPublic = input.isPublic === true;

    if (input.id) {
      const existing = db.query<{ id: string }, [string]>(`
        SELECT id FROM routines WHERE id = ? LIMIT 1
      `).get(routineId);
      if (existing) {
        throw new Error('routine_id_conflict');
      }
    }

    db.query(`
      INSERT INTO routines (
        id,
        owner_uid,
        name,
        description,
        is_public,
        primary_muscle_group,
        times_used,
        created_by_name,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      routineId,
      uid,
      input.name,
      input.description ?? null,
      isPublic ? 1 : 0,
      input.primaryMuscleGroup ?? null,
      input.createdByName ?? null,
      now,
      now
    );

    const insertExercise = db.query(`
      INSERT INTO routine_exercises (
        id,
        routine_id,
        exercise_id,
        position,
        display_name,
        sets,
        reps,
        rest_time_s,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    input.exercises.forEach((exercise, index) => {
      const routineExerciseId = globalThis.crypto?.randomUUID?.() ?? `${routineId}_${index}_${Math.random().toString(16).slice(2)}`;
      insertExercise.run(
        routineExerciseId,
        routineId,
        exercise.id,
        index,
        exercise.name,
        exercise.sets,
        exercise.reps,
        exercise.restTime ?? null,
        now,
        now
      );
    });

    return {
      id: routineId,
      name: input.name,
      description: input.description,
      exercises: input.exercises,
      createdBy: uid,
      createdByName: input.createdByName,
      isPublic,
      timesUsed: 0,
      createdAt: now,
      updatedAt: now,
      primaryMuscleGroup: input.primaryMuscleGroup
    };
  });

  return run();
};

export const updateRoutine = (db: Database, uid: string, routineId: string, updates: Partial<RoutineInput>): void => {
  const now = Date.now();
  const updatesRecord = updates as Record<string, unknown>;
  const owner = db.query<{ owner_uid: string }, [string, string]>(`
    SELECT owner_uid FROM routines WHERE id = ? AND owner_uid = ? LIMIT 1
  `).get(routineId, uid);

  if (!owner) {
    return;
  }

  const run = db.transaction(() => {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updatesRecord.description !== undefined) {
      if (typeof updatesRecord.description === 'string') {
        fields.push('description = ?');
        values.push(updatesRecord.description);
      } else if (updatesRecord.description === null) {
        fields.push('description = ?');
        values.push(null);
      }
    }

    if (typeof updates.isPublic === 'boolean') {
      fields.push('is_public = ?');
      values.push(updates.isPublic ? 1 : 0);
    }

    if (updatesRecord.primaryMuscleGroup !== undefined) {
      if (typeof updatesRecord.primaryMuscleGroup === 'string' && updatesRecord.primaryMuscleGroup.trim().length > 0) {
        fields.push('primary_muscle_group = ?');
        values.push(updatesRecord.primaryMuscleGroup);
      } else if (updatesRecord.primaryMuscleGroup === null) {
        fields.push('primary_muscle_group = ?');
        values.push(null);
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at_ms = ?');
      values.push(now);
      values.push(routineId);
      db.query(`UPDATE routines SET ${fields.join(', ')} WHERE id = ? AND owner_uid = ?`).run(...values, uid);
    }

    if (updates.exercises) {
      db.query(`DELETE FROM routine_exercises WHERE routine_id = ?`).run(routineId);
      const insertExercise = db.query(`
        INSERT INTO routine_exercises (
          id,
          routine_id,
          exercise_id,
          position,
          display_name,
          sets,
          reps,
          rest_time_s,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      updates.exercises.forEach((exercise, index) => {
        const routineExerciseId = globalThis.crypto?.randomUUID?.() ?? `${routineId}_${index}_${Math.random().toString(16).slice(2)}`;
        insertExercise.run(
          routineExerciseId,
          routineId,
          exercise.id,
          index,
          exercise.name,
          exercise.sets,
          exercise.reps,
          exercise.restTime ?? null,
          now,
          now
        );
      });
    }
  });

  run();
};

export const deleteRoutine = (db: Database, uid: string, routineId: string): void => {
  db.query(`DELETE FROM routine_exercises WHERE routine_id = ? AND routine_id IN (SELECT id FROM routines WHERE id = ? AND owner_uid = ?)`)
    .run(routineId, routineId, uid);
  db.query(`DELETE FROM routines WHERE id = ? AND owner_uid = ?`).run(routineId, uid);
};

export const incrementRoutineUsage = (db: Database, uid: string, routineId: string): void => {
  db.query(`
    UPDATE routines
    SET times_used = times_used + 1
    WHERE id = ?
      AND (owner_uid = ? OR is_public = 1)
  `).run(routineId, uid);
};

export const listHiddenPublicRoutineIds = (db: Database, uid: string): string[] => {
  const rows = db.query<{ routine_id: string }, [string, string]>(`
    SELECT u.routine_id
    FROM user_hidden_public_routines u
    INNER JOIN routines r ON r.id = u.routine_id
    WHERE
      u.uid = ?
      AND r.is_public = 1
      AND r.owner_uid <> ?
      AND r.owner_uid <> 'system'
      AND (
        r.created_by_name IS NULL
        OR LOWER(TRIM(REPLACE(r.created_by_name, CHAR(160), ' '))) NOT IN ('sistema', 'usuario')
      )
    ORDER BY u.updated_at_ms DESC
  `).all(uid, uid);

  return rows.map((row) => row.routine_id);
};

export const setRoutineVisibility = (db: Database, uid: string, input: RoutineVisibilityInput): boolean => {
  if (input.visible) {
    db.query(`DELETE FROM user_hidden_public_routines WHERE uid = ? AND routine_id = ?`).run(uid, input.routineId);
    return true;
  }

  const routine = db.query<{ id: string }, [string, string]>(`
    SELECT r.id
    FROM routines r
    WHERE
      r.id = ?
      AND r.is_public = 1
      AND r.owner_uid <> ?
      AND r.owner_uid <> 'system'
      AND (
        r.created_by_name IS NULL
        OR LOWER(TRIM(REPLACE(r.created_by_name, CHAR(160), ' '))) NOT IN ('sistema', 'usuario')
      )
    LIMIT 1
  `).get(input.routineId, uid);

  if (!routine) {
    return false;
  }

  const now = Date.now();
  db.query(`
    INSERT INTO user_hidden_public_routines (uid, routine_id, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(uid, routine_id) DO UPDATE SET
      updated_at_ms = excluded.updated_at_ms
  `).run(uid, input.routineId, now, now);

  return true;
};

export const listSessions = (
  db: Database,
  uid: string,
  options?: { limit?: number; includeExercises?: boolean; completedOnly?: boolean }
): WorkoutSessionOutput[] => {
  const limit = options?.limit ?? 500;
  const includeExercises = options?.includeExercises === true;
  const completedOnly = options?.completedOnly === true;

  const rows = db.query<{
    id: string;
    routine_id: string | null;
    routine_name_snapshot: string;
    primary_muscle_group: string | null;
    started_at_ms: number;
    completed_at_ms: number | null;
    total_duration_min: number | null;
    exercises_json?: string | null;
  }, [string, number]>(`
    SELECT id, routine_id, routine_name_snapshot, primary_muscle_group, started_at_ms, completed_at_ms, total_duration_min${includeExercises ? ', exercises_json' : ''}
    FROM workout_sessions
    WHERE uid = ?
      ${completedOnly ? 'AND completed_at_ms IS NOT NULL' : ''}
    ORDER BY started_at_ms DESC
    LIMIT ?
  `).all(uid, limit);

  return rows.map((row) => {
    return {
      id: row.id,
      routineId: row.routine_id ?? undefined,
      routineName: row.routine_name_snapshot,
      userId: uid,
      primaryMuscleGroup: row.primary_muscle_group ?? undefined,
      startedAt: row.started_at_ms,
      completedAt: row.completed_at_ms ?? undefined,
      totalDuration: row.total_duration_min ?? undefined,
      exercises: includeExercises ? (safeJsonParse<unknown[]>(row.exercises_json ?? null) ?? []) : []
    };
  });
};

export const getCompetitiveLeaderboard = (
  db: Database,
  requesterUid: string,
  limit = 10
): CompetitiveLeaderboardOutput => {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const now = new Date();
  const weekStartMs = getStartOfWeekMs(now);
  const monthStartMs = getStartOfMonthMs(now);

  return {
    week: listLeaderboardByPeriod(db, requesterUid, weekStartMs, safeLimit),
    month: listLeaderboardByPeriod(db, requesterUid, monthStartMs, safeLimit)
  };
};

export const getAdminOverview = (db: Database): AdminOverviewOutput => {
  const summaryRow = db.query<{
    total_users: number;
    total_routines: number;
    total_completed_sessions: number;
    average_duration_min: number | null;
  }, []>(`
    SELECT
      (
        SELECT COUNT(1)
        FROM (
          SELECT uid FROM user_profiles WHERE uid <> 'system'
          UNION
          SELECT owner_uid AS uid FROM routines WHERE owner_uid <> 'system'
          UNION
          SELECT uid FROM workout_sessions WHERE uid <> 'system'
        )
      ) AS total_users,
      (SELECT COUNT(1) FROM routines) AS total_routines,
      (SELECT COUNT(1) FROM workout_sessions WHERE completed_at_ms IS NOT NULL) AS total_completed_sessions,
      (SELECT AVG(total_duration_min) FROM workout_sessions WHERE completed_at_ms IS NOT NULL AND total_duration_min IS NOT NULL) AS average_duration_min
  `).get();

  const users = db.query<{
    user_id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    created_routines: number;
    completed_sessions: number;
    last_activity_at: number | null;
  }, []>(`
    WITH user_ids AS (
      SELECT uid AS user_id FROM user_profiles WHERE uid <> 'system'
      UNION
      SELECT owner_uid AS user_id FROM routines WHERE owner_uid <> 'system'
      UNION
      SELECT uid AS user_id FROM workout_sessions WHERE uid <> 'system'
    ),
    routine_stats AS (
      SELECT owner_uid AS user_id, COUNT(1) AS created_routines
      FROM routines
      WHERE owner_uid <> 'system'
      GROUP BY owner_uid
    ),
    session_stats AS (
      SELECT
        uid AS user_id,
        COUNT(CASE WHEN completed_at_ms IS NOT NULL THEN 1 END) AS completed_sessions,
        MAX(COALESCE(completed_at_ms, started_at_ms)) AS last_activity_at
      FROM workout_sessions
      WHERE uid <> 'system'
      GROUP BY uid
    )
    SELECT
      u.user_id,
      COALESCE(
        NULLIF(TRIM(up.display_name), ''),
        (
          SELECT r.created_by_name
          FROM routines r
          WHERE r.owner_uid = u.user_id
            AND r.created_by_name IS NOT NULL
            AND LENGTH(TRIM(r.created_by_name)) > 0
          ORDER BY r.updated_at_ms DESC
          LIMIT 1
        )
      ) AS display_name,
      up.email,
      up.avatar_url,
      COALESCE(rs.created_routines, 0) AS created_routines,
      COALESCE(ss.completed_sessions, 0) AS completed_sessions,
      ss.last_activity_at
    FROM user_ids u
    LEFT JOIN user_profiles up ON up.uid = u.user_id
    LEFT JOIN routine_stats rs ON rs.user_id = u.user_id
    LEFT JOIN session_stats ss ON ss.user_id = u.user_id
    ORDER BY
      COALESCE(ss.last_activity_at, 0) DESC,
      COALESCE(up.display_name, up.email, u.user_id) ASC
  `).all();

  const routines = db.query<{
    routine_id: string;
    name: string;
    created_by: string;
    created_by_name: string | null;
    times_used: number;
    last_completed_at: number | null;
  }, []>(`
    SELECT
      r.id AS routine_id,
      r.name,
      r.owner_uid AS created_by,
      COALESCE(NULLIF(TRIM(up.display_name), ''), r.created_by_name) AS created_by_name,
      r.times_used,
      MAX(ws.completed_at_ms) AS last_completed_at
    FROM routines r
    LEFT JOIN user_profiles up ON up.uid = r.owner_uid
    LEFT JOIN workout_sessions ws ON ws.routine_id = r.id AND ws.completed_at_ms IS NOT NULL
    GROUP BY r.id
    ORDER BY r.created_at_ms DESC
  `).all();

  const routineExercises = db.query<{
    routine_id: string;
    exercise_id: string;
    display_name: string | null;
    sets: number;
    reps: number;
    rest_time_s: number | null;
    exercise_name: string | null;
  }, []>(`
    SELECT
      re.routine_id,
      re.exercise_id,
      re.display_name,
      re.sets,
      re.reps,
      re.rest_time_s,
      e.name AS exercise_name
    FROM routine_exercises re
    LEFT JOIN exercises e ON e.id = re.exercise_id
    ORDER BY re.routine_id ASC, re.position ASC
  `).all();

  const exercisesByRoutine = new Map<string, AdminRoutineExerciseOverview[]>();
  routineExercises.forEach((exercise) => {
    const items = exercisesByRoutine.get(exercise.routine_id) ?? [];
    items.push({
      exerciseId: exercise.exercise_id,
      name: exercise.display_name ?? exercise.exercise_name ?? exercise.exercise_id,
      sets: exercise.sets,
      reps: exercise.reps,
      restTime: exercise.rest_time_s ?? undefined
    });
    exercisesByRoutine.set(exercise.routine_id, items);
  });

  const sessions = db.query<{
    session_id: string;
    user_id: string;
    user_name: string | null;
    routine_id: string | null;
    routine_name: string;
    started_at: number;
    completed_at: number | null;
    total_duration: number | null;
    exercises_json: string | null;
  }, []>(`
    SELECT
      ws.id AS session_id,
      ws.uid AS user_id,
      COALESCE(NULLIF(TRIM(up.display_name), ''), up.email, ws.uid) AS user_name,
      ws.routine_id,
      ws.routine_name_snapshot AS routine_name,
      ws.started_at_ms AS started_at,
      ws.completed_at_ms AS completed_at,
      ws.total_duration_min AS total_duration,
      ws.exercises_json
    FROM workout_sessions ws
    LEFT JOIN user_profiles up ON up.uid = ws.uid
    WHERE ws.completed_at_ms IS NOT NULL
    ORDER BY ws.completed_at_ms DESC
    LIMIT 500
  `).all();

  return {
    summary: {
      totalUsers: summaryRow?.total_users ?? 0,
      totalRoutines: summaryRow?.total_routines ?? 0,
      totalCompletedSessions: summaryRow?.total_completed_sessions ?? 0,
      averageDurationMin: Math.round(summaryRow?.average_duration_min ?? 0)
    },
    users: users.map((user) => ({
      userId: user.user_id,
      name: user.display_name ?? undefined,
      email: user.email ?? undefined,
      avatarUrl: user.avatar_url ?? undefined,
      createdRoutines: user.created_routines,
      completedSessions: user.completed_sessions,
      lastActivityAt: user.last_activity_at ?? undefined
    })),
    routines: routines.map((routine) => ({
      routineId: routine.routine_id,
      name: routine.name,
      createdBy: routine.created_by,
      createdByName: routine.created_by_name ?? undefined,
      timesUsed: routine.times_used,
      lastCompletedAt: routine.last_completed_at ?? undefined,
      exercises: exercisesByRoutine.get(routine.routine_id) ?? []
    })),
    sessions: sessions.map((session) => ({
      sessionId: session.session_id,
      userId: session.user_id,
      userName: session.user_name ?? undefined,
      routineId: session.routine_id ?? undefined,
      routineName: session.routine_name,
      startedAt: session.started_at,
      completedAt: session.completed_at ?? undefined,
      totalDuration: session.total_duration ?? undefined,
      exercises: safeJsonParse<unknown[]>(session.exercises_json) ?? []
    }))
  };
};

export const startSession = (db: Database, uid: string, input: WorkoutSessionInput): WorkoutSessionOutput => {
  const now = Date.now();
  const fallbackSessionId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const requestedSessionId = input.id?.trim();
  const sessionId = requestedSessionId && requestedSessionId.length > 0 ? requestedSessionId : fallbackSessionId();

  if (requestedSessionId) {
    const owner = db.query<{ uid: string }, [string]>(`
      SELECT uid FROM workout_sessions WHERE id = ? LIMIT 1
    `).get(requestedSessionId);

    if (owner && owner.uid !== uid) {
      throw new Error('session_id_conflict');
    }
  }

  const startedAt = input.startedAt ?? now;
  const exercisesJson = input.exercises ? JSON.stringify(input.exercises) : JSON.stringify([]);

  db.query(`
    INSERT INTO workout_sessions (
      id,
      uid,
      routine_id,
      routine_name_snapshot,
      primary_muscle_group,
      started_at_ms,
      completed_at_ms,
      total_duration_min,
      exercises_json,
      notes,
      last_updated_ms,
      created_at_ms,
      updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      routine_id = excluded.routine_id,
      routine_name_snapshot = excluded.routine_name_snapshot,
      primary_muscle_group = excluded.primary_muscle_group,
      started_at_ms = excluded.started_at_ms,
      exercises_json = excluded.exercises_json,
      last_updated_ms = excluded.last_updated_ms,
      updated_at_ms = excluded.updated_at_ms
  `).run(
    sessionId,
    uid,
    input.routineId ?? null,
    input.routineName,
    input.primaryMuscleGroup ?? null,
    startedAt,
    exercisesJson,
    now,
    now,
    now
  );

  return {
    id: sessionId,
    routineId: input.routineId,
    routineName: input.routineName,
    userId: uid,
    primaryMuscleGroup: input.primaryMuscleGroup,
    startedAt,
    exercises: safeJsonParse<unknown[]>(exercisesJson) ?? []
  };
};

export const updateSessionProgress = (db: Database, uid: string, sessionId: string, exercises: unknown[]): void => {
  const now = Date.now();
  db.query(`
    UPDATE workout_sessions
    SET exercises_json = ?, last_updated_ms = ?, updated_at_ms = ?
    WHERE id = ? AND uid = ?
  `).run(JSON.stringify(exercises ?? []), now, now, sessionId, uid);
};

export const completeSession = (db: Database, uid: string, sessionId: string, exercises: unknown[], completedAtMs: number, totalDurationMin: number): void => {
  const now = Date.now();
  const session = db.query<{ started_at_ms: number }, [string, string]>(`
    SELECT started_at_ms
    FROM workout_sessions
    WHERE id = ? AND uid = ?
    LIMIT 1
  `).get(sessionId, uid);

  if (!session) {
    return;
  }

  const maxCompletedAtMs = now + SESSION_CLOCK_SKEW_MS;
  const safeCompletedAtMs = Math.max(session.started_at_ms, Math.min(completedAtMs, maxCompletedAtMs));
  const inferredDurationMin = Math.max(1, Math.round((safeCompletedAtMs - session.started_at_ms) / 60000));
  const safeDurationMin = Number.isFinite(totalDurationMin) && totalDurationMin >= 1 && totalDurationMin <= 24 * 60
    ? Math.round(totalDurationMin)
    : inferredDurationMin;

  db.query(`
    UPDATE workout_sessions
    SET exercises_json = ?, completed_at_ms = ?, total_duration_min = ?, updated_at_ms = ?
    WHERE id = ? AND uid = ?
  `).run(JSON.stringify(exercises ?? []), safeCompletedAtMs, safeDurationMin, now, sessionId, uid);
};

export const upsertExerciseLog = (db: Database, uid: string, input: ExerciseLogInput): void => {
  const now = Date.now();
  const id = `${input.exerciseId}_${uid}_${input.date}`;
  db.query(`
    INSERT INTO exercise_logs (
      id,
      uid,
      exercise_id,
      date,
      payload_json,
      created_at_ms,
      updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at_ms = excluded.updated_at_ms
  `).run(
    id,
    uid,
    input.exerciseId,
    input.date,
    JSON.stringify({
      exerciseId: input.exerciseId,
      userId: uid,
      date: input.date,
      sets: input.sets ?? []
    }),
    now,
    now
  );
};

export const listExerciseLogsForDate = (db: Database, uid: string, date: string): unknown[] => {
  const rows = db.query<{ payload_json: string }, [string, string]>(`
    SELECT payload_json
    FROM exercise_logs
    WHERE uid = ? AND date = ?
    ORDER BY updated_at_ms DESC
  `).all(uid, date);

  return rows
    .map((row) => safeJsonParse<unknown>(row.payload_json))
    .filter((value): value is unknown => value !== undefined);
};

export const listWorkouts = (db: Database, uid: string, limit?: number): WorkoutInput[] => {
  const rows = limit
    ? db.query<{ id: string; payload_json: string }, [string, number]>(`
      SELECT id, payload_json FROM workouts WHERE uid = ? ORDER BY updated_at_ms DESC LIMIT ?
    `).all(uid, limit)
    : db.query<{ id: string; payload_json: string }, [string]>(`
      SELECT id, payload_json FROM workouts WHERE uid = ? ORDER BY updated_at_ms DESC
    `).all(uid);
  return rows
    .map((row) => safeJsonParse<WorkoutInput>(row.payload_json))
    .filter((value): value is WorkoutInput => !!value && typeof value.id === 'string');
};

export const upsertWorkout = (db: Database, uid: string, workout: WorkoutInput): void => {
  const now = Date.now();
  db.query(`
    INSERT INTO workouts (uid, id, payload_json, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(uid, id) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at_ms = excluded.updated_at_ms
  `).run(uid, workout.id, JSON.stringify(workout), now, now);
};
