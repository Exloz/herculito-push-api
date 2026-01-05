export interface Env {
  port: number;
  databasePath: string;
  allowedOrigins: string[];
  firebaseProjectId: string;
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

const parseAllowedOrigins = (value: string | undefined): string[] => {
  if (!value) {
    return [
      'https://herculito.exloz.site',
      'http://localhost:5173',
      'http://localhost:4173'
    ];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const requireEnv = (name: string): string => {
  const value = Bun.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const loadEnv = (): Env => {
  const port = Number(Bun.env.PORT ?? '3000');
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Invalid PORT');
  }

  return {
    port,
    databasePath: Bun.env.DATABASE_PATH ?? '/data/push.sqlite',
    allowedOrigins: parseAllowedOrigins(Bun.env.ALLOWED_ORIGINS),
    firebaseProjectId: requireEnv('FIREBASE_PROJECT_ID'),
    vapidSubject: requireEnv('VAPID_SUBJECT'),
    vapidPublicKey: requireEnv('VAPID_PUBLIC_KEY'),
    vapidPrivateKey: requireEnv('VAPID_PRIVATE_KEY')
  };
};
