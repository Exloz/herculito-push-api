import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { json } from './http';

export interface AuthContext {
  uid: string;
  email?: string;
}

const getBearerToken = (req: Request): string | null => {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const getJwks = (jwksUrl: string) => {
  const cached = jwksCache.get(jwksUrl);
  if (cached) return cached;

  const created = createRemoteJWKSet(new URL(jwksUrl));
  jwksCache.set(jwksUrl, created);
  return created;
};

const toStringClaim = (payload: JWTPayload, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

export interface ClerkAuthOptions {
  issuer: string;
  jwksUrl: string;
  audience?: string[];
}

export const requireClerkAuth = async (req: Request, options: ClerkAuthOptions): Promise<AuthContext> => {
  const token = getBearerToken(req);
  if (!token) {
    throw json({ error: 'missing_auth' }, { status: 401 });
  }

  try {
    const verifyOptions: {
      issuer: string;
      audience?: string | string[];
      clockTolerance: string;
    } = {
      issuer: options.issuer,
      clockTolerance: '5s'
    };

    if (options.audience && options.audience.length > 0) {
      verifyOptions.audience = options.audience.length === 1 ? options.audience[0] : options.audience;
    }

    const { payload } = await jwtVerify(token, getJwks(options.jwksUrl), verifyOptions);

    const legacyUid = toStringClaim(payload, 'legacy_uid') ?? toStringClaim(payload, 'external_id');
    const uid = legacyUid
      ?? toStringClaim(payload, 'clerk_user_id')
      ?? toStringClaim(payload, 'user_id')
      ?? (typeof payload.sub === 'string' ? payload.sub : null);

    if (!uid) {
      throw new Error('Missing uid');
    }

    const email = toStringClaim(payload, 'email');

    return { uid, email };
  } catch {
    throw json({ error: 'invalid_auth' }, { status: 401 });
  }
};
