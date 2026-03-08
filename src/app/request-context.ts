import type { Database } from 'bun:sqlite';
import { requireClerkAuth, type AuthContext } from '../shared/auth/clerk-auth';
import type { Env } from '../shared/config/env';
import { upsertUserProfile } from '../shared/persistence/sqlite';
import type { RequestLogMeta } from './logger';

export interface RequestContext {
  env: Env;
  db: Database;
  requireAuth: (req: Request, meta?: RequestLogMeta) => Promise<AuthContext>;
}

const PROFILE_SYNC_TTL_MS = 5 * 60 * 1000;

const recentProfileSyncCache = new Map<string, { signature: string; syncedAt: number }>();

const shouldSyncProfile = (auth: AuthContext): boolean => {
  const signature = JSON.stringify({
    email: auth.email ?? null,
    displayName: auth.displayName ?? null,
    avatarUrl: auth.avatarUrl ?? null
  });
  const cached = recentProfileSyncCache.get(auth.uid);
  const now = Date.now();

  if (cached && cached.signature === signature && now - cached.syncedAt < PROFILE_SYNC_TTL_MS) {
    return false;
  }

  recentProfileSyncCache.set(auth.uid, { signature, syncedAt: now });
  return true;
};

export const createRequestContext = (env: Env, db: Database): RequestContext => {
  const requireAuth = async (req: Request, meta?: RequestLogMeta): Promise<AuthContext> => {
    const auth = await requireClerkAuth(req, {
      issuer: env.clerkIssuer,
      jwksUrl: env.clerkJwksUrl,
      audience: env.clerkAudience
    });

    if (shouldSyncProfile(auth)) {
      upsertUserProfile(db, {
        uid: auth.uid,
        email: auth.email,
        displayName: auth.displayName,
        avatarUrl: auth.avatarUrl
      });
    }

    if (meta) {
      meta.uid = auth.uid;
    }

    return auth;
  };

  return { env, db, requireAuth };
};
