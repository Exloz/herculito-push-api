import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleProfileRoutes } from './routes';
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

describe('handleProfileRoutes', () => {
  let mockDb: Database;
  let mockContext: AppRouteContext;
  let mockMeta: RequestLogMeta;

  beforeEach(() => {
    mockDb = createMockDb();
    mockContext = createMockContext(mockDb);
    mockMeta = {
      requestId: 'test-request-id',
      method: 'GET',
      path: '/v1/data/profile/measurements',
      startedAtMs: Date.now(),
    };
    vi.clearAllMocks();
  });

  describe('GET /v1/data/profile/measurements', () => {
    it('should return measurements list', async () => {
      const mockMeasurements = [
        {
          id: 'm1',
          uid: 'test-user',
          measuredAtMs: Date.now(),
          weightKg: 75,
          heightCm: 180,
          bodyFatPercentage: 15,
          waistCm: 85,
          hipsCm: 95,
          chestCm: 100,
          armsCm: 35,
          thighsCm: 55,
          calvesCm: 38,
          notes: 'Test',
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        },
      ];

      mockDb.query = vi.fn(() => ({
        all: vi.fn().mockReturnValue(mockMeasurements),
      })) as unknown as typeof mockDb.query;

      const request = new Request('http://localhost/v1/data/profile/measurements');
      const url = new URL('http://localhost/v1/data/profile/measurements');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);

      const body = await response?.json();
      expect(body.measurements).toEqual(mockMeasurements);
    });
  });

  describe('POST /v1/data/profile/measurements', () => {
    it('should create new measurement', async () => {
      mockDb.query = vi.fn(() => ({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      })) as unknown as typeof mockDb.query;

      const request = new Request('http://localhost/v1/data/profile/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measuredAt: Date.now(),
          weightKg: 75.5,
          heightCm: 180,
        }),
      });
      const url = new URL('http://localhost/v1/data/profile/measurements');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);

      const body = await response?.json();
      expect(body.ok).toBe(true);
      expect(body.id).toBeDefined();
    });

    it('should return 400 for invalid measurement data', async () => {
      const request = new Request('http://localhost/v1/data/profile/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required measuredAt
          weightKg: 75.5,
        }),
      });
      const url = new URL('http://localhost/v1/data/profile/measurements');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(400);

      const body = await response?.json();
      expect(body.error).toBe('invalid_measurement_data');
    });

    it('should update existing measurement when id provided', async () => {
      mockDb.query = vi.fn(() => ({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      })) as unknown as typeof mockDb.query;

      const request = new Request('http://localhost/v1/data/profile/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'existing-id',
          measuredAt: Date.now(),
          weightKg: 76,
        }),
      });
      const url = new URL('http://localhost/v1/data/profile/measurements');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);

      const body = await response?.json();
      expect(body.ok).toBe(true);
      expect(body.updated).toBe(true);
    });

    it('should return 404 when updating non-existent measurement', async () => {
      mockDb.query = vi.fn(() => ({
        run: vi.fn().mockReturnValue({ changes: 0 }),
      })) as unknown as typeof mockDb.query;

      const request = new Request('http://localhost/v1/data/profile/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'non-existent',
          measuredAt: Date.now(),
          weightKg: 76,
        }),
      });
      const url = new URL('http://localhost/v1/data/profile/measurements');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(404);

      const body = await response?.json();
      expect(body.error).toBe('measurement_not_found');
    });
  });

  describe('DELETE /v1/data/profile/measurements/:id', () => {
    it('should delete measurement', async () => {
      mockDb.query = vi.fn(() => ({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      })) as unknown as typeof mockDb.query;

      const request = new Request('http://localhost/v1/data/profile/measurements/m1', {
        method: 'DELETE',
      });
      const url = new URL('http://localhost/v1/data/profile/measurements/m1');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);

      const body = await response?.json();
      expect(body.ok).toBe(true);
    });

    it('should return 404 for non-existent measurement', async () => {
      mockDb.query = vi.fn(() => ({
        run: vi.fn().mockReturnValue({ changes: 0 }),
      })) as unknown as typeof mockDb.query;

      const request = new Request('http://localhost/v1/data/profile/measurements/non-existent', {
        method: 'DELETE',
      });
      const url = new URL('http://localhost/v1/data/profile/measurements/non-existent');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(404);

      const body = await response?.json();
      expect(body.error).toBe('measurement_not_found');
    });

    it('should return 400 for invalid measurement id', async () => {
      const request = new Request('http://localhost/v1/data/profile/measurements/', {
        method: 'DELETE',
      });
      const url = new URL('http://localhost/v1/data/profile/measurements/');

      const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(400);

      const body = await response?.json();
      expect(body.error).toBe('invalid_measurement_id');
    });
  });

  it('should return null for non-matching routes', async () => {
    const request = new Request('http://localhost/v1/data/other');
    const url = new URL('http://localhost/v1/data/other');

    const response = await handleProfileRoutes(request, url, mockContext, mockMeta);

    expect(response).toBeNull();
  });
});
