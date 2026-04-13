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
    repsBySet?: number[];
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

export type DashboardSummaryOutput = {
  totalWorkouts: number;
  thisWeekWorkouts: number;
  thisMonthWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  averageDurationMin: number;
};

export type DashboardRecentSessionOutput = {
  id: string;
  routineId?: string;
  routineName: string;
  primaryMuscleGroup?: string;
  completedAt: number;
  totalDuration?: number;
};

export type DashboardCalendarWorkoutOutput = {
  sessionId: string;
  routineName: string;
  muscleGroup: string;
};

export type DashboardCalendarDayOutput = {
  date: string;
  workouts: DashboardCalendarWorkoutOutput[];
};

export type DashboardRoutineOutput = RoutineOutput & {
  exerciseCount: number;
};

export type DashboardCompetitionOutput = {
  weekLeader: LeaderboardEntryOutput | null;
  monthLeader: LeaderboardEntryOutput | null;
  userWeekRank: LeaderboardEntryOutput | null;
  userMonthRank: LeaderboardEntryOutput | null;
};

export type DashboardExerciseProgressPointOutput = {
  timestamp: number;
  bestWeight: number;
  completedSets: number;
  totalWeight: number;
};

export type DashboardExerciseProgressTrend = 'up' | 'down' | 'flat' | 'neutral';

export type DashboardExerciseProgressSummaryOutput = {
  exerciseId: string;
  exerciseName: string;
  points: DashboardExerciseProgressPointOutput[];
  totalSessions: number;
  personalRecord: number;
  lastWeight: number;
  previousWeight: number | null;
  trend: DashboardExerciseProgressTrend;
  lastCompletedAt: number;
  weeklyVolumeKg: number;
};

export type DashboardOutput = {
  summary: DashboardSummaryOutput;
  recentSessions: DashboardRecentSessionOutput[];
  calendar: DashboardCalendarDayOutput[];
  dashboardRoutines: DashboardRoutineOutput[];
  competition: DashboardCompetitionOutput;
  lastWeightsByRoutine: Record<string, Record<string, number[]>>;
  exerciseProgress: DashboardExerciseProgressSummaryOutput[];
};

type DashboardExerciseLogInput = {
  exerciseId?: string;
  sets?: Array<{ completed?: boolean; weight?: number }>;
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

const toRepsBySetJson = (repsBySet?: number[]): string | null => {
  if (!repsBySet || repsBySet.length === 0) return null;
  try {
    return JSON.stringify(repsBySet);
  } catch {
    return null;
  }
};

const parseRepsBySet = (json: string | null): number[] | undefined => {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.every((r) => typeof r === 'number')) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const makeCustomExerciseId = (): string => {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `custom:${id}`;
};

const ROUTINE_EXERCISE_QUERY_CHUNK_SIZE = 400;
const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DASHBOARD_CALENDAR_SESSION_LIMIT = 365;
const DASHBOARD_PROGRESS_SESSION_LIMIT = 200;

const getCompletedNonZeroWeights = (log: DashboardExerciseLogInput): number[] => {
  const completedSets = Array.isArray(log.sets)
    ? log.sets.filter((set) => set?.completed === true && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight > 0)
    : [];

  return completedSets
    .map((set) => roundWeight(set.weight ?? 0))
    .filter((weight) => weight > 0);
};
const APP_TIME_ZONE = 'America/Bogota';
const FALLBACK_OFFSET_HOURS = -5;

const getDateKeyStartMsInAppTimeZone = (dateKey: string): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcMidnightMs = Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
  return utcMidnightMs - (FALLBACK_OFFSET_HOURS * 3600000);
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const dateFromDateKey = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

const getDateKeyInAppTimeZone = (value: Date | number): string => {
  const date = value instanceof Date ? value : new Date(value);

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error('invalid_date_parts');
    }

    return `${year}-${month}-${day}`;
  } catch {
    const shifted = new Date(date.getTime() + FALLBACK_OFFSET_HOURS * 3600000);
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
  }
};

const addDaysToDateKey = (dateKey: string, days: number): string => {
  const date = dateFromDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
};

const getStartOfWeekDateKey = (dateKey: string): string => {
  const weekday = dateFromDateKey(dateKey).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addDaysToDateKey(dateKey, -daysSinceMonday);
};

const getStartOfMonthDateKey = (dateKey: string): string => {
  return `${dateKey.slice(0, 7)}-01`;
};

const getCompletedSessionDayKeys = (timestamps: number[]): string[] => {
  const uniqueDays = new Set<string>();
  timestamps.forEach((timestamp) => {
    uniqueDays.add(getDateKeyInAppTimeZone(timestamp));
  });

  return Array.from(uniqueDays).sort();
};

