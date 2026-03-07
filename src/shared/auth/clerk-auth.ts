import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { json } from '../http/http';

export interface AuthContext {
  uid: string;
  clerkUserId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
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

const joinNameParts = (firstName?: string, lastName?: string): string | undefined => {
  const first = firstName?.trim() ?? '';
  const last = lastName?.trim() ?? '';
  if (!first && !last) return undefined;
  return `${first} ${last}`.trim();
};

const resolveDisplayName = (payload: JWTPayload): string | undefined => {
  const firstName = toStringClaim(payload, 'first_name') ?? toStringClaim(payload, 'given_name');
  const lastName = toStringClaim(payload, 'last_name') ?? toStringClaim(payload, 'family_name');

  return toStringClaim(payload, 'name')
    ?? toStringClaim(payload, 'full_name')
    ?? joinNameParts(firstName, lastName);
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

    const resolvedClerkUserId = toStringClaim(payload, 'clerk_user_id')
      ?? toStringClaim(payload, 'user_id')
      ?? (typeof payload.sub === 'string' ? payload.sub : null);
    const legacyUid = toStringClaim(payload, 'legacy_uid') ?? toStringClaim(payload, 'external_id');
    const uid = legacyUid ?? resolvedClerkUserId;

    if (!uid || !resolvedClerkUserId) {
      throw new Error('Missing uid');
    }

    const email = toStringClaim(payload, 'email');
    const displayName = resolveDisplayName(payload);
    const avatarUrl = toStringClaim(payload, 'picture') ?? toStringClaim(payload, 'image_url');

    return { uid, clerkUserId: resolvedClerkUserId, email, displayName, avatarUrl };
  } catch {
    throw json({ error: 'invalid_auth' }, { status: 401 });
  }
};
