import { getJsonBody, json, withCors } from '../../shared/http/http';
import { upsertUserProfile } from '../../shared/persistence/sqlite';
import { isNonEmptyString } from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type ProfileSyncBody = {
  displayName?: string;
  avatarUrl?: string;
  email?: string;
};

export const handleProfileRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'POST' && url.pathname === '/v1/data/profile') {
    const auth = await context.requireAuth(req, meta);
    const body = await getJsonBody<ProfileSyncBody>(req);

    const displayName = isNonEmptyString(body.displayName)
      ? body.displayName.trim()
      : auth.displayName;
    const avatarUrl = isNonEmptyString(body.avatarUrl)
      ? body.avatarUrl.trim()
      : auth.avatarUrl;
    const email = isNonEmptyString(body.email)
      ? body.email.trim().toLowerCase()
      : auth.email;

    upsertUserProfile(context.db, {
      uid: auth.uid,
      displayName,
      avatarUrl,
      email
    });

    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  return null;
};