const calculateCurrentWorkoutStreak = (completedDayKeys: string[], referenceDateKey: string): number => {
  if (completedDayKeys.length === 0) return 0;

  const completedDaysSet = new Set(completedDayKeys);
  const yesterdayKey = addDaysToDateKey(referenceDateKey, -1);

  let anchorDateKey: string | null = null;
  if (completedDaysSet.has(referenceDateKey)) {
    anchorDateKey = referenceDateKey;
  } else if (completedDaysSet.has(yesterdayKey)) {
    anchorDateKey = yesterdayKey;
  } else {
    return 0;
  }

  let streak = 0;
  let cursor = anchorDateKey;
  while (completedDaysSet.has(cursor)) {
    streak += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  return streak;
};

const calculateLongestWorkoutStreak = (completedDayKeys: string[]): number => {
  if (completedDayKeys.length === 0) return 0;

  let longestStreak = 1;
  let currentStreak = 1;

  for (let index = 1; index < completedDayKeys.length; index += 1) {
    const expectedNextDay = addDaysToDateKey(completedDayKeys[index - 1], 1);
    if (completedDayKeys[index] === expectedNextDay) {
      currentStreak += 1;
      continue;
    }

    longestStreak = Math.max(longestStreak, currentStreak);
    currentStreak = 1;
  }

  return Math.max(longestStreak, currentStreak);
};

const roundWeight = (value: number): number => {
  return Math.round(value * 10) / 10;
};

const isUuidLike = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const isOpaqueIdentifier = (value: string): boolean => {
  return /^[0-9a-z:_-]{20,}$/i.test(value);
};

const isUnresolvableExerciseId = (exerciseId: string): boolean => {
  const baseId = exerciseId.replace(/^custom:/, '').trim();
  return isUuidLike(baseId) || isOpaqueIdentifier(baseId);
};

const fallbackExerciseName = (exerciseId: string): string => {
  const baseId = exerciseId.replace(/^custom:/, '').trim();
  if (isUuidLike(baseId) || isOpaqueIdentifier(baseId)) {
    return 'Ejercicio personalizado';
  }

  const normalized = baseId.replace(/[_-]+/g, ' ').trim();
  if (normalized.length === 0) return 'Ejercicio';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
    reps_by_set_json: string | null;
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
      reps_by_set_json: string | null;
      rest_time_s: number | null;
      name: string | null;
      video_json?: string | null;
    }, string[]>(`
      SELECT re.routine_id, re.exercise_id, re.display_name, re.sets, re.reps, re.reps_by_set_json, re.rest_time_s, e.name${includeVideos ? ', e.video_json' : ''}
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
    const repsBySet = parseRepsBySet(exercise.reps_by_set_json);
    list.push({
      id: exercise.exercise_id,
      name,
      sets: exercise.sets,
      reps: exercise.reps,
      repsBySet,
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
        reps_by_set_json,
        rest_time_s,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        toRepsBySetJson(exercise.repsBySet),
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
          reps_by_set_json,
          rest_time_s,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          toRepsBySetJson(exercise.repsBySet),
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
  const currentDateKey = getDateKeyInAppTimeZone(Date.now());
  const weekStartDateKey = getStartOfWeekDateKey(currentDateKey);
  const monthStartDateKey = getStartOfMonthDateKey(currentDateKey);
  const weekStartMs = getDateKeyStartMsInAppTimeZone(weekStartDateKey);
  const monthStartMs = getDateKeyStartMsInAppTimeZone(monthStartDateKey);

  return {
    week: listLeaderboardByPeriod(db, requesterUid, weekStartMs, safeLimit),
    month: listLeaderboardByPeriod(db, requesterUid, monthStartMs, safeLimit)
  };
};

export const getDashboardData = (db: Database, uid: string): DashboardOutput => {
  const completedSessions = db.query<{
    id: string;
    routine_id: string | null;
    routine_name_snapshot: string;
    primary_muscle_group: string | null;
    completed_at_ms: number;
    total_duration_min: number | null;
  }, [string]>(`
    SELECT
      id,
      routine_id,
      routine_name_snapshot,
      primary_muscle_group,
      completed_at_ms,
      total_duration_min
    FROM workout_sessions
    WHERE uid = ?
      AND completed_at_ms IS NOT NULL
    ORDER BY completed_at_ms DESC
  `).all(uid);

  const currentDateKey = getDateKeyInAppTimeZone(Date.now());
  const startOfWeekDateKey = getStartOfWeekDateKey(currentDateKey);
  const startOfMonthDateKey = getStartOfMonthDateKey(currentDateKey);
  const completedTimestamps = completedSessions.map((session) => session.completed_at_ms);
  const completedDayKeys = getCompletedSessionDayKeys(completedTimestamps);
  const durations = completedSessions
    .map((session) => session.total_duration_min)
    .filter((duration): duration is number => typeof duration === 'number' && Number.isFinite(duration));

  const summary: DashboardSummaryOutput = {
    totalWorkouts: completedSessions.length,
    thisWeekWorkouts: completedTimestamps.filter((timestamp) => getDateKeyInAppTimeZone(timestamp) >= startOfWeekDateKey).length,
    thisMonthWorkouts: completedTimestamps.filter((timestamp) => getDateKeyInAppTimeZone(timestamp) >= startOfMonthDateKey).length,
    currentStreak: calculateCurrentWorkoutStreak(completedDayKeys, currentDateKey),
    longestStreak: calculateLongestWorkoutStreak(completedDayKeys),
    averageDurationMin: durations.length > 0
      ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length)
      : 0
  };

  const recentSessions: DashboardRecentSessionOutput[] = completedSessions.slice(0, 5).map((session) => ({
    id: session.id,
    routineId: session.routine_id ?? undefined,
    routineName: session.routine_name_snapshot,
    primaryMuscleGroup: session.primary_muscle_group ?? undefined,
    completedAt: session.completed_at_ms,
    totalDuration: session.total_duration_min ?? undefined
  }));

  const calendarMap = new Map<string, DashboardCalendarWorkoutOutput[]>();
  completedSessions.slice(0, DASHBOARD_CALENDAR_SESSION_LIMIT).forEach((session) => {
    const dateKey = getDateKeyInAppTimeZone(session.completed_at_ms);
    const workouts = calendarMap.get(dateKey) ?? [];
    workouts.push({
      sessionId: session.id,
      routineName: session.routine_name_snapshot,
      muscleGroup: session.primary_muscle_group ?? 'fullbody'
    });
    calendarMap.set(dateKey, workouts);
  });

  const calendar = Array.from(calendarMap.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, workouts]) => ({ date, workouts }));

  const hiddenRoutineIds = new Set(listHiddenPublicRoutineIds(db, uid));
  const dashboardRoutines = listRoutines(db, uid, { includeVideos: false })
    .filter((routine) => {
      const owner = routine.createdBy;
      const isCommunityRoutine = routine.isPublic && owner !== uid && owner !== 'system';
      if (!isCommunityRoutine) return true;
      return !hiddenRoutineIds.has(routine.id);
    })
    .map((routine) => ({
      ...routine,
      exerciseCount: routine.exercises.length
    }));

  const exerciseNames = new Map<string, string>();
  dashboardRoutines.forEach((routine) => {
    routine.exercises.forEach((exercise) => {
      if (!exerciseNames.has(exercise.id) && exercise.name.trim().length > 0) {
        exerciseNames.set(exercise.id, exercise.name.trim());
      }
    });
  });

  const progressSessions = db.query<{
    routine_id: string | null;
    completed_at_ms: number;
    exercises_json: string | null;
  }, [string, number]>(`
    SELECT routine_id, completed_at_ms, exercises_json
    FROM workout_sessions
    WHERE uid = ?
      AND completed_at_ms IS NOT NULL
      AND exercises_json IS NOT NULL
    ORDER BY completed_at_ms DESC
    LIMIT ?
  `).all(uid, DASHBOARD_PROGRESS_SESSION_LIMIT);

  const pointsByExerciseId = new Map<string, DashboardExerciseProgressPointOutput[]>();
  const lastWeightsByRoutine: Record<string, Record<string, number[]>> = {};
  const unresolvedExerciseIds = new Set<string>();

  progressSessions.forEach((session) => {
    const exerciseLogs = safeJsonParse<DashboardExerciseLogInput[]>(session.exercises_json);

    if (!exerciseLogs || exerciseLogs.length === 0) {
      return;
    }

    const routineWeights = session.routine_id
      ? (lastWeightsByRoutine[session.routine_id] ?? {})
      : undefined;

    exerciseLogs.forEach((log) => {
      if (!log || typeof log.exerciseId !== 'string' || log.exerciseId.trim().length === 0) {
        return;
      }

      const weights = getCompletedNonZeroWeights(log);
      if (weights.length === 0) {
        return;
      }

      if (routineWeights && !routineWeights[log.exerciseId]) {
        routineWeights[log.exerciseId] = weights;
      }

      if (!exerciseNames.has(log.exerciseId)) {
        unresolvedExerciseIds.add(log.exerciseId);
      }

      const bestWeight = roundWeight(weights.reduce((maxWeight, weight) => Math.max(maxWeight, weight), 0));
      const totalWeight = roundWeight(weights.reduce((sum, weight) => sum + weight, 0));
      const points = pointsByExerciseId.get(log.exerciseId) ?? [];

      points.push({
        timestamp: session.completed_at_ms,
        bestWeight,
        completedSets: weights.length,
        totalWeight
      });
      pointsByExerciseId.set(log.exerciseId, points);
    });

    if (session.routine_id && routineWeights && Object.keys(routineWeights).length > 0) {
      lastWeightsByRoutine[session.routine_id] = routineWeights;
    }
  });

  if (unresolvedExerciseIds.size > 0) {
    const unresolvedIds = Array.from(unresolvedExerciseIds);
    for (let index = 0; index < unresolvedIds.length; index += ROUTINE_EXERCISE_QUERY_CHUNK_SIZE) {
      const batchIds = unresolvedIds.slice(index, index + ROUTINE_EXERCISE_QUERY_CHUNK_SIZE);
      if (batchIds.length === 0) continue;

      const placeholders = batchIds.map(() => '?').join(', ');
      const rows = db.query<{
        id: string;
        name: string;
      }, string[]>(`
        SELECT id, name
        FROM exercises
        WHERE id IN (${placeholders})
      `).all(...batchIds);

      rows.forEach((row) => {
        if (!exerciseNames.has(row.id) && row.name.trim().length > 0) {
          exerciseNames.set(row.id, row.name.trim());
        }
      });
    }
  }

  const weekStartDateKey = addDaysToDateKey(currentDateKey, -6);
  const exerciseProgress: DashboardExerciseProgressSummaryOutput[] = [];

  pointsByExerciseId.forEach((rawPoints, exerciseId) => {
    const resolvedExerciseName = exerciseNames.get(exerciseId);
    if (!resolvedExerciseName && isUnresolvableExerciseId(exerciseId)) {
      return;
    }

    const points = [...rawPoints].sort((left, right) => left.timestamp - right.timestamp);
    if (points.length === 0) {
      return;
    }

    const lastPoint = points[points.length - 1];
    const previousPoint = points.length > 1 ? points[points.length - 2] : null;
    const personalRecord = roundWeight(
      points.reduce((maxWeight, point) => Math.max(maxWeight, point.bestWeight), 0)
    );
    const weeklyVolumeKg = roundWeight(
      points
        .filter((point) => getDateKeyInAppTimeZone(point.timestamp) >= weekStartDateKey)
        .reduce((sumWeight, point) => sumWeight + point.totalWeight, 0)
    );
    const previousWeight = previousPoint ? previousPoint.bestWeight : null;

    let trend: DashboardExerciseProgressTrend = 'neutral';
    if (previousWeight !== null) {
      if (lastPoint.bestWeight > previousWeight) {
        trend = 'up';
      } else if (lastPoint.bestWeight < previousWeight) {
        trend = 'down';
      } else {
        trend = 'flat';
      }
    }

    exerciseProgress.push({
      exerciseId,
      exerciseName: resolvedExerciseName ?? fallbackExerciseName(exerciseId),
      points,
      totalSessions: points.length,
      personalRecord,
      lastWeight: lastPoint.bestWeight,
      previousWeight,
      trend,
      lastCompletedAt: lastPoint.timestamp,
      weeklyVolumeKg
    });
  });

  exerciseProgress.sort((left, right) => {
    const timeDiff = right.lastCompletedAt - left.lastCompletedAt;
    if (timeDiff !== 0) return timeDiff;
    return right.totalSessions - left.totalSessions;
  });

  const leaderboard = getCompetitiveLeaderboard(db, uid, 25);

  return {
    summary,
    recentSessions,
    calendar,
    dashboardRoutines,
    competition: {
      weekLeader: leaderboard.week.top[0] ?? null,
      monthLeader: leaderboard.month.top[0] ?? null,
      userWeekRank: leaderboard.week.currentUser,
      userMonthRank: leaderboard.month.currentUser
    },
    lastWeightsByRoutine,
    exerciseProgress
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

export const completeSession = (
  db: Database,
  uid: string,
  sessionId: string,
  exercises: unknown[],
  completedAtMs: number,
  totalDurationMin: number,
  repsBySetUpdates?: Record<string, number[]>
): void => {
  const now = Date.now();
  const session = db.query<{ started_at_ms: number; routine_id: string | null }, [string, string]>(`
    SELECT started_at_ms, routine_id
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

  // Apply reps-by-set updates to the routine ONLY if the user owns the routine
  // Security: prevent mutation of public/other users' routines
  if (repsBySetUpdates && session.routine_id && Object.keys(repsBySetUpdates).length > 0) {
    try {
      // Verify the routine belongs to this user before applying updates
      const routineOwner = db.query<{ owner_uid: string }, [string]>(`
        SELECT owner_uid FROM routines WHERE id = ? LIMIT 1
      `).get(session.routine_id);

      if (routineOwner && routineOwner.owner_uid === uid) {
        const run = db.transaction(() => {
          let appliedUpdates = 0;
          for (const [exerciseId, repsBySet] of Object.entries(repsBySetUpdates)) {
            if (!Array.isArray(repsBySet) || repsBySet.length === 0) continue;

            const routineExercise = db.query<{ sets: number }, [string, string]>(`
              SELECT sets
              FROM routine_exercises
              WHERE routine_id = ? AND exercise_id = ?
              LIMIT 1
            `).get(session.routine_id!, exerciseId);

            if (!routineExercise || routineExercise.sets !== repsBySet.length) {
              continue;
            }

            const repsBySetJson = JSON.stringify(repsBySet);
            db.query(`
              UPDATE routine_exercises
              SET reps_by_set_json = ?, updated_at_ms = ?
              WHERE routine_id = ? AND exercise_id = ?
            `).run(repsBySetJson, now, session.routine_id, exerciseId);
            appliedUpdates += 1;
          }

          if (appliedUpdates > 0) {
            db.query(`
              UPDATE routines
              SET updated_at_ms = ?
              WHERE id = ? AND owner_uid = ?
            `).run(now, session.routine_id, uid);
          }
        });
        run();
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: 'warn',
        event: 'routine_reps_by_set_update_failed',
        sessionId,
        routineId: session.routine_id,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }
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

// ===== SPORTS MODULE =====

export type SportType = 'archery' | 'hiit';

export type ArcheryArrowInput = {
  score: number;
  isGold: boolean;
};

export type ArcheryEndInput = {
  arrows: ArcheryArrowInput[];
};

export type ArcheryRoundInput = {
  distance: number;
  targetSize: number;
  arrowsPerEnd: number;
};

export type HiitConfigInput = {
  intervals: number;
  workDuration: number;
  restEnabled: boolean;
  restDuration: number;
};

export type SportSessionInput = {
  sportType: SportType;
  location?: string;
  notes?: string;
  archeryConfig?: {
    bowType: string;
    arrowsUsed: number;
  };
  hiitConfig?: HiitConfigInput;
};

export type ArcheryArrowOutput = {
  id: string;
  score: number;
  isGold: boolean;
  timestamp: number;
};

export type ArcheryEndOutput = {
  id: string;
  endNumber: number;
  arrows: ArcheryArrowOutput[];
  subtotal: number;
  goldCount: number;
};

export type ArcheryRoundOutput = {
  id: string;
  distance: number;
  targetSize: number;
  arrowsPerEnd: number;
  order: number;
  ends: ArcheryEndOutput[];
  totalScore: number;
};

export type HiitSessionDataOutput = {
  intervals: number;
  workDuration: number;
  restEnabled: boolean;
  restDuration: number;
  totalWorkTime: number;
  totalRestTime: number;
};

export type SportSessionOutput = {
  id: string;
  userId: string;
  sportType: SportType;
  sportName: string;
  location?: string;
  notes?: string;
  startedAt: number;
  completedAt?: number;
  status: 'active' | 'completed' | 'abandoned';
  archeryData?: {
    bowType: string;
    arrowsUsed: number;
    rounds: ArcheryRoundOutput[];
    totalScore: number;
    maxPossibleScore: number;
    averageArrow: number;
  };
  hiitData?: HiitSessionDataOutput;
};

export const startSportSession = (
  db: Database,
  uid: string,
  input: SportSessionInput
): SportSessionOutput => {
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const archeryData = input.sportType === 'archery' && input.archeryConfig
    ? {
      bowType: input.archeryConfig.bowType,
      arrowsUsed: input.archeryConfig.arrowsUsed,
      rounds: [],
      totalScore: 0,
      maxPossibleScore: 0,
      averageArrow: 0
    }
    : undefined;

  const hiitData = input.sportType === 'hiit' && input.hiitConfig
    ? {
      intervals: input.hiitConfig.intervals,
      workDuration: input.hiitConfig.workDuration,
      restEnabled: input.hiitConfig.restEnabled,
      restDuration: input.hiitConfig.restDuration,
      totalWorkTime: input.hiitConfig.intervals * input.hiitConfig.workDuration,
      totalRestTime: input.hiitConfig.restEnabled
        ? Math.max(0, input.hiitConfig.intervals - 1) * input.hiitConfig.restDuration
        : 0
    }
    : undefined;

  // Store sport-specific data in archery_data_json column for backward compatibility
  // For HIIT, we store hiitData there temporarily until a migration adds a dedicated column
  const sportDataJson = archeryData
    ? JSON.stringify({ archery: archeryData })
    : hiitData
      ? JSON.stringify({ hiit: hiitData })
      : null;

  db.query(`
    INSERT INTO sport_sessions (
      id, uid, sport_type, location, notes, started_at_ms, status,
      archery_data_json, created_at_ms, updated_at_ms
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    uid,
    input.sportType,
    input.location ?? null,
    input.notes ?? null,
    now,
    'active',
    sportDataJson,
    now,
    now
  );

  const getSportName = (type: SportType): string => {
    switch (type) {
      case 'archery': return 'Tiro con Arco';
      case 'hiit': return 'HIIT';
      default: return type;
    }
  };

  return {
    id: sessionId,
    userId: uid,
    sportType: input.sportType,
    sportName: getSportName(input.sportType),
    location: input.location,
    notes: input.notes,
    startedAt: now,
    status: 'active',
    archeryData,
    hiitData
  };
};

export const addArcheryRound = (
  db: Database,
  uid: string,
  sessionId: string,
  input: ArcheryRoundInput
): ArcheryRoundOutput => {
  const now = Date.now();
  const roundId = crypto.randomUUID();

  // Get the current order index
  const existingRounds = db.query<{ count: number }, [string]>(`
    SELECT COUNT(*) as count FROM archery_rounds WHERE session_id = ?
  `).get(sessionId);
  const orderIndex = (existingRounds?.count ?? 0) + 1;

  db.query(`
    INSERT INTO archery_rounds (
      id, session_id, distance, target_size, arrows_per_end, order_index,
      total_score, created_at_ms, updated_at_ms
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    roundId,
    sessionId,
    input.distance,
    input.targetSize,
    input.arrowsPerEnd,
    orderIndex,
    now,
    now
  );

  return {
    id: roundId,
    distance: input.distance,
    targetSize: input.targetSize,
    arrowsPerEnd: input.arrowsPerEnd,
    order: orderIndex,
    ends: [],
    totalScore: 0
  };
};

export const addArcheryEnd = (
  db: Database,
  uid: string,
  sessionId: string,
  roundId: string,
  input: ArcheryEndInput
): ArcheryEndOutput => {
  const now = Date.now();
  const endId = crypto.randomUUID();

  // Calculate subtotal and gold count
  let subtotal = 0;
  let goldCount = 0;
  const arrowsWithIds: ArcheryArrowOutput[] = [];

  for (let i = 0; i < input.arrows.length; i += 1) {
    const arrow = input.arrows[i];
    subtotal += arrow.score;
    if (arrow.isGold) goldCount += 1;
    arrowsWithIds.push({
      id: crypto.randomUUID(),
      score: arrow.score,
      isGold: arrow.isGold,
      timestamp: now
    });
  }

  // Get the current end number
  const existingEnds = db.query<{ count: number }, [string]>(`
    SELECT COUNT(*) as count FROM archery_ends WHERE round_id = ?
  `).get(roundId);
  const endNumber = (existingEnds?.count ?? 0) + 1;

  // Insert end
  db.query(`
    INSERT INTO archery_ends (id, round_id, end_number, subtotal, gold_count, created_at_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(endId, roundId, endNumber, subtotal, goldCount, now);

  // Insert arrows
  for (let i = 0; i < arrowsWithIds.length; i += 1) {
    const arrow = arrowsWithIds[i];
    db.query(`
      INSERT INTO archery_arrows (id, end_id, score, is_gold, arrow_order, timestamp_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(arrow.id, endId, arrow.score, arrow.isGold ? 1 : 0, i + 1, arrow.timestamp);
  }

  // Update round total score
  db.query(`
    UPDATE archery_rounds
    SET total_score = total_score + ?, updated_at_ms = ?
    WHERE id = ?
  `).run(subtotal, now, roundId);

  // Update session stats
  updateArcherySessionStats(db, sessionId);

  return {
    id: endId,
    endNumber,
    arrows: arrowsWithIds,
    subtotal,
    goldCount
  };
};

const updateArcherySessionStats = (db: Database, sessionId: string): void => {
  const now = Date.now();

  // Calculate total stats
  const stats = db.query<{
    totalScore: number;
    totalArrows: number;
    goldCount: number;
    maxPossible: number;
  }, [string]>(`
    SELECT
      COALESCE(SUM(r.total_score), 0) as totalScore,
      COALESCE(SUM((SELECT COUNT(*) FROM archery_arrows a JOIN archery_ends e ON a.end_id = e.id WHERE e.round_id = r.id)), 0) as totalArrows,
      COALESCE(SUM((SELECT COUNT(*) FROM archery_arrows a JOIN archery_ends e ON a.end_id = e.id WHERE e.round_id = r.id AND a.is_gold = 1)), 0) as goldCount,
      COALESCE(SUM(r.arrows_per_end * 10 * (SELECT COUNT(*) FROM archery_ends WHERE round_id = r.id)), 0) as maxPossible
    FROM archery_rounds r
    WHERE r.session_id = ?
  `).get(sessionId);

  if (!stats) return;

  const averageArrow = stats.totalArrows > 0 ? stats.totalScore / stats.totalArrows : 0;

  // Get existing archery data
  const session = db.query<{ archery_data_json: string }, [string]>(`
    SELECT archery_data_json FROM sport_sessions WHERE id = ?
  `).get(sessionId);

  if (session?.archery_data_json) {
    const sportData = parseSportDataJson(session.archery_data_json);
    const existingArcheryData = sportData.archery;

    const updatedData = {
      bowType: existingArcheryData?.bowType ?? 'recurve',
      arrowsUsed: existingArcheryData?.arrowsUsed ?? 0,
      totalScore: stats.totalScore,
      maxPossibleScore: stats.maxPossible,
      averageArrow: Math.round(averageArrow * 100) / 100,
      goldCount: stats.goldCount,
    };

    db.query(`
      UPDATE sport_sessions
      SET archery_data_json = ?, updated_at_ms = ?
      WHERE id = ?
    `).run(JSON.stringify({ archery: updatedData }), now, sessionId);
  }
};

export const completeSportSession = (
  db: Database,
  uid: string,
  sessionId: string,
  notes?: string
): void => {
  const now = Date.now();

  db.query(`
    UPDATE sport_sessions
    SET status = ?, completed_at_ms = ?, notes = COALESCE(?, notes), updated_at_ms = ?
    WHERE id = ? AND uid = ?
  `).run('completed', now, notes ?? null, now, sessionId, uid);
};

const getSportName = (type: SportType): string => {
  switch (type) {
    case 'archery': return 'Tiro con Arco';
    case 'hiit': return 'HIIT';
    default: return type;
  }
};

type ArcheryMetaJson = {
  bowType: string;
  arrowsUsed: number;
  totalScore: number;
  maxPossibleScore: number;
  averageArrow: number;
  goldCount?: number;
};

type HiitMetaJson = {
  intervals: number;
  workDuration: number;
  restEnabled: boolean;
  restDuration: number;
  totalWorkTime: number;
  totalRestTime: number;
};

type SportDataJson = {
  archery?: ArcheryMetaJson;
  hiit?: HiitMetaJson;
} | ArcheryMetaJson; // Legacy format (raw archery data without wrapper)

const parseSportDataJson = (json: string): { archery?: ArcheryMetaJson; hiit?: HiitMetaJson } => {
  const parsed = safeJsonParse<ArcheryMetaJson | SportDataJson>(json);
  if (!parsed) return {};

  // Legacy format: raw archery data without wrapper
  if ('bowType' in parsed && !('archery' in parsed) && !('hiit' in parsed)) {
    return { archery: parsed as ArcheryMetaJson };
  }

  // New format: wrapped in { archery: ... } or { hiit: ... }
  const wrapped = parsed as SportDataJson;
  if ('archery' in wrapped || 'hiit' in wrapped) {
    return {
      archery: (wrapped as { archery?: ArcheryMetaJson }).archery,
      hiit: (wrapped as { hiit?: HiitMetaJson }).hiit,
    };
  }

  return {};
};

export const listSportSessions = (
  db: Database,
  uid: string,
  options?: {
    sportType?: SportType;
    limit?: number;
    completedOnly?: boolean;
  }
): SportSessionOutput[] => {
  let query = `
    SELECT
      id,
      uid as userId,
      sport_type as sportType,
      location,
      notes,
      started_at_ms as startedAt,
      completed_at_ms as completedAt,
      status,
      archery_data_json as archeryDataJson
    FROM sport_sessions
    WHERE uid = ?
  `;
  const params: (string | number)[] = [uid];

  if (options?.sportType) {
    query += ' AND sport_type = ?';
    params.push(options.sportType);
  }

  if (options?.completedOnly) {
    query += ' AND status = \'completed\'';
  }

  query += ' ORDER BY started_at_ms DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.query<{
    id: string;
    userId: string;
    sportType: SportType;
    location: string | null;
    notes: string | null;
    startedAt: number;
    completedAt: number | null;
    status: 'active' | 'completed' | 'abandoned';
    archeryDataJson: string | null;
  }, (string | number)[]>(query).all(...params);

  return rows.map((row) => {
    const sportData = row.archeryDataJson
      ? parseSportDataJson(row.archeryDataJson)
      : {};

    return {
      id: row.id,
      userId: row.userId,
      sportType: row.sportType,
      sportName: getSportName(row.sportType),
      location: row.location ?? undefined,
      notes: row.notes ?? undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      status: row.status,
      archeryData: sportData.archery ? {
        bowType: sportData.archery.bowType,
        arrowsUsed: sportData.archery.arrowsUsed,
        rounds: [],
        totalScore: sportData.archery.totalScore ?? 0,
        maxPossibleScore: sportData.archery.maxPossibleScore ?? 0,
        averageArrow: sportData.archery.averageArrow ?? 0
      } : undefined,
      hiitData: sportData.hiit ? {
        intervals: sportData.hiit.intervals,
        workDuration: sportData.hiit.workDuration,
        restEnabled: sportData.hiit.restEnabled,
        restDuration: sportData.hiit.restDuration,
        totalWorkTime: sportData.hiit.totalWorkTime,
        totalRestTime: sportData.hiit.totalRestTime,
      } : undefined
    };
  });
};

export const getSportSessionWithDetails = (
  db: Database,
  uid: string,
  sessionId: string
): SportSessionOutput | null => {
  const session = db.query<{
    id: string;
    userId: string;
    sportType: SportType;
    location: string | null;
    notes: string | null;
    startedAt: number;
    completedAt: number | null;
    status: 'active' | 'completed' | 'abandoned';
    archeryDataJson: string | null;
  }, [string, string]>(`
    SELECT
      id,
      uid as userId,
      sport_type as sportType,
      location,
      notes,
      started_at_ms as startedAt,
      completed_at_ms as completedAt,
      status,
      archery_data_json as archeryDataJson
    FROM sport_sessions
    WHERE id = ? AND uid = ?
  `).get(sessionId, uid);

  if (!session) return null;

  // Load archery rounds with ends and arrows
  let archeryData: SportSessionOutput['archeryData'];
  let hiitData: SportSessionOutput['hiitData'];

  if (session.archeryDataJson) {
    const sportData = parseSportDataJson(session.archeryDataJson);

    if (session.sportType === 'archery' && sportData.archery) {
      const rounds = loadArcheryRounds(db, sessionId);
      archeryData = {
        bowType: sportData.archery.bowType ?? 'recurve',
        arrowsUsed: sportData.archery.arrowsUsed ?? 0,
        rounds,
        totalScore: sportData.archery.totalScore ?? 0,
        maxPossibleScore: sportData.archery.maxPossibleScore ?? 0,
        averageArrow: sportData.archery.averageArrow ?? 0
      };
    }

    if (session.sportType === 'hiit' && sportData.hiit) {
      hiitData = {
        intervals: sportData.hiit.intervals,
        workDuration: sportData.hiit.workDuration,
        restEnabled: sportData.hiit.restEnabled,
        restDuration: sportData.hiit.restDuration,
        totalWorkTime: sportData.hiit.totalWorkTime,
        totalRestTime: sportData.hiit.totalRestTime,
      };
    }
  }

  return {
    id: session.id,
    userId: session.userId,
    sportType: session.sportType,
    sportName: getSportName(session.sportType),
    location: session.location ?? undefined,
    notes: session.notes ?? undefined,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? undefined,
    status: session.status,
    archeryData,
    hiitData
  };
};

const loadArcheryRounds = (db: Database, sessionId: string): ArcheryRoundOutput[] => {
  const rounds = db.query<{
    id: string;
    distance: number;
    targetSize: number;
    arrowsPerEnd: number;
    orderIndex: number;
    totalScore: number;
  }, [string]>(`
    SELECT
      id,
      distance,
      target_size as targetSize,
      arrows_per_end as arrowsPerEnd,
      order_index as orderIndex,
      total_score as totalScore
    FROM archery_rounds
    WHERE session_id = ?
    ORDER BY order_index ASC
  `).all(sessionId);

  return rounds.map((round) => ({
    id: round.id,
    distance: round.distance,
    targetSize: round.targetSize,
    arrowsPerEnd: round.arrowsPerEnd,
    order: round.orderIndex,
    ends: loadArcheryEnds(db, round.id),
    totalScore: round.totalScore
  }));
};

const loadArcheryEnds = (db: Database, roundId: string): ArcheryEndOutput[] => {
  const ends = db.query<{
    id: string;
    endNumber: number;
    subtotal: number;
    goldCount: number;
  }, [string]>(`
    SELECT
      id,
      end_number as endNumber,
      subtotal,
      gold_count as goldCount
    FROM archery_ends
    WHERE round_id = ?
    ORDER BY end_number ASC
  `).all(roundId);

  return ends.map((end) => ({
    id: end.id,
    endNumber: end.endNumber,
    subtotal: end.subtotal,
    goldCount: end.goldCount,
    arrows: loadArcheryArrows(db, end.id)
  }));
};

const loadArcheryArrows = (db: Database, endId: string): ArcheryArrowOutput[] => {
  const arrows = db.query<{
    id: string;
    score: number;
    isGold: number;
    timestampMs: number;
  }, [string]>(`
    SELECT
      id,
      score,
      is_gold as isGold,
      timestamp_ms as timestampMs
    FROM archery_arrows
    WHERE end_id = ?
    ORDER BY arrow_order ASC
  `).all(endId);

  return arrows.map((arrow) => ({
    id: arrow.id,
    score: arrow.score,
    isGold: arrow.isGold === 1,
    timestamp: arrow.timestampMs
  }));
};

export const deleteSportSession = (db: Database, uid: string, sessionId: string): void => {
  db.query(`DELETE FROM sport_sessions WHERE id = ? AND uid = ?`).run(sessionId, uid);
};

export const getSportStats = (
  db: Database,
  uid: string,
  sportType?: SportType
): {
  totalSessions: number;
  thisWeekSessions: number;
  thisMonthSessions: number;
  currentStreak: number;
  longestStreak: number;
  totalDuration: number;
  totalArrowsShot?: number;
  averageScore?: number;
  personalBest?: number;
  totalHiitIntervals?: number;
  totalHiitWorkTime?: number;
} => {
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Archery data can be either legacy ($.arrowsUsed) or wrapped ($.archery.arrowsUsed)
  // HIIT data is wrapped ($.hiit.intervals, $.hiit.totalWorkTime)
  const query = `
    SELECT
      COUNT(*) as totalSessions,
      SUM(CASE WHEN completed_at_ms >= ? THEN 1 ELSE 0 END) as thisWeekSessions,
      SUM(CASE WHEN completed_at_ms >= ? THEN 1 ELSE 0 END) as thisMonthSessions,
      COALESCE(SUM(
        CASE WHEN sport_type = 'archery' AND archery_data_json IS NOT NULL THEN
          COALESCE(json_extract(archery_data_json, '$.archery.arrowsUsed'), json_extract(archery_data_json, '$.arrowsUsed'), 0)
        ELSE 0 END
      ), 0) as totalArrowsShot,
      COALESCE(AVG(
        CASE WHEN sport_type = 'archery' AND archery_data_json IS NOT NULL THEN
          COALESCE(json_extract(archery_data_json, '$.archery.averageArrow'), json_extract(archery_data_json, '$.averageArrow'))
        ELSE NULL END
      ), 0) as averageScore,
      COALESCE(MAX(
        CASE WHEN sport_type = 'archery' AND archery_data_json IS NOT NULL THEN
          COALESCE(json_extract(archery_data_json, '$.archery.totalScore'), json_extract(archery_data_json, '$.totalScore'), 0)
        ELSE 0 END
      ), 0) as personalBest,
      COALESCE(SUM(
        CASE WHEN completed_at_ms IS NOT NULL AND started_at_ms IS NOT NULL THEN
          (completed_at_ms - started_at_ms) / 60000.0
        ELSE 0 END
      ), 0) as totalDuration,
      COALESCE(SUM(
        CASE WHEN sport_type = 'hiit' AND archery_data_json IS NOT NULL THEN
          COALESCE(json_extract(archery_data_json, '$.hiit.intervals'), 0)
        ELSE 0 END
      ), 0) as totalHiitIntervals,
      COALESCE(SUM(
        CASE WHEN sport_type = 'hiit' AND archery_data_json IS NOT NULL THEN
          COALESCE(json_extract(archery_data_json, '$.hiit.totalWorkTime'), 0)
        ELSE 0 END
      ), 0) as totalHiitWorkTime
    FROM sport_sessions
    WHERE uid = ? AND status = 'completed'
    ${sportType ? 'AND sport_type = ?' : ''}
  `;
  const params: (string | number)[] = [oneWeekAgo, oneMonthAgo, uid];
  if (sportType) {
    params.push(sportType);
  }

  const stats = db.query<{
    totalSessions: number;
    thisWeekSessions: number;
    thisMonthSessions: number;
    totalArrowsShot: number;
    averageScore: number;
    personalBest: number;
    totalDuration: number;
    totalHiitIntervals: number;
    totalHiitWorkTime: number;
  }, (string | number)[]>(query).get(...params);

  // Calculate streaks
  const sessions = db.query<{ completedAt: number }, (string | number)[]>(`
    SELECT completed_at_ms as completedAt
    FROM sport_sessions
    WHERE uid = ? AND status = 'completed'
    ${sportType ? 'AND sport_type = ?' : ''}
    ORDER BY completed_at_ms DESC
  `).all(...(sportType ? [uid, sportType] : [uid]));

  const streaks = calculateStreaks(sessions.map((s) => s.completedAt));

  const hasArchery = sportType == null || sportType === 'archery';
  const hasHiit = sportType == null || sportType === 'hiit';

  return {
    totalSessions: stats?.totalSessions ?? 0,
    thisWeekSessions: stats?.thisWeekSessions ?? 0,
    thisMonthSessions: stats?.thisMonthSessions ?? 0,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    totalDuration: Math.round((stats?.totalDuration ?? 0) * 10) / 10,
    totalArrowsShot: hasArchery ? (stats?.totalArrowsShot ?? 0) : undefined,
    averageScore: hasArchery ? Math.round((stats?.averageScore ?? 0) * 100) / 100 : undefined,
    personalBest: hasArchery ? (stats?.personalBest ?? 0) : undefined,
    totalHiitIntervals: hasHiit ? (stats?.totalHiitIntervals ?? 0) : undefined,
    totalHiitWorkTime: hasHiit ? (stats?.totalHiitWorkTime ?? 0) : undefined,
  };
};

const calculateStreaks = (completedAts: number[]): { current: number; longest: number } => {
  if (completedAts.length === 0) return { current: 0, longest: 0 };

  const days = new Set(
    completedAts.map((ts) => {
      const date = new Date(ts);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    })
  );

  const sortedDays = Array.from(days).sort().reverse();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

  let current = 0;
  let longest = 0;
  let tempStreak = 0;

  // Check if streak is active (today or yesterday)
  if (sortedDays[0] === todayKey) {
    current = 1;
  } else if (sortedDays[0] === yesterdayKey) {
    current = 1;
  }

  // Calculate longest streak
  for (let i = 0; i < sortedDays.length; i += 1) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = sortedDays[i - 1].split('-').map(Number);
      const curr = sortedDays[i].split('-').map(Number);
      const prevDate = new Date(prev[0], prev[1], prev[2]);
      const currDate = new Date(curr[0], curr[1], curr[2]);
      const diff = (prevDate.getTime() - currDate.getTime()) / (24 * 60 * 60 * 1000);

      if (diff === 1) {
        tempStreak += 1;
      } else {
        longest = Math.max(longest, tempStreak);
        tempStreak = 1;
      }
    }
  }
  longest = Math.max(longest, tempStreak);

  // Calculate current streak
  if (current === 1) {
    for (let i = 1; i < sortedDays.length; i += 1) {
      const prev = sortedDays[i - 1].split('-').map(Number);
      const curr = sortedDays[i].split('-').map(Number);
      const prevDate = new Date(prev[0], prev[1], prev[2]);
      const currDate = new Date(curr[0], curr[1], curr[2]);
      const diff = (prevDate.getTime() - currDate.getTime()) / (24 * 60 * 60 * 1000);

      if (diff === 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return { current, longest };
};
