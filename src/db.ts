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
  status: 'pending' | 'sending' | 'sent' | 'canceled' | 'failed';
  attempts: number;
}

export const createDb = (databasePath: string): Database => {
  const db = new Database(databasePath);

  db.exec(`
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
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS jobs_execute_at_idx ON jobs (status, execute_at_ms);
  `);

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
}): void => {
  const now = Date.now();
  db.query(`
    INSERT INTO jobs (id, uid, device_id, execute_at_ms, payload_json, status, attempts, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      execute_at_ms = excluded.execute_at_ms,
      payload_json = excluded.payload_json,
      status = 'pending',
      attempts = 0,
      updated_at_ms = excluded.updated_at_ms
  `).run(args.id, args.uid, args.deviceId, args.executeAtMs, args.payloadJson, now, now);
};

export const cancelJobsForDevice = (db: Database, uid: string, deviceId: string): number => {
  const now = Date.now();
  const result = db.query(`
    UPDATE jobs
    SET status = 'canceled', updated_at_ms = ?
    WHERE uid = ? AND device_id = ? AND status IN ('pending', 'sending')
  `).run(now, uid, deviceId);

  return Number(result.changes ?? 0);
};

export const getDueJobs = (db: Database, nowMs: number, limit: number): JobRow[] => {
  return db.query<JobRow, [number, number]>(`
    SELECT
      id,
      uid,
      device_id as deviceId,
      execute_at_ms as executeAtMs,
      payload_json as payloadJson,
      status,
      attempts
    FROM jobs
    WHERE status = 'pending' AND execute_at_ms <= ?
    ORDER BY execute_at_ms ASC
    LIMIT ?
  `).all(nowMs, limit);
};

export const tryClaimJob = (db: Database, jobId: string): boolean => {
  const now = Date.now();
  const result = db.query(`
    UPDATE jobs
    SET status = 'sending', updated_at_ms = ?
    WHERE id = ? AND status = 'pending'
  `).run(now, jobId);

  return Number(result.changes ?? 0) === 1;
};

export const markJobSent = (db: Database, jobId: string): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'sent', updated_at_ms = ?
    WHERE id = ?
  `).run(now, jobId);
};

export const markJobCanceled = (db: Database, jobId: string): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'canceled', updated_at_ms = ?
    WHERE id = ?
  `).run(now, jobId);
};

export const rescheduleJob = (db: Database, jobId: string, nextExecuteAtMs: number, nextAttempts: number): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'pending', execute_at_ms = ?, attempts = ?, updated_at_ms = ?
    WHERE id = ?
  `).run(nextExecuteAtMs, nextAttempts, now, jobId);
};

export const markJobFailed = (db: Database, jobId: string): void => {
  const now = Date.now();
  db.query(`
    UPDATE jobs
    SET status = 'failed', updated_at_ms = ?
    WHERE id = ?
  `).run(now, jobId);
};
