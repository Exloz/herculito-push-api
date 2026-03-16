import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePushRoutes } from './routes';
import type { Database } from 'bun:sqlite';
import type { AppRouteContext } from '../../app/router';
import type { RequestLogMeta } from '../../app/logger';

const createMockDb = () => {
  return {
    query: vi.fn(() => ({
      get: vi.fn().mockReturnValue(null),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn().mockReturnValue({ changes: 1 }),
    })),
    exec: vi.fn(),
  } as unknown as Database;
};

const createMockContext = (db: Database): AppRouteContext => ({
  env: {
    port: 3000,
    databasePath: '/tmp/test.sqlite',
    allowedOrigins: ['http://localhost:5173'],
    clerkIssuer: 'https://test.clerk.dev',
    clerkJwksUrl: 'https://test.clerk.dev/.well-known/jwks.json',
    clerkAudience: [],
    vapidSubject: 'mailto:test@example.com',
    vapidPublicKey: 'test-public-key',
    vapidPrivateKey: 'test-private-key',
  },
  db,
  requireAuth: vi.fn().mockResolvedValue({ uid: 'test-user', email: 'test@example.com' }),
  musclewiki: {
    suggest: vi.fn().mockResolvedValue([]),
    getVideos: vi.fn().mockResolvedValue(null),
  },
});

describe('handlePushRoutes', () => {
  let mockDb: Database;
  let mockContext: AppRouteContext;
  let mockMeta: RequestLogMeta;

  beforeEach(() => {
    mockDb = createMockDb();
    mockContext = createMockContext(mockDb);
    mockMeta = {
      requestId: 'test-request-id',
      method: 'GET',
      path: '/v1/push/vapidPublicKey',
      startedAtMs: Date.now(),
    };
    vi.clearAllMocks();
  });

  describe('GET /v1/push/vapidPublicKey', () => {
    it('should return VAPID public key', async () => {
      const request = new Request('http://localhost/v1/push/vapidPublicKey');
      const url = new URL('http://localhost/v1/push/vapidPublicKey');

      const response = await handlePushRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.vapidPublicKey).toBe('test-public-key');
    });

    it('should return null for non-GET methods', async () => {
      const request = new Request('http://localhost/v1/push/vapidPublicKey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const url = new URL('http://localhost/v1/push/vapidPublicKey');

      const response = await handlePushRoutes(request, url, mockContext, mockMeta);

      expect(response).toBeNull();
    });
  });

  describe('POST /v1/push/subscribe', () => {
    it('should subscribe device successfully', async () => {
      const request = new Request('http://localhost/v1/push/subscribe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test',
            keys: {
              p256dh: 'test-p256dh-key',
              auth: 'test-auth-key',
            },
          },
        }),
      });
      const url = new URL('http://localhost/v1/push/subscribe');

      const mockQuery = vi.fn().mockReturnValue({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.query = mockQuery;

      const response = await handlePushRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.ok).toBe(true);
    });

    it('should return 400 for invalid deviceId', async () => {
      const request = new Request('http://localhost/v1/push/subscribe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          deviceId: '',
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test',
            keys: {
              p256dh: 'test-p256dh-key',
              auth: 'test-auth-key',
            },
          },
        }),
      });
      const url = new URL('http://localhost/v1/push/subscribe');

      const response = await handlePushRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(400);
      const body = await response?.json();
      expect(body.error).toBe('invalid_device_id');
    });

    it('should return 400 for invalid subscription', async () => {
      const request = new Request('http://localhost/v1/push/subscribe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          subscription: null,
        }),
      });
      const url = new URL('http://localhost/v1/push/subscribe');

      const response = await handlePushRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(400);
      const body = await response?.json();
      expect(body.error).toBe('invalid_subscription');
    });

    it('should return 400 for invalid subscription keys', async () => {
      const request = new Request('http://localhost/v1/push/subscribe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test',
            keys: {
              p256dh: '',
              auth: '',
            },
          },
        }),
      });
      const url = new URL('http://localhost/v1/push/subscribe');

      const response = await handlePushRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(400);
      const body = await response?.json();
      expect(body.error).toBe('invalid_subscription_keys');
    });

    it('should return null for non-matching routes', async () => {
      const request = new Request('http://localhost/v1/push/other');
      const url = new URL('http://localhost/v1/push/other');

      const response = await handlePushRoutes(request, url, mockContext, mockMeta);

      expect(response).toBeNull();
    });
  });
});
