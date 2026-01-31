import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type ExportOptions = {
  serviceAccountPath: string;
  outputPath: string;
  collections: string[];
};

const getArgValue = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] ?? null;
};

const parseCollections = (value: string | null): string[] => {
  if (!value) {
    return ['exerciseTemplates', 'routines', 'workoutSessions', 'exerciseLogs'];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const resolveOptions = (): ExportOptions => {
  const serviceAccountPath =
    getArgValue('--service-account')
    ?? Bun.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ?? Bun.env.GOOGLE_APPLICATION_CREDENTIALS
    ?? 'serviceAccount.json';
  const outputPath = getArgValue('--out') ?? 'firestore-export.json';
  const collections = parseCollections(getArgValue('--collections'));

  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    throw new Error('Missing service account. Provide --service-account <path>, FIREBASE_SERVICE_ACCOUNT_PATH, GOOGLE_APPLICATION_CREDENTIALS, or place serviceAccount.json at repo root.');
  }

  return { serviceAccountPath, outputPath, collections };
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

const db = getFirestore();

const exportData: Record<string, unknown[]> = {};

for (const collectionName of options.collections) {
  const snapshot = await db.collection(collectionName).get();
  exportData[collectionName] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

writeFileSync(options.outputPath, JSON.stringify(exportData, null, 2));
console.log(`Exported collections to ${options.outputPath}`);
