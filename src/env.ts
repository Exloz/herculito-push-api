export interface Env {
  port: number;
  databasePath: string;
  allowedOrigins: string[];
  clerkIssuer: string;
  clerkJwksUrl: string;
  clerkAudience: string[];
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

const parseCsv = (value: string | undefined): string[] => {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeIssuer = (issuer: string): string => issuer.endsWith('/') ? issuer.slice(0, -1) : issuer;

const resolveClerkJwksUrl = (issuer: string): string => {
  const explicit = Bun.env.CLERK_JWKS_URL;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }

  return `${normalizeIssuer(issuer)}/.well-known/jwks.json`;
};

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

  const clerkIssuer = normalizeIssuer(requireEnv('CLERK_ISSUER'));

  return {
    port,
    databasePath: Bun.env.DATABASE_PATH ?? '/data/push.sqlite',
    allowedOrigins: parseAllowedOrigins(Bun.env.ALLOWED_ORIGINS),
    clerkIssuer,
    clerkJwksUrl: resolveClerkJwksUrl(clerkIssuer),
    clerkAudience: parseCsv(Bun.env.CLERK_AUDIENCE),
    vapidSubject: requireEnv('VAPID_SUBJECT'),
    vapidPublicKey: requireEnv('VAPID_PUBLIC_KEY'),
    vapidPrivateKey: requireEnv('VAPID_PRIVATE_KEY')
  };
};
