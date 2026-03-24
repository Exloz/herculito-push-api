import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from './sqlite';
import type { Database } from 'bun:sqlite';
import { completeSession } from './data-store';

describe('completeSession', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('repsBySetUpdates security', () => {
    it('should NOT update repsBySet for routines owned by another user', () => {
      // Setup: user1 creates a routine
      const user1 = 'user1';
      const user2 = 'user2';
      const routineId = 'routine-1';

      db.query(`
        INSERT INTO routines (id, owner_uid, name, created_at_ms, updated_at_ms)
        VALUES (?, ?, 'Test Routine', ?, ?)
      `).run(routineId, user1, Date.now(), Date.now());

      db.query(`
        INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets, reps, created_at_ms, updated_at_ms)
        VALUES (?, ?, 'ex-1', 0, 4, 10, ?, ?)
      `).run(`re-${routineId}-ex1`, routineId, Date.now(), Date.now());

      // Setup: user2 has a session for user1's routine
      const sessionId = 'session-1';
      db.query(`
        INSERT INTO workout_sessions (id, uid, routine_id, routine_name_snapshot, started_at_ms, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, 'Test Session', ?, ?, ?)
      `).run(sessionId, user2, routineId, Date.now(), Date.now(), Date.now());

      const exercises = [{ exerciseId: 'ex-1', sets: [{ setNumber: 1, weight: 100, completed: true, reps: 12 }] }];
      const repsBySetUpdates = { 'ex-1': [12, 10, 8, 6] };

      // User2 tries to complete session with repsBySetUpdates
      completeSession(db, user2, sessionId, exercises, Date.now(), 45, repsBySetUpdates);

      // Verify: the routine_exercises should NOT have been updated
      // because user2 doesn't own the routine
      const routineExercise = db.query<{ reps_by_set_json: string | null }, [string, string]>(`
        SELECT reps_by_set_json FROM routine_exercises WHERE routine_id = ? AND exercise_id = ?
      `).get(routineId, 'ex-1');

      expect(routineExercise?.reps_by_set_json).toBeNull();
    });

    it('should update repsBySet for routines owned by the same user', () => {
      const user1 = 'user1';
      const routineId = 'routine-1';

      db.query(`
        INSERT INTO routines (id, owner_uid, name, created_at_ms, updated_at_ms)
        VALUES (?, ?, 'Test Routine', ?, ?)
      `).run(routineId, user1, Date.now(), Date.now());

      db.query(`
        INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets, reps, created_at_ms, updated_at_ms)
        VALUES (?, ?, 'ex-1', 0, 4, 10, ?, ?)
      `).run(`re-${routineId}-ex1`, routineId, Date.now(), Date.now());

      const sessionId = 'session-1';
      db.query(`
        INSERT INTO workout_sessions (id, uid, routine_id, routine_name_snapshot, started_at_ms, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, 'Test Session', ?, ?, ?)
      `).run(sessionId, user1, routineId, Date.now(), Date.now(), Date.now());

      const exercises = [{ exerciseId: 'ex-1', sets: [{ setNumber: 1, weight: 100, completed: true, reps: 12 }] }];
      const repsBySetUpdates = { 'ex-1': [12, 10, 8, 6] };

      completeSession(db, user1, sessionId, exercises, Date.now(), 45, repsBySetUpdates);

      // Verify: the routine_exercises SHOULD have been updated
      const routineExercise = db.query<{ reps_by_set_json: string | null }, [string, string]>(`
        SELECT reps_by_set_json FROM routine_exercises WHERE routine_id = ? AND exercise_id = ?
      `).get(routineId, 'ex-1');

      expect(routineExercise?.reps_by_set_json).toBe('[12,10,8,6]');
    });

    it('should not update repsBySet when routine does not exist', () => {
      const user1 = 'user1';
      const sessionId = 'session-1';

      // Session with no routine
      db.query(`
        INSERT INTO workout_sessions (id, uid, routine_id, routine_name_snapshot, started_at_ms, created_at_ms, updated_at_ms)
        VALUES (?, ?, NULL, 'Test Session', ?, ?, ?)
      `).run(sessionId, user1, Date.now(), Date.now(), Date.now());

      const exercises = [{ exerciseId: 'ex-1', sets: [{ setNumber: 1, weight: 100, completed: true, reps: 12 }] }];
      const repsBySetUpdates = { 'ex-1': [12, 10, 8, 6] };

      // Should not throw even with no routine
      expect(() => completeSession(db, user1, sessionId, exercises, Date.now(), 45, repsBySetUpdates)).not.toThrow();
    });

    it('should ignore repsBySet updates when their length does not match routine sets', () => {
      const user1 = 'user1';
      const routineId = 'routine-1';

      db.query(`
        INSERT INTO routines (id, owner_uid, name, created_at_ms, updated_at_ms)
        VALUES (?, ?, 'Test Routine', ?, ?)
      `).run(routineId, user1, Date.now(), Date.now());

      db.query(`
        INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets, reps, created_at_ms, updated_at_ms)
        VALUES (?, ?, 'ex-1', 0, 4, 10, ?, ?)
      `).run(`re-${routineId}-ex1`, routineId, Date.now(), Date.now());

      const sessionId = 'session-1';
      db.query(`
        INSERT INTO workout_sessions (id, uid, routine_id, routine_name_snapshot, started_at_ms, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, 'Test Session', ?, ?, ?)
      `).run(sessionId, user1, routineId, Date.now(), Date.now(), Date.now());

      completeSession(
        db,
        user1,
        sessionId,
        [{ exerciseId: 'ex-1', sets: [{ setNumber: 1, weight: 100, completed: true, reps: 12 }] }],
        Date.now(),
        45,
        { 'ex-1': [12, 10] }
      );

      const routineExercise = db.query<{ reps_by_set_json: string | null }, [string, string]>(`
        SELECT reps_by_set_json FROM routine_exercises WHERE routine_id = ? AND exercise_id = ?
      `).get(routineId, 'ex-1');

      expect(routineExercise?.reps_by_set_json).toBeNull();
    });
  });
});
