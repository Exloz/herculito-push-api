import { readFileSync, writeFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';

type FirebaseAuthUserExport = {
  legacy_firebase_uid: string;
  email?: string;
};

type ClerkUser = {
  id: string;
  external_id?: string | null;
};

type AuditReport = {
  totalLegacyUidsInData: number;
  totalFirebaseUsersInExport: number;
  totalClerkUsersWithExternalId: number;
  missingInClerk: string[];
  missingInFirebaseExport: string[];
};

const CLERK_API_BASE = 'https://api.clerk.com/v1';

const getArgValue = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] ?? null;
};

const databasePath = getArgValue('--database') ?? Bun.env.DATABASE_PATH ?? '/data/push.sqlite';
const inputPath = getArgValue('--input') ?? 'firebase-auth-users.json';
const reportPath = getArgValue('--report') ?? 'auth-migration-audit.json';

const clerkSecretKey = Bun.env.CLERK_SECRET_KEY;
if (!clerkSecretKey) {
  throw new Error('Missing CLERK_SECRET_KEY');
}

const collectLegacyUidsFromData = (db: Database): Set<string> => {
  const result = new Set<string>();

  const queries = [
    'SELECT DISTINCT uid AS uid FROM workouts',
    'SELECT DISTINCT uid AS uid FROM workout_sessions',
    'SELECT DISTINCT uid AS uid FROM exercise_logs',
    'SELECT DISTINCT owner_uid AS uid FROM routines',
    'SELECT DISTINCT uid AS uid FROM user_exercise_defaults',
    'SELECT DISTINCT uid AS uid FROM user_hidden_public_routines',
    'SELECT DISTINCT uid AS uid FROM subscriptions'
  ];

  for (const query of queries) {
    const rows = db.query<{ uid: string }, []>(query).all();
    for (const row of rows) {
      if (typeof row.uid === 'string' && row.uid.trim().length > 0) {
        result.add(row.uid);
      }
    }
  }

  return result;
};

const clerkRequest = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${CLERK_API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${clerkSecretKey}`,
      'content-type': 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Clerk API ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
};

const listAllClerkUsers = async (): Promise<ClerkUser[]> => {
  const users: ClerkUser[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const batch = await clerkRequest<ClerkUser[]>(`/users?limit=${limit}&offset=${offset}`);
    if (batch.length === 0) break;
    users.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }

  return users;
};

const db = new Database(databasePath);
const dataLegacyUids = collectLegacyUidsFromData(db);
db.close();

const firebaseRaw = readFileSync(inputPath, 'utf8');
const firebaseUsers = JSON.parse(firebaseRaw) as FirebaseAuthUserExport[];
const firebaseUidSet = new Set(
  firebaseUsers
    .map((entry) => entry.legacy_firebase_uid)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
);

const clerkUsers = await listAllClerkUsers();
const clerkExternalIdSet = new Set(
  clerkUsers
    .map((user) => user.external_id)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
);

const missingInClerk = Array.from(dataLegacyUids).filter((uid) => !clerkExternalIdSet.has(uid)).sort();
const missingInFirebaseExport = Array.from(dataLegacyUids).filter((uid) => !firebaseUidSet.has(uid)).sort();

const report: AuditReport = {
  totalLegacyUidsInData: dataLegacyUids.size,
  totalFirebaseUsersInExport: firebaseUidSet.size,
  totalClerkUsersWithExternalId: clerkExternalIdSet.size,
  missingInClerk,
  missingInFirebaseExport
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      ok: missingInClerk.length === 0,
      reportPath,
      ...report
    },
    null,
    2
  )
);

if (missingInClerk.length > 0) {
  process.exitCode = 1;
}
