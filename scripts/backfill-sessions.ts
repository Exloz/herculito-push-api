import { createDb } from '../src/shared/persistence/sqlite';

const getArgValue = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] ?? null;
};

const databasePath = getArgValue('--database') ?? Bun.env.DATABASE_PATH ?? '/data/push.sqlite';
const db = createDb(databasePath);

// Safe JSON parse helper
const safeJsonParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

// Helper to get date string from timestamp (UTC YYYY-MM-DD)
const getDateString = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return date.toISOString().split('T')[0];
};

type SessionRow = {
  id: string;
  uid: string;
  started_at_ms: number;
  total_duration_min: number | null;
  exercises_json: string | null;
};

type WorkoutSet = {
  completedAt?: string | number;
  completed?: boolean;
  weight?: number;
  setNumber?: number;
};

type ExerciseLog = {
  exerciseId: string;
  sets: WorkoutSet[];
  completedAt?: string | number;
};

// Get all incomplete sessions
const incompleteSessions = db.query<SessionRow, []>(`
  SELECT id, uid, started_at_ms, total_duration_min, exercises_json
  FROM workout_sessions
  WHERE completed_at_ms IS NULL
`).all();

console.log(`Found ${incompleteSessions.length} incomplete sessions to evaluate`);

let backfilledCount = 0;
let skippedCount = 0;

for (const session of incompleteSessions) {
  let completedAtMs: number | null = null;
  let backfillReason = '';

  // Criterion 1: total_duration_min exists and > 0
  if (session.total_duration_min && session.total_duration_min > 0) {
    completedAtMs = session.started_at_ms + (session.total_duration_min * 60 * 1000);
    backfillReason = 'total_duration';
  }

  // Criterion 2: exercises_json has sets with completedAt timestamps
  if (!completedAtMs && session.exercises_json) {
    const exercises = safeJsonParse<ExerciseLog[]>(session.exercises_json);
    if (exercises && Array.isArray(exercises)) {
      let maxCompletedAt: number | null = null;

      for (const exercise of exercises) {
        if (exercise.sets && Array.isArray(exercise.sets)) {
          for (const set of exercise.sets) {
            if (set.completedAt) {
              let setCompletedAtMs: number | null = null;
              if (typeof set.completedAt === 'number') {
                setCompletedAtMs = set.completedAt < 1e12 ? set.completedAt * 1000 : set.completedAt;
              } else if (typeof set.completedAt === 'string') {
                const parsed = Date.parse(set.completedAt);
                if (Number.isFinite(parsed)) {
                  setCompletedAtMs = parsed;
                }
              }

              if (setCompletedAtMs && (!maxCompletedAt || setCompletedAtMs > maxCompletedAt)) {
                maxCompletedAt = setCompletedAtMs;
              }
            }
          }
        }
      }

      if (maxCompletedAt) {
        completedAtMs = maxCompletedAt;
        backfillReason = 'exercise_completedAt';
      }
    }
  }

  // Criterion 3: Check for exercise_logs on the same date
  if (!completedAtMs) {
    const sessionDate = getDateString(session.started_at_ms);

    const logExists = db.query<{ count: number }, [string, string]>(`
      SELECT COUNT(1) as count
      FROM exercise_logs
      WHERE uid = ? AND date = ?
      LIMIT 1
    `).get(session.uid, sessionDate);

    if (logExists && logExists.count > 0) {
      completedAtMs = session.started_at_ms;
      backfillReason = 'exercise_log_exists';
    }
  }

  if (completedAtMs) {
    // Update the session
    db.query(`
      UPDATE workout_sessions
      SET completed_at_ms = ?, updated_at_ms = ?
      WHERE id = ? AND uid = ?
    `).run(completedAtMs, Date.now(), session.id, session.uid);

    backfilledCount++;
    console.log(`Backfilled session ${session.id}: ${backfillReason} -> ${completedAtMs}`);
  } else {
    skippedCount++;
  }
}

console.log('Backfill completed:', {
  databasePath,
  totalIncomplete: incompleteSessions.length,
  backfilled: backfilledCount,
  skipped: skippedCount
});
