import { getJsonBody, json, withCors } from '../../shared/http/http';
import { upsertSubscription } from '../../shared/persistence/sqlite';
import { isNonEmptyString } from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type SubscribeBody = {
  deviceId: string;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
};

export const handlePushRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/push/vapidPublicKey') {
    return withCors(req, json({ vapidPublicKey: context.env.vapidPublicKey }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/push/subscribe') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<SubscribeBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    if (!body.subscription || !isNonEmptyString(body.subscription.endpoint)) {
      return withCors(req, json({ error: 'invalid_subscription' }, { status: 400 }), context.env.allowedOrigins);
    }

    const keys = body.subscription.keys;
    if (!keys || !isNonEmptyString(keys.p256dh) || !isNonEmptyString(keys.auth)) {
      return withCors(req, json({ error: 'invalid_subscription_keys' }, { status: 400 }), context.env.allowedOrigins);
    }

    upsertSubscription(context.db, {
      uid,
      deviceId: body.deviceId,
      endpoint: body.subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth
    });

    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  return null;
};
