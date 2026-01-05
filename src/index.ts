import { loadEnv } from './env';
import { corsPreflight, getJsonBody, json, withCors } from './http';
import { requireFirebaseAuth } from './auth';
import {
  cancelJobsForDevice,
  createDb,
  deactivateSubscription,
  getDueJobs,
  getSubscription,
  markJobCanceled,
  markJobFailed,
  markJobSent,
  rescheduleJob,
  tryClaimJob,
  upsertJob,
  upsertSubscription
} from './db';
import { initWebPush, sendPush, type PushPayload, type PushSubscriptionLike } from './push';

const env = loadEnv();
const db = createDb(env.databasePath);

initWebPush({
  subject: env.vapidSubject,
  publicKey: env.vapidPublicKey,
  privateKey: env.vapidPrivateKey
});

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

type ScheduleBody = {
  deviceId: string;
  seconds: number;
  title?: string;
  body?: string;
  url?: string;
};

type CancelBody = {
  deviceId: string;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isValidSeconds = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 60 * 60;
};

const makeRestJobId = (uid: string, deviceId: string): string => `${uid}:${deviceId}:rest`;

type RequestLogMeta = {
  requestId: string;
  method: string;
  path: string;
  startedAtMs: number;
};

const logInfo = (payload: Record<string, unknown>): void => {
  console.log(
    JSON.stringify({
      level: 'info',
      ts: new Date().toISOString(),
      ...payload
    })
  );
};


const logRequestIn = (meta: RequestLogMeta): void => {
  logInfo({
    event: 'api_in',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path
  });
};

const logRequestOut = (meta: RequestLogMeta, status: number): void => {
  logInfo({
    event: 'api_out',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    status,
    durationMs: Date.now() - meta.startedAtMs
  });
};

const schedulerTick = async (): Promise<void> => {
  const now = Date.now();
  const due = getDueJobs(db, now, 20);
  if (due.length === 0) return;

  for (const job of due) {
    if (!tryClaimJob(db, job.id)) continue;

    try {
      const subscriptionRow = getSubscription(db, job.uid, job.deviceId);
      if (!subscriptionRow || subscriptionRow.isActive !== 1) {
        markJobCanceled(db, job.id);
        continue;
      }

      const subscription: PushSubscriptionLike = {
        endpoint: subscriptionRow.endpoint,
        keys: {
          p256dh: subscriptionRow.p256dh,
          auth: subscriptionRow.auth
        }
      };

      const payload = JSON.parse(job.payloadJson) as PushPayload;
      await sendPush(subscription, payload);
      markJobSent(db, job.id);
    } catch (error) {
      const err = error as unknown as { statusCode?: number };
      const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;

      if (statusCode === 404 || statusCode === 410) {
        deactivateSubscription(db, job.uid, job.deviceId);
        markJobCanceled(db, job.id);
        continue;
      }

      const nextAttempts = job.attempts + 1;
      if (nextAttempts <= 3) {
        rescheduleJob(db, job.id, Date.now() + 5_000, nextAttempts);
      } else {
        markJobFailed(db, job.id);
      }


    }
  }
};

setInterval(() => {
  void schedulerTick();
}, 750);

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return corsPreflight(req, env.allowedOrigins);
  }

  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname === '/health') {
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/push/vapidPublicKey') {
    return withCors(req, json({ vapidPublicKey: env.vapidPublicKey }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/push/subscribe') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<SubscribeBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), env.allowedOrigins);
    }

    if (!body.subscription || !isNonEmptyString(body.subscription.endpoint)) {
      return withCors(req, json({ error: 'invalid_subscription' }, { status: 400 }), env.allowedOrigins);
    }

    const keys = body.subscription.keys;
    if (!keys || !isNonEmptyString(keys.p256dh) || !isNonEmptyString(keys.auth)) {
      return withCors(req, json({ error: 'invalid_subscription_keys' }, { status: 400 }), env.allowedOrigins);
    }

    upsertSubscription(db, {
      uid,
      deviceId: body.deviceId,
      endpoint: body.subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth
    });

    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/rest/schedule') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<ScheduleBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), env.allowedOrigins);
    }

    if (!isValidSeconds(body.seconds)) {
      return withCors(req, json({ error: 'invalid_seconds' }, { status: 400 }), env.allowedOrigins);
    }

    const subscriptionRow = getSubscription(db, uid, body.deviceId);
    if (!subscriptionRow || subscriptionRow.isActive !== 1) {
      return withCors(req, json({ error: 'not_subscribed' }, { status: 409 }), env.allowedOrigins);
    }

    const payload: PushPayload = {
      title: isNonEmptyString(body.title) ? body.title : '¡Descanso terminado!',
      body: isNonEmptyString(body.body) ? body.body : 'Continúa con tu entrenamiento.',
      url: isNonEmptyString(body.url) ? body.url : 'https://herculito.exloz.site',
      tag: 'rest-timer'
    };

    const jobId = makeRestJobId(uid, body.deviceId);
    const executeAtMs = Date.now() + Math.round(body.seconds * 1000);

    upsertJob(db, {
      id: jobId,
      uid,
      deviceId: body.deviceId,
      executeAtMs,
      payloadJson: JSON.stringify(payload)
    });

    return withCors(req, json({ ok: true, jobId, executeAtMs }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/rest/cancel') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<CancelBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), env.allowedOrigins);
    }

    const canceled = cancelJobsForDevice(db, uid, body.deviceId);
    return withCors(req, json({ ok: true, canceled }), env.allowedOrigins);
  }

  return withCors(req, json({ error: 'not_found' }, { status: 404 }), env.allowedOrigins);
};

Bun.serve({
  port: env.port,
  fetch: async (req: Request) => {
    const startedAtMs = Date.now();
    const url = new URL(req.url);

    const isHealth = req.method === 'GET' && url.pathname === '/health';
    if (isHealth) {
      try {
        return await handler(req);
      } catch (error) {
        if (error instanceof Response) {
          return withCors(req, error, env.allowedOrigins);
        }

        return withCors(req, json({ error: 'internal_error' }, { status: 500 }), env.allowedOrigins);
      }
    }

    const meta: RequestLogMeta = {
      requestId: globalThis.crypto?.randomUUID?.() ?? `req_${startedAtMs}_${Math.random().toString(16).slice(2)}`,
      method: req.method,
      path: url.pathname,
      startedAtMs
    };

    logRequestIn(meta);

    try {
      const res = await handler(req);
      logRequestOut(meta, res.status);
      return res;
    } catch (error) {
      if (error instanceof Response) {
        const res = withCors(req, error, env.allowedOrigins);
        logRequestOut(meta, res.status);
        return res;
      }

      const res = withCors(req, json({ error: 'internal_error' }, { status: 500 }), env.allowedOrigins);
      logRequestOut(meta, res.status);
      return res;
    }
  }
});
