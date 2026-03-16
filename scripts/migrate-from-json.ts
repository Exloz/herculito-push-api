import { createDb } from '../src/shared/persistence/sqlite';
import { createExercise } from '../src/shared/persistence/data-store';

type ExerciseVideoVariant = { url: string; kind: string };
type ExerciseVideo = {
  provider: 'musclewiki';
  slug: string;
  url: string;
  pageUrl: string;
  variants?: ExerciseVideoVariant[];
};

type ExerciseTemplateDoc = {
  id: string;
  name: string;
  category?: string;
  sets?: number;
  reps?: number;
  restTime?: number;
  description?: string;
  video?: ExerciseVideo;
  createdBy?: string;
  createdByName?: string;
  isPublic?: boolean;
  createdAt?: unknown;
  timesUsed?: number;
};

type RoutineDoc = {
  id: string;
  name: string;
  description?: string;
  exercises?: Array<{
    id: string;
    name: string;
    sets: number;
    reps: number;
    restTime?: number;
    video?: ExerciseVideo;
    category?: string;
  }>;
  createdBy?: string;
  userId?: string;
  createdByName?: string;
  isPublic?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  primaryMuscleGroup?: string;
  timesUsed?: number;
};

type WorkoutSessionDoc = {
  id: string;
  routineId?: string;
  routineName: string;
  userId: string;
  startedAt?: unknown;
  completedAt?: unknown;
  exercises?: Array<{
    exerciseId: string;
    userId?: string;
    date?: string;
    sets: Array<{ setNumber: number; weight: number; completed: boolean; completedAt?: unknown }>;
  }>;
  totalDuration?: number;
  primaryMuscleGroup?: string;
};

type ExerciseLogDoc = {
  exerciseId: string;
  userId: string;
  date: string;
  sets: Array<{ setNumber: number; weight: number; completed: boolean; completedAt?: unknown }>;
};

type ExerciseHistoryDoc = {
  exerciseId: string;
  exerciseName: string;
  userId: string;
  lastWeight: number[];
  lastDate: string;
  personalRecord?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type UserRoutineDoc = {
  id: string;
  userId: string;
  routineId: string;
  addedAt?: unknown;
  customName?: string;
  isFavorite?: boolean;
};

type WorkoutDoc = {
  id: string;
  createdBy: string;
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
  createdAt?: unknown;
  updatedAt?: unknown;
};

type ExportData = {
  exerciseTemplates?: ExerciseTemplateDoc[];
  routines?: RoutineDoc[];
  workoutSessions?: WorkoutSessionDoc[];
  exerciseLogs?: ExerciseLogDoc[];
  exerciseHistory?: ExerciseHistoryDoc[];
  userRoutines?: UserRoutineDoc[];
  workouts?: WorkoutDoc[];
};

const parseDateMs = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      // Heuristic: if it's in seconds, convert; if in ms, keep.
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const maybe = value as {
    seconds?: number;
    nanoseconds?: number;
    _seconds?: number;
    _nanoseconds?: number;
    toDate?: () => Date;
  };
  if (typeof maybe.toDate === 'function') return maybe.toDate().getTime();
  if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  if (typeof maybe._seconds === 'number') return maybe._seconds * 1000;
  return null;
};

const normalizeIdPrefix = (value: string): string => {
  const parts = value.split('_');
  return parts[0] ?? value;
};

const getArgValue = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] ?? null;
};

const inputPath = getArgValue('--input') ?? 'firestore-export.json';
const databasePath = getArgValue('--database') ?? Bun.env.DATABASE_PATH ?? '/data/push.sqlite';

const file = Bun.file(inputPath);
if (!(await file.exists())) {
  throw new Error(`Input file not found: ${inputPath}`);
}

const raw = await file.text();
const exportData = JSON.parse(raw) as ExportData;
const db = createDb(databasePath);

