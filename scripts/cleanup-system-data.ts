import { createDb } from '../src/db';

const getArgValue = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] ?? null;
};

const databasePath = getArgValue('--database') ?? Bun.env.DATABASE_PATH ?? '/data/push.sqlite';
const db = createDb(databasePath);

const SYSTEM_UID = 'system';

// Note: we intentionally delete routines created by these generic display names.

const execScalar = (sql: string, ...params: Array<string | number | null>) => {
  const row = db.query<{ value: number }, Array<string | number | null>>(sql).get(...params);
  return row?.value ?? 0;
};

const routinesToDelete = execScalar(
  `SELECT COUNT(1) as value FROM routines WHERE owner_uid = ?`,
  SYSTEM_UID
);

const exercisesToDelete = execScalar(
  `SELECT COUNT(1) as value FROM exercises WHERE created_by_uid = ?`,
  SYSTEM_UID
);

const junkPublicRoutinesToDelete = execScalar(
  `
    SELECT COUNT(1) as value
    FROM routines
    WHERE is_public = 1
      AND created_by_name IS NOT NULL
      AND LOWER(TRIM(REPLACE(created_by_name, CHAR(160), ' '))) IN ('sistema','usuario')
  `
);

db.exec('BEGIN');
try {
  // Routines
  db.query(`
    DELETE FROM routine_exercises
    WHERE routine_id IN (SELECT id FROM routines WHERE owner_uid = ?)
  `).run(SYSTEM_UID);

  db.query(`
    DELETE FROM routines
    WHERE owner_uid = ?
  `).run(SYSTEM_UID);

  // Junk public routines (even if user-owned)
  db.query(`
    DELETE FROM routine_exercises
    WHERE routine_id IN (
      SELECT id FROM routines
      WHERE is_public = 1
        AND created_by_name IS NOT NULL
        AND LOWER(TRIM(REPLACE(created_by_name, CHAR(160), ' '))) IN ('sistema','usuario')
    )
  `).run();
  db.query(`
    DELETE FROM routines
    WHERE is_public = 1
      AND created_by_name IS NOT NULL
      AND LOWER(TRIM(REPLACE(created_by_name, CHAR(160), ' '))) IN ('sistema','usuario')
  `).run();

  // Exercises
  db.query(`
    DELETE FROM user_exercise_defaults
    WHERE exercise_id IN (SELECT id FROM exercises WHERE created_by_uid = ?)
  `).run(SYSTEM_UID);

  db.query(`
    DELETE FROM exercise_aliases
    WHERE exercise_id IN (SELECT id FROM exercises WHERE created_by_uid = ?)
  `).run(SYSTEM_UID);

  db.query(`
    DELETE FROM exercises
    WHERE created_by_uid = ?
  `).run(SYSTEM_UID);

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log('Cleanup completed:', {
  databasePath,
  deletedSystemRoutines: routinesToDelete,
  deletedSystemExercises: exercisesToDelete,
  deletedJunkPublicRoutines: junkPublicRoutinesToDelete
});
