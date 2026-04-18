import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'bun:sqlite';

import {
  completeSession,
  getCompetitiveLeaderboard,
  getDashboardData,
  startSession,
} from './data-store';
import { createDb, upsertUserProfile } from './sqlite';

const atUtc = (year: number, month: number, day: number, hour = 12, minute = 0): number => {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
};

const insertCompletedSportSession = (
  db: Database,
  input: {
    id: string;
    uid: string;
    sportType: 'archery' | 'hiit';
    startedAt: number;
    completedAt: number;
  },
): void => {
  db.query(`
    INSERT INTO sport_sessions (
      id, uid, sport_type, location, notes, started_at_ms, completed_at_ms, status,
      archery_data_json, created_at_ms, updated_at_ms
    )
    VALUES (?, ?, ?, NULL, NULL, ?, ?, 'completed', NULL, ?, ?)
  `).run(
    input.id,
    input.uid,
    input.sportType,
    input.startedAt,
    input.completedAt,
    input.startedAt,
    input.completedAt,
  );
};

const insertCompletedWorkoutSession = (
  db: Database,
  input: {
    id: string;
    uid: string;
    routineId: string;
    routineName: string;
    startedAt: number;
    completedAt: number;
    totalDuration: number;
  },
): void => {
  const session = startSession(db, input.uid, {
    id: input.id,
    routineId: input.routineId,
    routineName: input.routineName,
    primaryMuscleGroup: 'fullbody',
    startedAt: input.startedAt,
  });

  completeSession(db, input.uid, session.id, [], input.completedAt, input.totalDuration);
};

describe('dashboard mixed activity', () => {
  let db: Database;

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-18T12:00:00.000Z').getTime());
    db = createDb(':memory:');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it('counts completed sport sessions in dashboard summary and streaks', () => {
    insertCompletedWorkoutSession(db, {
      id: 'workout-today',
      uid: 'user-1',
      routineId: 'routine-1',
      routineName: 'Push',
      startedAt: atUtc(2026, 4, 18, 11, 20),
      completedAt: atUtc(2026, 4, 18, 12, 0),
      totalDuration: 40,
    });

    insertCompletedSportSession(db, {
      id: 'sport-yesterday',
      uid: 'user-1',
      sportType: 'hiit',
      startedAt: atUtc(2026, 4, 17, 10, 30),
      completedAt: atUtc(2026, 4, 17, 11, 0),
    });

    insertCompletedWorkoutSession(db, {
      id: 'workout-last-week',
      uid: 'user-1',
      routineId: 'routine-2',
      routineName: 'Legs',
      startedAt: atUtc(2026, 4, 10, 9, 10),
      completedAt: atUtc(2026, 4, 10, 10, 0),
      totalDuration: 50,
    });

    const dashboard = getDashboardData(db, 'user-1');

    expect(dashboard.summary).toEqual({
      totalWorkouts: 3,
      thisWeekWorkouts: 2,
      thisMonthWorkouts: 3,
      currentStreak: 2,
      longestStreak: 2,
      averageDurationMin: 40,
    });
  });

  it('counts completed sport sessions in weekly and monthly leaderboard', () => {
    upsertUserProfile(db, { uid: 'user-a', displayName: 'Ana' });
    upsertUserProfile(db, { uid: 'user-b', displayName: 'Beto' });

    insertCompletedWorkoutSession(db, {
      id: 'ana-workout',
      uid: 'user-a',
      routineId: 'routine-a',
      routineName: 'Upper',
      startedAt: atUtc(2026, 4, 16, 11, 0),
      completedAt: atUtc(2026, 4, 16, 11, 45),
      totalDuration: 45,
    });
    insertCompletedSportSession(db, {
      id: 'ana-sport',
      uid: 'user-a',
      sportType: 'archery',
      startedAt: atUtc(2026, 4, 17, 9, 0),
      completedAt: atUtc(2026, 4, 17, 10, 0),
    });

    insertCompletedWorkoutSession(db, {
      id: 'beto-workout',
      uid: 'user-b',
      routineId: 'routine-b',
      routineName: 'Lower',
      startedAt: atUtc(2026, 4, 16, 8, 0),
      completedAt: atUtc(2026, 4, 16, 8, 50),
      totalDuration: 50,
    });
    insertCompletedSportSession(db, {
      id: 'beto-sport-1',
      uid: 'user-b',
      sportType: 'hiit',
      startedAt: atUtc(2026, 4, 11, 7, 30),
      completedAt: atUtc(2026, 4, 11, 8, 0),
    });
    insertCompletedSportSession(db, {
      id: 'beto-sport-2',
      uid: 'user-b',
      sportType: 'archery',
      startedAt: atUtc(2026, 4, 10, 7, 0),
      completedAt: atUtc(2026, 4, 10, 8, 0),
    });

    const leaderboard = getCompetitiveLeaderboard(db, 'user-a', 10);

    expect(leaderboard.week.top[0]).toMatchObject({
      userId: 'user-a',
      name: 'Ana',
      totalWorkouts: 2,
      position: 1,
    });
    expect(leaderboard.week.currentUser).toMatchObject({
      userId: 'user-a',
      totalWorkouts: 2,
      position: 1,
    });

    expect(leaderboard.month.top[0]).toMatchObject({
      userId: 'user-b',
      name: 'Beto',
      totalWorkouts: 3,
      position: 1,
    });
    expect(leaderboard.month.currentUser).toMatchObject({
      userId: 'user-a',
      totalWorkouts: 2,
      position: 2,
    });
  });
});
