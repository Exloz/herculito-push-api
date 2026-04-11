import { getJsonBody, json, withCors } from '../../shared/http/http';
import { getSubscription, upsertJob, cancelRestJob } from '../../shared/persistence/sqlite';
import type { PushPayload } from '../../shared/push/web-push';
import {
  isNonEmptyString,
  isValidSeconds,
  sanitizeCommandAtMs
} from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type ScheduleBody = {
  deviceId: string;
  seconds: number;
  commandAtMs?: number;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

type CancelBody = {
  deviceId: string;
  commandAtMs?: number;
};

const makeRestJobId = (uid: string, deviceId: string): string => `${uid}:${deviceId}:rest`;

export const handleRestRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'POST' && url.pathname === '/v1/rest/schedule') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<ScheduleBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    if (!isValidSeconds(body.seconds)) {
      return withCors(req, json({ error: 'invalid_seconds' }, { status: 400 }), context.env.allowedOrigins);
    }

    const subscriptionRow = getSubscription(context.db, uid, body.deviceId);
    if (!subscriptionRow || subscriptionRow.isActive !== 1) {
      return withCors(req, json({ error: 'not_subscribed' }, { status: 409 }), context.env.allowedOrigins);
    }

    const payload: PushPayload = {
      title: isNonEmptyString(body.title) ? body.title : '¡Descanso terminado!',
      body: isNonEmptyString(body.body) ? body.body : 'Continúa con tu entrenamiento.',
      url: isNonEmptyString(body.url) ? body.url : 'https://herculito.exloz.site',
      tag: isNonEmptyString(body.tag) ? body.tag : 'rest-timer'
    };

    const jobId = makeRestJobId(uid, body.deviceId);
    const executeAtMs = Date.now() + Math.round(body.seconds * 1000);
    const requestedAtMs = sanitizeCommandAtMs(body.commandAtMs);

    upsertJob(context.db, {
      id: jobId,
      uid,
      deviceId: body.deviceId,
      executeAtMs,
      payloadJson: JSON.stringify(payload),
      requestedAtMs
    });

    return withCors(req, json({ ok: true, jobId, executeAtMs, requestedAtMs }), context.env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/rest/cancel') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<CancelBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), context.env.allowedOrigins);
    }

    const requestedAtMs = sanitizeCommandAtMs(body.commandAtMs);
    const jobId = makeRestJobId(uid, body.deviceId);
    const canceled = cancelRestJob(context.db, {
      id: jobId,
      uid,
      deviceId: body.deviceId,
      requestedAtMs
    });

    return withCors(req, json({ ok: true, canceled, jobId, requestedAtMs }), context.env.allowedOrigins);
  }

  return null;
};
