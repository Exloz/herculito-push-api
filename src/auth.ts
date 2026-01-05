import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

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

const getFirebaseIssuer = (projectId: string): string => `https://securetoken.google.com/${projectId}`;

const jwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export const requireFirebaseAuth = async (req: Request, projectId: string): Promise<AuthContext> => {
  const token = getBearerToken(req);
  if (!token) {
    throw new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: getFirebaseIssuer(projectId),
      audience: projectId,
      clockTolerance: '5s'
    });

    const uid = typeof payload.user_id === 'string' ? payload.user_id : typeof payload.sub === 'string' ? payload.sub : null;
    if (!uid) {
      throw new Error('Missing uid');
    }

    const email = typeof (payload as JWTPayload & { email?: unknown }).email === 'string'
      ? (payload as JWTPayload & { email?: string }).email
      : undefined;

    return { uid, email };
  } catch {
    throw new Response(JSON.stringify({ error: 'invalid_auth' }), { status: 401 });
  }
};
