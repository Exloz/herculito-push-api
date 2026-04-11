import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRestScheduler } from './scheduler';
import { createDb, getSubscription, upsertJob, upsertSubscription } from '../../shared/persistence/sqlite';

vi.mock('../../shared/push/web-push', () => ({
  sendPush: vi.fn()
}));

import { sendPush } from '../../shared/push/web-push';

const sendPushMock = sendPush as unknown as ReturnType<typeof vi.fn>;

const getJobStatus = (db: Database, id: string): string | null => {
  const row = db.query<{ status: string }, [string]>('SELECT status FROM jobs WHERE id = ? LIMIT 1').get(id);
  return row?.status ?? null;
};

describe('startRestScheduler', () => {
  let db: Database;
  const logInfo = vi.fn();
  const logError = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    db = createDb(':memory:');
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  it('marks due jobs as sent after successful push', async () => {
    upsertSubscription(db, {
      uid: 'user-1',
      deviceId: 'device-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'p256dh',
      auth: 'auth'
    });

    upsertJob(db, {
      id: 'user-1:device-1:rest',
      uid: 'user-1',
      deviceId: 'device-1',
      executeAtMs: Date.now() - 100,
      payloadJson: JSON.stringify({ title: 'done' }),
      requestedAtMs: Date.now()
    });

    sendPushMock.mockResolvedValue(undefined);

    startRestScheduler(db, logInfo, logError);
    vi.advanceTimersByTime(800);
    await Promise.resolve();

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(getJobStatus(db, 'user-1:device-1:rest')).toBe('sent');
  });

  it('deactivates subscription and cancels job on 410 errors', async () => {
    upsertSubscription(db, {
      uid: 'user-2',
      deviceId: 'device-2',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'p256dh',
      auth: 'auth'
    });

    upsertJob(db, {
      id: 'user-2:device-2:rest',
      uid: 'user-2',
      deviceId: 'device-2',
      executeAtMs: Date.now() - 100,
      payloadJson: JSON.stringify({ title: 'done' }),
      requestedAtMs: Date.now()
    });

    sendPushMock.mockRejectedValue({ statusCode: 410 });

    startRestScheduler(db, logInfo, logError);
    vi.advanceTimersByTime(800);
    await Promise.resolve();

    const subscription = getSubscription(db, 'user-2', 'device-2');
    expect(subscription?.isActive).toBe(0);
    expect(getJobStatus(db, 'user-2:device-2:rest')).toBe('canceled');
  });
});
