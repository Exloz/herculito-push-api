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

const resolveExerciseId = (input: ExerciseInput): string => {
  const slug = input.video?.slug?.trim();
  if (slug) return `mw:${slug}`;
  return makeCustomExerciseId();
};

export const listExercises = (db: Database, uid: string): ExerciseTemplate[] => {
  const rows = db.query<{
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
  const now = Date.now();
  const normalizedName = normalizeName(input.name);
  let exerciseId = input.video?.slug ? `mw:${input.video.slug}` : '';

  if (!exerciseId) {
    const existing = db.query<{ id: string }, [string, string]>(`
      SELECT id FROM exercises WHERE normalized_name = ? AND category = ? LIMIT 1
    `).get(normalizedName, input.category);
    if (existing?.id) {
      exerciseId = existing.id;
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
};

export const updateExercise = (db: Database, uid: string, exerciseId: string, updates: Partial<ExerciseInput>): void => {
  const now = Date.now();

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

  if (typeof updates.description === 'string' && isOwner) {
    fields.push('description = ?');
    values.push(updates.description);
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

  if (updates.muscleGroup && isOwner) {
    fields.push('muscle_group = ?');
    values.push(updates.muscleGroup);
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

export const incrementExerciseUsage = (db: Database, exerciseId: string): void => {
  db.query(`UPDATE exercises SET times_used = times_used + 1 WHERE id = ?`).run(exerciseId);
};

export const listRoutines = (db: Database, uid: string): RoutineOutput[] => {
  const routines = db.query<{
    id: string;
    owner_uid: string;
    name: string;
    description: string | null;
    is_public: number;
    primary_muscle_group: string | null;
    times_used: number;
    created_by_name: string | null;
    created_at_ms: number;
    updated_at_ms: number;
  }, [string, string]>(`
    SELECT id, owner_uid, name, description, is_public, primary_muscle_group, times_used, created_by_name, created_at_ms, updated_at_ms
    FROM routines
    WHERE
      owner_uid = ?
      OR (
        is_public = 1
        AND owner_uid <> ?
        AND owner_uid <> 'system'
        AND (
          created_by_name IS NULL
          OR TRIM(created_by_name) NOT IN ('Sistema', 'Usuario')
        )
      )
    ORDER BY created_at_ms DESC
  `).all(uid, uid);

  return routines.map((routine) => {
    const exercises = db.query<{
      exercise_id: string;
      display_name: string | null;
      sets: number;
      reps: number;
      rest_time_s: number | null;
      name: string | null;
      video_json: string | null;
    }, [string]>(`
      SELECT re.exercise_id, re.display_name, re.sets, re.reps, re.rest_time_s, e.name, e.video_json
      FROM routine_exercises re
      LEFT JOIN exercises e ON e.id = re.exercise_id
      WHERE re.routine_id = ?
      ORDER BY re.position ASC
    `).all(routine.id);

    const mappedExercises = exercises.map((exercise) => {
      const video = safeJsonParse<ExerciseVideo>(exercise.video_json);
      const name = exercise.display_name ?? exercise.name ?? exercise.exercise_id;
      return {
        id: exercise.exercise_id,
        name,
        sets: exercise.sets,
        reps: exercise.reps,
        restTime: exercise.rest_time_s ?? undefined,
        video
      };
    });

    return {
      id: routine.id,
      name: routine.name,
      description: routine.description ?? undefined,
      exercises: mappedExercises,
      createdBy: routine.owner_uid,
      createdByName: routine.created_by_name ?? undefined,
      isPublic: routine.is_public === 1,
      timesUsed: routine.times_used,
      createdAt: routine.created_at_ms,
      updatedAt: routine.updated_at_ms,
      primaryMuscleGroup: routine.primary_muscle_group ?? undefined
    };
  });
};

export const createRoutine = (db: Database, uid: string, input: RoutineInput): RoutineOutput => {
  const now = Date.now();
  const routineId = input.id ?? (globalThis.crypto?.randomUUID?.() ?? `${now}_${Math.random().toString(16).slice(2)}`);
  const isPublic = input.isPublic === true;

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
};

export const updateRoutine = (db: Database, uid: string, routineId: string, updates: Partial<RoutineInput>): void => {
  const now = Date.now();
  const owner = db.query<{ owner_uid: string }, [string, string]>(`
    SELECT owner_uid FROM routines WHERE id = ? AND owner_uid = ? LIMIT 1
  `).get(routineId, uid);

  if (!owner) {
    return;
  }
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.name) {
    fields.push('name = ?');
    values.push(updates.name);
  }

  if (typeof updates.description === 'string') {
    fields.push('description = ?');
    values.push(updates.description);
  }

  if (typeof updates.isPublic === 'boolean') {
    fields.push('is_public = ?');
    values.push(updates.isPublic ? 1 : 0);
  }

  if (updates.primaryMuscleGroup) {
    fields.push('primary_muscle_group = ?');
    values.push(updates.primaryMuscleGroup);
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
};

export const deleteRoutine = (db: Database, uid: string, routineId: string): void => {
  db.query(`DELETE FROM routine_exercises WHERE routine_id = ? AND routine_id IN (SELECT id FROM routines WHERE id = ? AND owner_uid = ?)`)
    .run(routineId, routineId, uid);
  db.query(`DELETE FROM routines WHERE id = ? AND owner_uid = ?`).run(routineId, uid);
};

export const incrementRoutineUsage = (db: Database, routineId: string): void => {
  db.query(`UPDATE routines SET times_used = times_used + 1 WHERE id = ?`).run(routineId);
};

export const listSessions = (db: Database, uid: string): WorkoutSessionOutput[] => {
  const rows = db.query<{
    id: string;
    routine_id: string | null;
    routine_name_snapshot: string;
    primary_muscle_group: string | null;
    started_at_ms: number;
    completed_at_ms: number | null;
    total_duration_min: number | null;
    exercises_json: string | null;
  }, [string]>(`
    SELECT id, routine_id, routine_name_snapshot, primary_muscle_group, started_at_ms, completed_at_ms, total_duration_min, exercises_json
    FROM workout_sessions
    WHERE uid = ?
    ORDER BY started_at_ms DESC
    LIMIT 500
  `).all(uid);

  return rows.map((row) => {
    const exercises = safeJsonParse<unknown[]>(row.exercises_json) ?? [];
    return {
      id: row.id,
      routineId: row.routine_id ?? undefined,
      routineName: row.routine_name_snapshot,
      userId: uid,
      primaryMuscleGroup: row.primary_muscle_group ?? undefined,
      startedAt: row.started_at_ms,
      completedAt: row.completed_at_ms ?? undefined,
      totalDuration: row.total_duration_min ?? undefined,
      exercises
    };
  });
};

export const startSession = (db: Database, uid: string, input: WorkoutSessionInput): WorkoutSessionOutput => {
  const now = Date.now();
  const sessionId = input.id ?? (globalThis.crypto?.randomUUID?.() ?? `${now}_${Math.random().toString(16).slice(2)}`);
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
  db.query(`
    UPDATE workout_sessions
    SET exercises_json = ?, completed_at_ms = ?, total_duration_min = ?, updated_at_ms = ?
    WHERE id = ? AND uid = ?
  `).run(JSON.stringify(exercises ?? []), completedAtMs, totalDurationMin, now, sessionId, uid);
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

export const listWorkouts = (db: Database, uid: string): WorkoutInput[] => {
  const rows = db.query<{ id: string; payload_json: string }, [string]>(`
    SELECT id, payload_json FROM workouts WHERE uid = ?
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
