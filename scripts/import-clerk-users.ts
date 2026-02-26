import { readFileSync, writeFileSync } from 'node:fs';

type ImportOptions = {
  inputPath: string;
  dryRun: boolean;
  reportPath: string;
};

type FirebaseAuthUserExport = {
  legacy_firebase_uid: string;
  email?: string;
  email_verified?: boolean;
  display_name?: string;
  photo_url?: string;
};

type ClerkUser = {
  id: string;
  external_id?: string | null;
  email_addresses?: Array<{
    email_address: string;
  }>;
};

type ImportReport = {
  totalInput: number;
  skippedNoEmail: number;
  created: number;
  updated: number;
  alreadyLinked: number;
  conflicts: number;
  errors: Array<{ uid: string; reason: string }>;
};

const CLERK_API_BASE = 'https://api.clerk.com/v1';

const getArgValue = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] ?? null;
};

const hasArg = (name: string): boolean => Bun.argv.includes(name);

const splitDisplayName = (value?: string): { firstName?: string; lastName?: string } => {
  if (!value) return {};
  const trimmed = value.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(/\s+/g);
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]
  };
};

const resolveOptions = (): ImportOptions => {
  return {
    inputPath: getArgValue('--input') ?? 'firebase-auth-users.json',
    dryRun: hasArg('--dry-run'),
    reportPath: getArgValue('--report') ?? 'clerk-import-report.json'
  };
};

const options = resolveOptions();

const clerkSecretKey = Bun.env.CLERK_SECRET_KEY;
if (!clerkSecretKey) {
  throw new Error('Missing CLERK_SECRET_KEY');
}

const getPrimaryEmail = (user: ClerkUser): string | null => {
  const email = user.email_addresses?.[0]?.email_address;
  if (!email || typeof email !== 'string') return null;
  return email.toLowerCase();
};

const clerkRequest = async <T>(
  path: string,
  init?: RequestInit,
  expectedStatusCodes: number[] = [200]
): Promise<T> => {
  const response = await fetch(`${CLERK_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${clerkSecretKey}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!expectedStatusCodes.includes(response.status)) {
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

const usersRaw = readFileSync(options.inputPath, 'utf8');
const firebaseUsers = JSON.parse(usersRaw) as FirebaseAuthUserExport[];

const clerkUsers = await listAllClerkUsers();
const clerkByExternalId = new Map<string, ClerkUser>();
const clerkByEmail = new Map<string, ClerkUser>();

for (const user of clerkUsers) {
  if (user.external_id && user.external_id.trim().length > 0) {
    clerkByExternalId.set(user.external_id, user);
  }

  const email = getPrimaryEmail(user);
  if (email) {
    clerkByEmail.set(email, user);
  }
}

const report: ImportReport = {
  totalInput: firebaseUsers.length,
  skippedNoEmail: 0,
  created: 0,
  updated: 0,
  alreadyLinked: 0,
  conflicts: 0,
  errors: []
};

for (const item of firebaseUsers) {
  const legacyUid = item.legacy_firebase_uid?.trim();
  const email = item.email?.trim().toLowerCase();

  if (!legacyUid) {
    report.errors.push({ uid: '', reason: 'missing legacy_firebase_uid' });
    continue;
  }

  if (!email) {
    report.skippedNoEmail += 1;
    continue;
  }

  const existingByExternalId = clerkByExternalId.get(legacyUid);
  if (existingByExternalId) {
    report.alreadyLinked += 1;
    continue;
  }

  const existingByEmail = clerkByEmail.get(email);
  if (existingByEmail) {
    if (existingByEmail.external_id && existingByEmail.external_id !== legacyUid) {
      report.conflicts += 1;
      report.errors.push({
        uid: legacyUid,
        reason: `email ${email} already linked to another external_id`
      });
      continue;
    }

    if (!options.dryRun) {
      await clerkRequest<ClerkUser>(
        `/users/${existingByEmail.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            external_id: legacyUid,
            image_url: item.photo_url ?? undefined
          })
        },
        [200]
      );
    }

    report.updated += 1;
    continue;
  }

  const { firstName, lastName } = splitDisplayName(item.display_name);

  if (!options.dryRun) {
    const created = await clerkRequest<ClerkUser>(
      '/users',
      {
        method: 'POST',
        body: JSON.stringify({
          external_id: legacyUid,
          email_address: [email],
          first_name: firstName,
          last_name: lastName,
          image_url: item.photo_url ?? undefined,
          skip_password_checks: true,
          skip_password_requirement: true
        })
      },
      [200, 201]
    );

    clerkByExternalId.set(legacyUid, created);
    clerkByEmail.set(email, created);
  }

  report.created += 1;
}

writeFileSync(options.reportPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      ok: report.errors.length === 0,
      dryRun: options.dryRun,
      reportPath: options.reportPath,
      ...report
    },
    null,
    2
  )
);
