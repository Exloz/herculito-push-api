const MAX_COMMAND_CLOCK_DRIFT_MS = 5 * 60 * 1000;
const MAX_COMMAND_STALENESS_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_START_DRIFT_MS = 10 * 60 * 1000;
const MAX_COMPLETION_CLOCK_DRIFT_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_EXERCISES = 200;
const MAX_EXERCISE_SETS = 100;
const MAX_SET_WEIGHT = 5000;

export const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

export const isValidSeconds = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 60 * 60;
};

export const isValidLimit = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 20;
};

export const isValidSlug = (value: unknown): value is string => {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
};

export const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

export const isValidIntegerInRange = (value: unknown, min: number, max: number): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
};

export const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean';
};

export const isValidDateKey = (value: unknown): value is string => {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
};

export const sanitizeCommandAtMs = (value: unknown): number => {
  const now = Date.now();
  if (!isValidNumber(value) || value <= 0) {
    return now;
  }

  const timestamp = Math.floor(value);
  if (timestamp > now + MAX_COMMAND_CLOCK_DRIFT_MS) {
    return now;
  }

  if (timestamp < now - MAX_COMMAND_STALENESS_MS) {
    return now;
  }

  return timestamp;
};

export const sanitizeSessionStartedAtMs = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (!isValidNumber(value)) return undefined;
  const now = Date.now();
  const timestamp = Math.floor(value);
  if (Math.abs(now - timestamp) > MAX_SESSION_START_DRIFT_MS) {
    return now;
  }
  return timestamp;
};

export const sanitizeCompletedAtMs = (value: unknown): number => {
  const now = Date.now();
  if (!isValidNumber(value)) return now;
  const timestamp = Math.floor(value);
  if (timestamp > now + MAX_COMPLETION_CLOCK_DRIFT_MS) {
    return now;
  }
  return timestamp;
};

export const isValidSetPayload = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const set = value as Record<string, unknown>;

  if (set.setNumber !== undefined && !isValidIntegerInRange(set.setNumber, 1, 200)) {
    return false;
  }

  if (set.completed !== undefined && typeof set.completed !== 'boolean') {
    return false;
  }

  if (set.weight !== undefined) {
    if (!isValidNumber(set.weight) || set.weight < 0 || set.weight > MAX_SET_WEIGHT) {
      return false;
    }
  }

  if (set.completedAt !== undefined && set.completedAt !== null) {
    const completedAt = set.completedAt;
    if (typeof completedAt === 'number') {
      if (!Number.isFinite(completedAt) || completedAt <= 0) return false;
    } else if (typeof completedAt === 'string') {
      if (!Number.isFinite(Date.parse(completedAt))) return false;
    } else {
      return false;
    }
  }

  return true;
};

export const isValidSetsPayload = (value: unknown): value is unknown[] => {
  return Array.isArray(value)
    && value.length <= MAX_EXERCISE_SETS
    && value.every((entry) => isValidSetPayload(entry));
};

export const isValidSessionExercisePayload = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const exercise = value as Record<string, unknown>;
  if (!isNonEmptyString(exercise.exerciseId)) return false;
  if (!isValidSetsPayload(exercise.sets)) return false;
  return true;
};

export const isValidSessionExercisesPayload = (value: unknown): value is unknown[] => {
  return Array.isArray(value)
    && value.length <= MAX_SESSION_EXERCISES
    && value.every((exercise) => isValidSessionExercisePayload(exercise));
};

export const isValidExerciseEntry = (
  value: unknown
): value is { id: string; name: string; sets: number; reps: number; restTime?: number } => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.name)) return false;
  if (!isValidIntegerInRange(entry.sets, 1, 20)) return false;
  if (!isValidIntegerInRange(entry.reps, 1, 100)) return false;
  if (entry.restTime !== undefined && !isValidIntegerInRange(entry.restTime, 0, 3600)) return false;
  return true;
};

export const isValidExerciseList = (
  value: unknown
): value is Array<{ id: string; name: string; sets: number; reps: number; restTime?: number }> => {
  return Array.isArray(value) && value.every((entry) => isValidExerciseEntry(entry));
};

export const isValidLimitParam = (
  value: string | null,
  max: number,
  defaultWhenInvalid = max
): number | undefined => {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultWhenInvalid;
  return Math.min(max, Math.floor(parsed));
};
