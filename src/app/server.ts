import { createDb } from '../shared/persistence/sqlite';
import { loadEnv } from '../shared/config/env';
import { initWebPush } from '../shared/push/web-push';
import { json, withCors } from '../shared/http/http';
import { createMusclewikiService } from '../modules/musclewiki/service';
import { createRequestContext } from './request-context';
import { createAppRouter } from './router';
import {
  createRequestMeta,
  logError,
  logInfo,
  logRequestIn,
  logRequestOut,
  toErrorDetails
} from './logger';
import { startRestScheduler } from '../modules/rest/scheduler';

const env = loadEnv();
const db = createDb(env.databasePath);
const musclewiki = createMusclewikiService();
const requestContext = createRequestContext(env, db);

initWebPush({
  subject: env.vapidSubject,
  publicKey: env.vapidPublicKey,
  privateKey: env.vapidPrivateKey
});

startRestScheduler(db, logInfo, logError);

const handler = createAppRouter({
  ...requestContext,
  env,
  db,
  musclewiki
});

Bun.serve({
  port: env.port,
  fetch: async (req: Request) => {
    const url = new URL(req.url);
    const isHealth = req.method === 'GET' && url.pathname === '/health';

    if (isHealth) {
      try {
        return await handler(req);
      } catch (error) {
        if (error instanceof Response) {
          return withCors(req, error, env.allowedOrigins);
        }

        logError({
          event: 'api_error',
          requestId: 'health',
          method: req.method,
          path: url.pathname,
          ...toErrorDetails(error)
        });

        return withCors(req, json({ error: 'internal_error' }, { status: 500 }), env.allowedOrigins);
      }
    }

    const meta = createRequestMeta(req);
    logRequestIn(meta);

    try {
      const response = await handler(req, meta);
      logRequestOut(meta, response.status);
      return response;
    } catch (error) {
      if (error instanceof Response) {
        const response = withCors(req, error, env.allowedOrigins);
        logRequestOut(meta, response.status);
        return response;
      }

      logError({
        event: 'api_error',
        requestId: meta.requestId,
        method: meta.method,
        path: meta.path,
        uid: meta.uid,
        durationMs: Date.now() - meta.startedAtMs,
        ...toErrorDetails(error)
      });

      const response = withCors(req, json({ error: 'internal_error' }, { status: 500 }), env.allowedOrigins);
      logRequestOut(meta, response.status);
      return response;
    }
  }
});
