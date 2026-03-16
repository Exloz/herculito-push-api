import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'bun:sqlite';
import {
  createDb,
  upsertSubscription,
  getSubscription,
  deactivateSubscription,
  upsertUserProfile,
  upsertJob,
  cancelRestJob,
  getDueJobs,
  tryClaimJob,
  isJobClaimCurrent,
  markJobSent,
  markJobCanceled,
  rescheduleJob,
  markJobFailed,
  cleanupTerminalJobs,
} from './sqlite';

describe('SQLite Database', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('createDb', () => {
    it('should create database with all required tables', () => {
      const tables = db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all();
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('subscriptions');
      expect(tableNames).toContain('jobs');
      expect(tableNames).toContain('exercises');
      expect(tableNames).toContain('exercise_aliases');
      expect(tableNames).toContain('user_exercise_defaults');
      expect(tableNames).toContain('routines');
      expect(tableNames).toContain('routine_exercises');
      expect(tableNames).toContain('workout_sessions');
      expect(tableNames).toContain('exercise_logs');
      expect(tableNames).toContain('workouts');
      expect(tableNames).toContain('user_profiles');
    });
  });

  describe('Subscriptions', () => {
    it('should upsert subscription', () => {
      upsertSubscription(db, {
        uid: 'user-123',
        deviceId: 'device-456',
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      });

      const subscription = getSubscription(db, 'user-123', 'device-456');
      expect(subscription).not.toBeNull();
      expect(subscription?.uid).toBe('user-123');
      expect(subscription?.deviceId).toBe('device-456');
      expect(subscription?.endpoint).toBe('https://fcm.googleapis.com/fcm/send/test');
      expect(subscription?.isActive).toBe(1);
    });

    it('should update existing subscription', () => {
      upsertSubscription(db, {
        uid: 'user-123',
        deviceId: 'device-456',
        endpoint: 'https://old.endpoint',
        p256dh: 'old-p256dh',
        auth: 'old-auth',
      });

      upsertSubscription(db, {
        uid: 'user-123',
        deviceId: 'device-456',
        endpoint: 'https://new.endpoint',
        p256dh: 'new-p256dh',
        auth: 'new-auth',
      });

      const subscription = getSubscription(db, 'user-123', 'device-456');
      expect(subscription?.endpoint).toBe('https://new.endpoint');
      expect(subscription?.p256dh).toBe('new-p256dh');
      expect(subscription?.isActive).toBe(1);
    });

    it('should deactivate subscription', () => {
      upsertSubscription(db, {
        uid: 'user-123',
        deviceId: 'device-456',
        endpoint: 'https://test.endpoint',
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      });

      deactivateSubscription(db, 'user-123', 'device-456');

      const subscription = getSubscription(db, 'user-123', 'device-456');
      expect(subscription?.isActive).toBe(0);
    });

    it('should return null for non-existent subscription', () => {
      const subscription = getSubscription(db, 'non-existent', 'device-456');
      expect(subscription).toBeNull();
    });
  });

  describe('User Profiles', () => {
    it('should upsert user profile', () => {
      upsertUserProfile(db, {
        uid: 'user-123',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      });

      const profile = db
        .query<
          { display_name: string; email: string; avatar_url: string },
          [string]
        >('SELECT display_name, email, avatar_url FROM user_profiles WHERE uid = ?')
        .get('user-123');

      expect(profile).not.toBeNull();
      expect(profile?.display_name).toBe('Test User');
      expect(profile?.email).toBe('test@example.com');
      expect(profile?.avatar_url).toBe('https://example.com/avatar.png');
    });

    it('should update profile when email is null', () => {
      upsertUserProfile(db, {
        uid: 'user-123',
        displayName: 'Test User',
        email: 'test@example.com',
      });

      upsertUserProfile(db, {
        uid: 'user-123',
        displayName: 'Updated User',
      });

      const profile = db
        .query<
          { display_name: string; email: string },
          [string]
        >('SELECT display_name, email FROM user_profiles WHERE uid = ?')
        .get('user-123');

      expect(profile?.display_name).toBe('Updated User');
      expect(profile?.email).toBe('test@example.com'); // Should preserve old email
    });
  });

  describe('Jobs', () => {
    it('should upsert job', () => {
      const now = Date.now();
      upsertJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        executeAtMs: now + 60000,
        payloadJson: JSON.stringify({ title: 'Test' }),
        requestedAtMs: now,
      });

      const jobs = getDueJobs(db, now + 120000, 10);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0].id).toBe('job-123');
      expect(jobs[0].status).toBe('pending');
    });

    it('should get due jobs', () => {
      const now = Date.now();
      upsertJob(db, {
        id: 'job-1',
        uid: 'user-1',
        deviceId: 'device-1',
        executeAtMs: now - 1000, // Already due
        payloadJson: '{}',
        requestedAtMs: now,
      });

      upsertJob(db, {
        id: 'job-2',
        uid: 'user-2',
        deviceId: 'device-2',
        executeAtMs: now + 60000, // Not due yet
        payloadJson: '{}',
        requestedAtMs: now,
      });

      const dueJobs = getDueJobs(db, now, 10);
      expect(dueJobs.length).toBe(1);
      expect(dueJobs[0].id).toBe('job-1');
    });

    it('should claim job', () => {
      const now = Date.now();
      upsertJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        executeAtMs: now,
        payloadJson: '{}',
        requestedAtMs: now,
      });

      const claimed = tryClaimJob(db, 'job-123', now, now, now);
      expect(claimed).toBe(true);

      const claimed2 = tryClaimJob(db, 'job-123', now, now, now);
      expect(claimed2).toBe(false); // Already claimed
    });

    it('should check if job claim is current', () => {
      const now = Date.now();
      upsertJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        executeAtMs: now,
        payloadJson: '{}',
        requestedAtMs: now,
      });

      expect(isJobClaimCurrent(db, 'job-123', now)).toBe(false); // Not claimed yet

      tryClaimJob(db, 'job-123', now, now, now);
      expect(isJobClaimCurrent(db, 'job-123', now)).toBe(true);
    });

    it('should mark job as sent', () => {
      const now = Date.now();
      upsertJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        executeAtMs: now,
        payloadJson: '{}',
        requestedAtMs: now,
      });

      tryClaimJob(db, 'job-123', now, now, now);
      markJobSent(db, 'job-123', now);

      const job = db
        .query<{ status: string }, [string]>('SELECT status FROM jobs WHERE id = ?')
        .get('job-123');
      expect(job?.status).toBe('sent');
    });

    it('should mark job as canceled', () => {
      const now = Date.now();
      upsertJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        executeAtMs: now,
        payloadJson: '{}',
        requestedAtMs: now,
      });

      tryClaimJob(db, 'job-123', now, now, now);
      markJobCanceled(db, 'job-123', now);

      const job = db
        .query<{ status: string }, [string]>('SELECT status FROM jobs WHERE id = ?')
        .get('job-123');
      expect(job?.status).toBe('canceled');
    });

    it('should reschedule job', () => {
      const now = Date.now();
      const newTime = now + 60000;
      upsertJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        executeAtMs: now,
        payloadJson: '{}',
        requestedAtMs: now,
      });

      tryClaimJob(db, 'job-123', now, now, now);
      rescheduleJob(db, 'job-123', now, newTime, 1);

      const job = db
        .query<{ status: string; execute_at_ms: number; attempts: number }, [string]>(
          'SELECT status, execute_at_ms, attempts FROM jobs WHERE id = ?'
        )
        .get('job-123');
      expect(job?.status).toBe('pending');
      expect(job?.execute_at_ms).toBe(newTime);
      expect(job?.attempts).toBe(1);
    });

    it('should mark job as failed', () => {
      const now = Date.now();
      upsertJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        executeAtMs: now,
        payloadJson: '{}',
        requestedAtMs: now,
      });

      tryClaimJob(db, 'job-123', now, now, now);
      markJobFailed(db, 'job-123', now);

      const job = db
        .query<{ status: string }, [string]>('SELECT status FROM jobs WHERE id = ?')
        .get('job-123');
      expect(job?.status).toBe('failed');
    });

    it('should cancel rest job', () => {
      const now = Date.now();
      const canceled = cancelRestJob(db, {
        id: 'job-123',
        uid: 'user-456',
        deviceId: 'device-789',
        requestedAtMs: now,
      });

      expect(canceled).toBe(true);

      const job = db
        .query<{ status: string }, [string]>('SELECT status FROM jobs WHERE id = ?')
        .get('job-123');
      expect(job?.status).toBe('canceled');
    });

    it('should cleanup terminal jobs', () => {
      const now = Date.now();
      const oldTime = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago

      // Insert old completed job
      upsertJob(db, {
        id: 'old-job',
        uid: 'user-1',
        deviceId: 'device-1',
        executeAtMs: oldTime,
        payloadJson: '{}',
        requestedAtMs: oldTime,
      });

      // Manually update to old completed status
      db.query('UPDATE jobs SET status = ?, updated_at_ms = ? WHERE id = ?').run(
        'sent',
        oldTime,
        'old-job'
      );

      const deleted = cleanupTerminalJobs(db, {
        olderThanMs: now - 7 * 24 * 60 * 60 * 1000,
        limit: 10,
      });

      expect(deleted).toBe(1);

      const job = db
        .query<{ id: string }, [string]>('SELECT id FROM jobs WHERE id = ?')
        .get('old-job');
      expect(job).toBeNull();
    });
  });
});