const templateIdMap = new Map<string, string>();
const routineExerciseMap = new Map<string, Map<string, string>>();

const insertAlias = (exerciseId: string, source: string, oldId: string | null, oldName: string, uid?: string | null, confidence = 0.6) => {
  db.query(`
    INSERT INTO exercise_aliases (
      exercise_id,
      source,
      old_exercise_id,
      old_name,
      normalized_old_name,
      uid,
      confidence,
      created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    exerciseId,
    source,
    oldId,
    oldName,
    oldName.toLowerCase(),
    uid ?? null,
    confidence,
    Date.now()
  );
};

const ensureExerciseFromTemplate = (template: ExerciseTemplateDoc): string => {
  const uid = template.createdBy ?? 'system';
  const created = createExercise(db, uid, {
    name: template.name,
    category: template.category ?? 'Personalizado',
    sets: template.sets ?? 3,
    reps: template.reps ?? 10,
    restTime: template.restTime ?? 90,
    description: template.description,
    isPublic: template.isPublic !== false,
    createdByName: template.createdByName,
    video: template.video
  });
  templateIdMap.set(template.id, created.id);
  insertAlias(created.id, 'firestore_template', template.id, template.name, template.createdBy ?? null, 0.8);
  return created.id;
};

const resolveExerciseId = (exerciseId: string, name: string, category?: string, video?: ExerciseVideo, ownerUid?: string): string => {
  const direct = templateIdMap.get(exerciseId);
  if (direct) return direct;

  const prefix = normalizeIdPrefix(exerciseId);
  const prefixed = templateIdMap.get(prefix);
  if (prefixed) return prefixed;

  const created = createExercise(db, ownerUid ?? 'system', {
    name,
    category: category ?? 'Personalizado',
    sets: 3,
    reps: 10,
    restTime: 90,
    video
  });
  insertAlias(created.id, 'firestore_routine', exerciseId, name, ownerUid ?? null, 0.5);
  return created.id;
};

const templates = exportData.exerciseTemplates ?? [];
for (const template of templates) {
  if (!template?.id || !template.name) continue;
  ensureExerciseFromTemplate(template);
}

const routines = exportData.routines ?? [];
for (const routine of routines) {
  if (!routine?.id || !routine.name) continue;
  const ownerUid = routine.createdBy ?? routine.userId ?? 'system';
  const exercises = routine.exercises ?? [];
  const mappedExercises = exercises.map((exercise) => {
    const canonicalId = resolveExerciseId(exercise.id, exercise.name, exercise.category, exercise.video, ownerUid);
    return {
      id: canonicalId,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      restTime: exercise.restTime,
      video: exercise.video
    };
  });

  const perRoutineMap = new Map<string, string>();
  exercises.forEach((exercise, index) => {
    if (!exercise) return;
    perRoutineMap.set(exercise.id, mappedExercises[index]?.id ?? exercise.id);
  });
  routineExerciseMap.set(routine.id, perRoutineMap);

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_uid = excluded.owner_uid,
      name = excluded.name,
      description = excluded.description,
      is_public = excluded.is_public,
      primary_muscle_group = excluded.primary_muscle_group,
      times_used = excluded.times_used,
      created_by_name = excluded.created_by_name,
      created_at_ms = excluded.created_at_ms,
      updated_at_ms = excluded.updated_at_ms
  `).run(
    routine.id,
    ownerUid,
    routine.name,
    routine.description ?? null,
    routine.isPublic === false ? 0 : 1,
    routine.primaryMuscleGroup ?? null,
    routine.timesUsed ?? 0,
    routine.createdByName ?? null,
    parseDateMs(routine.createdAt) ?? Date.now(),
    parseDateMs(routine.updatedAt) ?? Date.now()
  );

  db.query(`DELETE FROM routine_exercises WHERE routine_id = ?`).run(routine.id);
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

  mappedExercises.forEach((exercise, index) => {
    const routineExerciseId = `${routine.id}_${index}`;
    insertExercise.run(
      routineExerciseId,
      routine.id,
      exercise.id,
      index,
      exercise.name,
      exercise.sets,
      exercise.reps,
      exercise.restTime ?? null,
      Date.now(),
      Date.now()
    );
  });
}

