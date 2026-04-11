import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'bun:sqlite';
import { handleRestRoutes } from './routes';
import { createDb, getDueJobs, upsertSubscription } from '../../shared/persistence/sqlite';
import type { AppRouteContext } from '../../app/router';
import type { RequestLogMeta } from '../../app/logger';

const createMockContext = (db: Database): AppRouteContext => ({
  env: {
    port: 3000,
    databasePath: ':memory:',
    allowedOrigins: ['http://localhost:5173'],
    clerkIssuer: 'https://test.clerk.dev',
    clerkJwksUrl: 'https://test.clerk.dev/.well-known/jwks.json',
    clerkAudience: [],
    vapidSubject: 'mailto:test@example.com',
    vapidPublicKey: 'test-public-key',
    vapidPrivateKey: 'test-private-key'
  },
  db,
  requireAuth: vi.fn().mockResolvedValue({ uid: 'test-user', email: 'test@example.com' }),
  musclewiki: {
    suggest: vi.fn().mockResolvedValue([]),
    getVideos: vi.fn().mockResolvedValue(null)
  }
});

describe('handleRestRoutes', () => {
  let db: Database;
  let context: AppRouteContext;
  let meta: RequestLogMeta;

  beforeEach(() => {
    db = createDb(':memory:');
    context = createMockContext(db);
    meta = {
      requestId: 'req-rest-test',
      method: 'POST',
      path: '/v1/rest/schedule',
      startedAtMs: Date.now()
    };
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it('schedules a rest job for subscribed device', async () => {
    const now = Date.now();

    upsertSubscription(db, {
      uid: 'test-user',
      deviceId: 'device-a',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key'
    });

    const request = new Request('http://localhost/v1/rest/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        deviceId: 'device-a',
        seconds: 30,
        commandAtMs: now,
        title: 'title',
        body: 'body',
        url: 'https://herculito.exloz.site/workouts',
        tag: `rest-timer:${now}`
      })
    });

    const response = await handleRestRoutes(request, new URL(request.url), context, meta);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body.ok).toBe(true);

    const jobs = getDueJobs(db, Date.now() + 31_000, 10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe('test-user:device-a:rest');
    expect(jobs[0]?.requestedAtMs).toBe(now);
  });

  it('returns 409 when device is not subscribed', async () => {
    const request = new Request('http://localhost/v1/rest/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        deviceId: 'missing-device',
        seconds: 10,
        commandAtMs: 1000
      })
    });

    const response = await handleRestRoutes(request, new URL(request.url), context, meta);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(409);
    const body = await response?.json();
    expect(body.error).toBe('not_subscribed');
  });

  it('ignores stale cancel command older than latest schedule', async () => {
    const now = Date.now();

    upsertSubscription(db, {
      uid: 'test-user',
      deviceId: 'device-a',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key'
    });

    const scheduleRequest = new Request('http://localhost/v1/rest/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        deviceId: 'device-a',
        seconds: 60,
        commandAtMs: now
      })
    });

    await handleRestRoutes(scheduleRequest, new URL(scheduleRequest.url), context, meta);

    const cancelRequest = new Request('http://localhost/v1/rest/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        deviceId: 'device-a',
        commandAtMs: now - 1_000
      })
    });

    const cancelResponse = await handleRestRoutes(cancelRequest, new URL(cancelRequest.url), context, {
      ...meta,
      path: '/v1/rest/cancel'
    });

    expect(cancelResponse).not.toBeNull();
    expect(cancelResponse?.status).toBe(200);
    const cancelBody = await cancelResponse?.json();
    expect(cancelBody.ok).toBe(true);
    expect(cancelBody.canceled).toBe(false);
  });
});
