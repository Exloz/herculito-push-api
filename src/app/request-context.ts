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

export const createRequestContext = (env: Env, db: Database): RequestContext => {
  const requireAuth = async (req: Request, meta?: RequestLogMeta): Promise<AuthContext> => {
    const auth = await requireClerkAuth(req, {
      issuer: env.clerkIssuer,
      jwksUrl: env.clerkJwksUrl,
      audience: env.clerkAudience
    });

    upsertUserProfile(db, {
      uid: auth.uid,
      email: auth.email,
      displayName: auth.displayName,
      avatarUrl: auth.avatarUrl
    });

    if (meta) {
      meta.uid = auth.uid;
    }

    return auth;
  };

  return { env, db, requireAuth };
};
