import type { Database } from 'bun:sqlite';
import {
  cleanupTerminalJobs,
  deactivateSubscription,
  getDueJobs,
  getSubscription,
  isJobClaimCurrent,
  markJobCanceled,
  markJobFailed,
  markJobSent,
  rescheduleJob,
  tryClaimJob
} from '../../shared/persistence/sqlite';
import { sendPush, type PushPayload, type PushSubscriptionLike } from '../../shared/push/web-push';
import { toErrorDetails } from '../../app/logger';

const SCHEDULER_BATCH_SIZE = 50;
const SCHEDULER_MAX_JOBS_PER_TICK = 200;
const TERMINAL_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_JOB_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const TERMINAL_JOB_CLEANUP_BATCH = 500;

const getRetryDelayMs = (attempts: number): number => {
  const base = 5_000;
  const delay = base * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(delay, 60_000);
};

export const startRestScheduler = (
  db: Database,
  logInfo: (payload: Record<string, unknown>) => void,
  logError: (payload: Record<string, unknown>) => void
): void => {
  let schedulerRunning = false;

  const schedulerTick = async (): Promise<void> => {
    const now = Date.now();
    let processed = 0;

    while (processed < SCHEDULER_MAX_JOBS_PER_TICK) {
      const due = getDueJobs(db, now, SCHEDULER_BATCH_SIZE);
      if (due.length === 0) return;

      for (const job of due) {
        if (!tryClaimJob(db, job.id, job.requestedAtMs, job.executeAtMs, now)) continue;
        processed += 1;

        try {
          if (!isJobClaimCurrent(db, job.id, job.requestedAtMs)) {
            continue;
          }

          const subscriptionRow = getSubscription(db, job.uid, job.deviceId);
          if (!subscriptionRow || subscriptionRow.isActive !== 1) {
            markJobCanceled(db, job.id, job.requestedAtMs);
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

          if (!isJobClaimCurrent(db, job.id, job.requestedAtMs)) {
            continue;
          }

          await sendPush(subscription, payload);
          markJobSent(db, job.id, job.requestedAtMs);
        } catch (error) {
          const err = error as { statusCode?: number } | undefined;
          const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;

          if (statusCode === 404 || statusCode === 410) {
            deactivateSubscription(db, job.uid, job.deviceId);
            markJobCanceled(db, job.id, job.requestedAtMs);
            continue;
          }

          const nextAttempts = job.attempts + 1;
          if (nextAttempts <= 3) {
            rescheduleJob(db, job.id, job.requestedAtMs, Date.now() + getRetryDelayMs(nextAttempts), nextAttempts);
          } else {
            markJobFailed(db, job.id, job.requestedAtMs);
          }
        }

        if (processed >= SCHEDULER_MAX_JOBS_PER_TICK) {
          return;
        }
      }
    }
  };

  setInterval(() => {
    if (schedulerRunning) {
      return;
    }

    schedulerRunning = true;
    void schedulerTick()
      .catch((error) => {
        logError({
          event: 'scheduler_error',
          ...toErrorDetails(error)
        });
      })
      .finally(() => {
        schedulerRunning = false;
      });
  }, 750);

  setInterval(() => {
    const removed = cleanupTerminalJobs(db, {
      olderThanMs: Date.now() - TERMINAL_JOB_RETENTION_MS,
      limit: TERMINAL_JOB_CLEANUP_BATCH
    });

    if (removed > 0) {
      logInfo({
        event: 'jobs_cleanup',
        removed
      });
    }
  }, TERMINAL_JOB_CLEANUP_INTERVAL_MS);
};
