import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

type ExportOptions = {
  serviceAccountPath: string;
  outputPath: string;
};

type FirebaseAuthUserExport = {
  legacy_firebase_uid: string;
  email?: string;
  email_verified: boolean;
  display_name?: string;
  photo_url?: string;
  google_provider_uid?: string;
};

const getArgValue = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] ?? null;
};

const resolveOptions = (): ExportOptions => {
  const serviceAccountPath = getArgValue('--service-account')
    ?? Bun.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ?? Bun.env.GOOGLE_APPLICATION_CREDENTIALS
    ?? 'serviceAccount.json';
  const outputPath = getArgValue('--out') ?? 'firebase-auth-users.json';

  if (!existsSync(serviceAccountPath)) {
    throw new Error(
      'Missing service account JSON. Use --service-account <path> or FIREBASE_SERVICE_ACCOUNT_PATH.'
    );
  }

  return { serviceAccountPath, outputPath };
};

const options = resolveOptions();
const serviceAccountJson = readFileSync(options.serviceAccountPath, 'utf8');
const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount & {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
  throw new Error('Invalid Firebase service account JSON');
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const extractGoogleProviderUid = (user: UserRecord): string | undefined => {
  const provider = user.providerData.find((entry) => entry.providerId === 'google.com');
  if (!provider || typeof provider.uid !== 'string' || provider.uid.trim().length === 0) {
    return undefined;
  }

  return provider.uid;
};

const toExportRecord = (user: UserRecord): FirebaseAuthUserExport => {
  return {
    legacy_firebase_uid: user.uid,
    email: user.email ?? undefined,
    email_verified: user.emailVerified,
    display_name: user.displayName ?? undefined,
    photo_url: user.photoURL ?? undefined,
    google_provider_uid: extractGoogleProviderUid(user)
  };
};

const auth = getAuth();
const exportedUsers: FirebaseAuthUserExport[] = [];
let pageToken: string | undefined;

do {
  const page = await auth.listUsers(1000, pageToken);
  exportedUsers.push(...page.users.map((user) => toExportRecord(user)));
  pageToken = page.pageToken;
} while (pageToken);

writeFileSync(options.outputPath, JSON.stringify(exportedUsers, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      exported: exportedUsers.length,
      outputPath: options.outputPath
    },
    null,
    2
  )
);