const sessions = exportData.workoutSessions ?? [];
for (const session of sessions) {
  if (!session?.id || !session.userId) continue;
  const routineMap = session.routineId ? routineExerciseMap.get(session.routineId) : undefined;
  const exercises = (session.exercises ?? []).map((exercise) => {
    const mappedId = routineMap?.get(exercise.exerciseId)
      ?? templateIdMap.get(exercise.exerciseId)
      ?? templateIdMap.get(normalizeIdPrefix(exercise.exerciseId))
      ?? exercise.exerciseId;
    return {
      ...exercise,
      exerciseId: mappedId,
      userId: session.userId,
      date: exercise.date ?? ''
    };
  });

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      routine_id = excluded.routine_id,
      routine_name_snapshot = excluded.routine_name_snapshot,
      primary_muscle_group = excluded.primary_muscle_group,
      started_at_ms = excluded.started_at_ms,
      completed_at_ms = excluded.completed_at_ms,
      total_duration_min = excluded.total_duration_min,
      exercises_json = excluded.exercises_json,
      last_updated_ms = excluded.last_updated_ms,
      updated_at_ms = excluded.updated_at_ms
  `).run(
    session.id,
    session.userId,
    session.routineId ?? null,
    session.routineName,
    session.primaryMuscleGroup ?? null,
    parseDateMs(session.startedAt) ?? Date.now(),
    parseDateMs(session.completedAt),
    session.totalDuration ?? null,
    JSON.stringify(exercises),
    Date.now(),
    Date.now(),
    Date.now()
  );
}

const logs = exportData.exerciseLogs ?? [];
for (const log of logs) {
  if (!log?.exerciseId || !log.userId || !log.date) continue;
  const mappedId = templateIdMap.get(log.exerciseId)
    ?? templateIdMap.get(normalizeIdPrefix(log.exerciseId))
    ?? log.exerciseId;
  const payload = {
    exerciseId: mappedId,
    userId: log.userId,
    date: log.date,
    sets: log.sets ?? []
  };
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
    `${payload.exerciseId}_${payload.userId}_${payload.date}`,
    payload.userId,
    payload.exerciseId,
    payload.date,
    JSON.stringify(payload),
    Date.now(),
    Date.now()
  );
}

// Import exerciseHistory as synthetic exercise_logs for last-weight tracking
const history = exportData.exerciseHistory ?? [];
for (const hist of history) {
  if (!hist?.exerciseId || !hist.userId || !hist.lastDate) continue;

  const mappedId = templateIdMap.get(hist.exerciseId)
    ?? templateIdMap.get(normalizeIdPrefix(hist.exerciseId))
    ?? (() => {
      // Create exercise if it doesn't exist
      const ex = createExercise(db, hist.userId, {
        name: hist.exerciseName || 'Ejercicio histórico',
        category: 'Personalizado',
        sets: 3,
        reps: 10,
        restTime: 90,
        isPublic: false
      });
      templateIdMap.set(hist.exerciseId, ex.id);
      insertAlias(ex.id, 'firestore_history', hist.exerciseId, hist.exerciseName || 'Ejercicio histórico', hist.userId, 0.6);
      return ex.id;
    })();

  // Convert lastWeight array into sets
  const sets = (hist.lastWeight || []).map((weight, idx) => ({
    setNumber: idx + 1,
    weight,
    completed: true
  }));

  const payload = {
    exerciseId: mappedId,
    userId: hist.userId,
    date: hist.lastDate,
    sets
  };

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
    `${payload.exerciseId}_${payload.userId}_${payload.date}`,
    payload.userId,
    payload.exerciseId,
    payload.date,
    JSON.stringify(payload),
    parseDateMs(hist.createdAt) ?? Date.now(),
    parseDateMs(hist.updatedAt) ?? Date.now()
  );
}

// Import userRoutines (saved/adopted routines) as routine clones owned by the user
const userRoutines = exportData.userRoutines ?? [];
for (const userRoutine of userRoutines) {
  if (!userRoutine?.id || !userRoutine.userId || !userRoutine.routineId) continue;

  // Find the original routine
  const originalRoutine = db.query<{
    id: string;
    owner_uid: string;
    name: string;
    description: string | null;
    is_public: number;
    primary_muscle_group: string | null;
    created_by_name: string | null;
  }, [string]>(`
    SELECT id, owner_uid, name, description, is_public, primary_muscle_group, created_by_name
    FROM routines WHERE id = ? LIMIT 1
  `).get(userRoutine.routineId);

  if (!originalRoutine) {
    // Original routine not found, skip
    continue;
  }

  // Create a clone owned by the user
  const now = Date.now();
  const newRoutineId = `${originalRoutine.id}_clone_${userRoutine.userId}`;

  db.query(`
    INSERT INTO routines (
      id, owner_uid, name, description, is_public, primary_muscle_group,
      times_used, created_by_name, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at_ms = excluded.updated_at_ms
  `).run(
    newRoutineId,
    userRoutine.userId,
    userRoutine.customName || originalRoutine.name,
    originalRoutine.description,
    0, // Private by default
    originalRoutine.primary_muscle_group,
    originalRoutine.created_by_name,
    parseDateMs(userRoutine.addedAt) ?? now,
    now
  );

  // Copy routine exercises
  const originalExercises = db.query<{
    exercise_id: string;
    display_name: string | null;
    sets: number;
    reps: number;
    rest_time_s: number | null;
  }, [string]>(`
    SELECT exercise_id, display_name, sets, reps, rest_time_s
    FROM routine_exercises WHERE routine_id = ? ORDER BY position ASC
  `).all(originalRoutine.id);

  const insertExercise = db.query(`
    INSERT INTO routine_exercises (
      id, routine_id, exercise_id, position, display_name, sets, reps, rest_time_s,
      created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  originalExercises.forEach((ex, index) => {
    const routineExerciseId = `${newRoutineId}_${index}_${Date.now()}`;
    insertExercise.run(
      routineExerciseId,
      newRoutineId,
      ex.exercise_id,
      index,
      ex.display_name,
      ex.sets,
      ex.reps,
      ex.rest_time_s,
      now,
      now
    );
  });
}

// Import workouts (legacy weekly plans) per-user
const workouts = exportData.workouts ?? [];
for (const workout of workouts) {
  if (!workout?.id || !workout.createdBy) continue;

  // Map exercise IDs
  const mappedExercises = (workout.exercises || []).map((ex) => {
    const mappedId = templateIdMap.get(ex.id)
      ?? templateIdMap.get(normalizeIdPrefix(ex.id))
      ?? ex.id;
    return {
      id: mappedId,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      restTime: ex.restTime,
      video: ex.video
    };
  });

  const now = Date.now();

  db.query(`
    INSERT INTO workouts (uid, id, payload_json, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(uid, id) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at_ms = excluded.updated_at_ms
  `).run(
    workout.createdBy,
    workout.id,
    JSON.stringify({
      id: workout.id,
      day: workout.day,
      name: workout.name,
      exercises: mappedExercises
    }),
    parseDateMs(workout.createdAt) ?? now,
    parseDateMs(workout.updatedAt) ?? now
  );
}

console.log('Migration completed:', {
  templates: templates.length,
  routines: routines.length,
  sessions: sessions.length,
  logs: logs.length,
  history: history.length,
  userRoutines: userRoutines.length,
  workouts: workouts.length
});
