import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSystemRoutes } from './routes';
import type { Database } from 'bun:sqlite';
import type { AppRouteContext } from '../../app/router';
import type { RequestLogMeta } from '../../app/logger';

const createMockDb = () => {
  return {
    query: vi.fn(() => ({
      get: vi.fn().mockReturnValue({ count: 1 }),
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

describe('handleSystemRoutes', () => {
  let mockDb: Database;
  let mockContext: AppRouteContext;
  let mockMeta: RequestLogMeta;

  beforeEach(() => {
    mockDb = createMockDb();
    mockContext = createMockContext(mockDb);
    mockMeta = {
      requestId: 'test-request-id',
      method: 'GET',
      path: '/health',
      startedAtMs: Date.now(),
    };
  });

  it('should handle health check', async () => {
    const request = new Request('http://localhost/health');
    const url = new URL('http://localhost/health');

    const mockQuery = vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ ok: 1 }),
    });
    mockDb.query = mockQuery;

    const response = await handleSystemRoutes(request, url, mockContext, mockMeta);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
  });

  it('should return 503 when database is unhealthy', async () => {
    const request = new Request('http://localhost/health');
    const url = new URL('http://localhost/health');

    const mockQuery = vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(null),
    });
    mockDb.query = mockQuery;

    const response = await handleSystemRoutes(request, url, mockContext, mockMeta);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
  });

  it('should return null for non-matching routes', async () => {
    const request = new Request('http://localhost/api/something');
    const url = new URL('http://localhost/api/something');

    const response = await handleSystemRoutes(request, url, mockContext, mockMeta);

    expect(response).toBeNull();
  });

  it('should return null for non-GET methods', async () => {
    const request = new Request('http://localhost/health', { method: 'POST' });
    const url = new URL('http://localhost/health');

    const response = await handleSystemRoutes(request, url, mockContext, mockMeta);

    expect(response).toBeNull();
  });
});
