import { Database } from 'bun:sqlite';

export interface SubscriptionRow {
  uid: string;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  isActive: number;
}

export interface JobRow {
  id: string;
  uid: string;
  deviceId: string;
  executeAtMs: number;
  payloadJson: string;
  requestedAtMs: number;
  status: 'pending' | 'sending' | 'sent' | 'canceled' | 'failed';
  attempts: number;
}

export const createDb = (databasePath: string): Database => {
  const db = new Database(databasePath);

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS subscriptions (
      uid TEXT NOT NULL,
      device_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (uid, device_id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      device_id TEXT NOT NULL,
      execute_at_ms INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      requested_at_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS jobs_execute_at_idx ON jobs (status, execute_at_ms);

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      default_sets INTEGER NOT NULL,
      default_reps INTEGER NOT NULL,
      default_rest_time_s INTEGER NOT NULL,
      times_used INTEGER NOT NULL DEFAULT 0,
      created_by_uid TEXT,
      created_by_name TEXT,
      is_public INTEGER NOT NULL DEFAULT 1,
      muscle_group TEXT,
      video_json TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS exercises_normalized_name_idx ON exercises (normalized_name);
    CREATE INDEX IF NOT EXISTS exercises_public_idx ON exercises (is_public, created_by_uid);

    CREATE TABLE IF NOT EXISTS exercise_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id TEXT NOT NULL,
      source TEXT NOT NULL,
      old_exercise_id TEXT,
      old_name TEXT NOT NULL,
      normalized_old_name TEXT NOT NULL,
      uid TEXT,
      confidence REAL NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS exercise_aliases_old_id_idx ON exercise_aliases (old_exercise_id);
    CREATE INDEX IF NOT EXISTS exercise_aliases_name_idx ON exercise_aliases (normalized_old_name);
    CREATE INDEX IF NOT EXISTS exercise_aliases_uid_idx ON exercise_aliases (uid);

    CREATE TABLE IF NOT EXISTS user_exercise_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      display_name TEXT,
      default_sets INTEGER,
      default_reps INTEGER,
      default_rest_time_s INTEGER,
      notes TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      UNIQUE(uid, exercise_id)
    );

    CREATE INDEX IF NOT EXISTS user_exercise_defaults_uid_idx ON user_exercise_defaults (uid);

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      owner_uid TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      primary_muscle_group TEXT,
      times_used INTEGER NOT NULL DEFAULT 0,
      created_by_name TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS routines_owner_idx ON routines (owner_uid);
    CREATE INDEX IF NOT EXISTS routines_public_idx ON routines (is_public);

    CREATE TABLE IF NOT EXISTS user_hidden_public_routines (
      uid TEXT NOT NULL,
      routine_id TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (uid, routine_id)
    );

    CREATE INDEX IF NOT EXISTS user_hidden_public_routines_uid_idx ON user_hidden_public_routines (uid);

    CREATE TABLE IF NOT EXISTS routine_exercises (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      display_name TEXT,
      sets INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      rest_time_s INTEGER,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      UNIQUE(routine_id, position)
    );

    CREATE INDEX IF NOT EXISTS routine_exercises_routine_idx ON routine_exercises (routine_id);
    CREATE INDEX IF NOT EXISTS routine_exercises_exercise_idx ON routine_exercises (exercise_id);

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      routine_id TEXT,
      routine_name_snapshot TEXT NOT NULL,
      primary_muscle_group TEXT,
      started_at_ms INTEGER NOT NULL,
      completed_at_ms INTEGER,
      total_duration_min INTEGER,
      exercises_json TEXT,
      notes TEXT,
      last_updated_ms INTEGER,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS workout_sessions_user_idx ON workout_sessions (uid, started_at_ms);

    CREATE TABLE IF NOT EXISTS exercise_logs (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      date TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS exercise_logs_user_idx ON exercise_logs (uid, date);
    CREATE INDEX IF NOT EXISTS exercise_logs_exercise_idx ON exercise_logs (exercise_id);

    CREATE TABLE IF NOT EXISTS workouts (
      uid TEXT NOT NULL,
      id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (uid, id)
    );
  `);

  // Best-effort migration: older deployments had workouts(id PK) without uid.
  try {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(workouts)`).all();
    const hasUid = columns.some((col) => col.name === 'uid');
    if (!hasUid) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workouts_v2 (
          uid TEXT NOT NULL,
          id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY (uid, id)
        );
        INSERT INTO workouts_v2 (uid, id, payload_json, created_at_ms, updated_at_ms)
        SELECT 'system', id, payload_json, created_at_ms, updated_at_ms FROM workouts;
        DROP TABLE workouts;
        ALTER TABLE workouts_v2 RENAME TO workouts;
      `);
    }

    // Ensure index for current schema.
    db.exec(`CREATE INDEX IF NOT EXISTS workouts_uid_idx ON workouts (uid);`);
  } catch {
    // ignore migration failures (schema will still be created on fresh DBs)
  }

  // Best-effort migration: ensure jobs has requested_at_ms for command ordering.
  try {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(jobs)`).all();
    const hasRequestedAt = columns.some((col) => col.name === 'requested_at_ms');
    if (!hasRequestedAt) {
      db.exec(`ALTER TABLE jobs ADD COLUMN requested_at_ms INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`UPDATE jobs SET requested_at_ms = COALESCE(updated_at_ms, created_at_ms, 0) WHERE requested_at_ms = 0;`);
    }
  } catch {
    // ignore migration failures
  }

  return db;
};

export const upsertSubscription = (db: Database, args: {
  uid: string;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): void => {
  const now = Date.now();
  db.query(`
    INSERT INTO subscriptions (uid, device_id, endpoint, p256dh, auth, is_active, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(uid, device_id) DO UPDATE SET
      endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      is_active = 1,
      updated_at_ms = excluded.updated_at_ms
  `).run(args.uid, args.deviceId, args.endpoint, args.p256dh, args.auth, now, now);
};

export const getSubscription = (db: Database, uid: string, deviceId: string): SubscriptionRow | null => {
  const row = db.query<SubscriptionRow, [string, string]>(`
    SELECT uid, device_id as deviceId, endpoint, p256dh, auth, is_active as isActive
    FROM subscriptions
    WHERE uid = ? AND device_id = ?
    LIMIT 1
  `).get(uid, deviceId);

  return row ?? null;
};

export const deactivateSubscription = (db: Database, uid: string, deviceId: string): void => {
  const now = Date.now();
  db.query(`
    UPDATE subscriptions
    SET is_active = 0, updated_at_ms = ?
    WHERE uid = ? AND device_id = ?
  `).run(now, uid, deviceId);
};

export const upsertJob = (db: Database, args: {
  id: string;
  uid: string;
  deviceId: string;
  executeAtMs: number;
  payloadJson: string;
  requestedAtMs: number;
}): void => {
  const now = Date.now();
  db.query(`
    INSERT INTO jobs (id, uid, device_id, execute_at_ms, payload_json, requested_at_ms, status, attempts, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      uid = excluded.uid,
      device_id = excluded.device_id,
      execute_at_ms = excluded.execute_at_ms,
      payload_json = excluded.payload_json,
      requested_at_ms = excluded.requested_at_ms,
      status = 'pending',
      attempts = 0,
      updated_at_ms = excluded.updated_at_ms
    WHERE excluded.requested_at_ms >= jobs.requested_at_ms
  `).run(args.id, args.uid, args.deviceId, args.executeAtMs, args.payloadJson, args.requestedAtMs, now, now);
};

export const cancelRestJob = (db: Database, args: {
  id: string;
  uid: string;
  deviceId: string;
  requestedAtMs: number;
}): boolean => {
  const now = Date.now();
  const result = db.query(`
    INSERT INTO jobs (id, uid, device_id, execute_at_ms, payload_json, requested_at_ms, status, attempts, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, 0, '{}', ?, 'canceled', 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      uid = excluded.uid,
      device_id = excluded.device_id,
      execute_at_ms = 0,
      payload_json = '{}',
      requested_at_ms = excluded.requested_at_ms,
      status = 'canceled',
      attempts = 0,
      updated_at_ms = excluded.updated_at_ms
    WHERE excluded.requested_at_ms >= jobs.requested_at_ms
  `).run(args.id, args.uid, args.deviceId, args.requestedAtMs, now, now);

  return Number(result.changes ?? 0) > 0;
};

export const getDueJobs = (db: Database, nowMs: number, limit: number): JobRow[] => {
  return db.query<JobRow, [number, number]>(`
    SELECT
      id,
      uid,
      device_id as deviceId,
      execute_at_ms as executeAtMs,
      payload_json as payloadJson,
      requested_at_ms as requestedAtMs,
      status,
      attempts
    FROM jobs
    WHERE status = 'pending' AND execute_at_ms <= ?
    ORDER BY execute_at_ms ASC
    LIMIT ?
  `).all(nowMs, limit);
};

export const tryClaimJob = (
  db: Database,
  jobId: string,
  requestedAtMs: number,
  executeAtMs: number,
  nowMs: number
): boolean => {
  const now = Date.now();
  const result = db.query(`
    UPDATE jobs
    SET status = 'sending', updated_at_ms = ?
    WHERE id = ? AND status = 'pending' AND requested_at_ms = ? AND execute_at_ms = ? AND execute_at_ms <= ?
  `).run(now, jobId, requestedAtMs, executeAtMs, nowMs);

  return Number(result.changes ?? 0) === 1;
};

export const isJobClaimCurrent = (db: Database, jobId: string, requestedAtMs: number): boolean => {
  const row = db.query<{ status: string; requested_at_ms: number }, [string]>(`
    SELECT status, requested_at_ms FROM jobs WHERE id = ? LIMIT 1
  `).get(jobId);
  return !!row && row.status === 'sending' && row.requested_at_ms === requestedAtMs;
};

export const markJobSent = (db: Database, jobId: string, requestedAtMs: number): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'sent', updated_at_ms = ?
    WHERE id = ? AND status = 'sending' AND requested_at_ms = ?
  `).run(now, jobId, requestedAtMs);
};

export const markJobCanceled = (db: Database, jobId: string, requestedAtMs: number): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'canceled', updated_at_ms = ?
    WHERE id = ? AND status = 'sending' AND requested_at_ms = ?
  `).run(now, jobId, requestedAtMs);
};

export const rescheduleJob = (db: Database, jobId: string, requestedAtMs: number, nextExecuteAtMs: number, nextAttempts: number): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'pending', execute_at_ms = ?, attempts = ?, updated_at_ms = ?
    WHERE id = ? AND status = 'sending' AND requested_at_ms = ?
  `).run(nextExecuteAtMs, nextAttempts, now, jobId, requestedAtMs);
};

export const markJobFailed = (db: Database, jobId: string, requestedAtMs: number): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'failed', updated_at_ms = ?
    WHERE id = ? AND status = 'sending' AND requested_at_ms = ?
  `).run(now, jobId, requestedAtMs);
};
