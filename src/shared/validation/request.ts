const MAX_COMMAND_CLOCK_DRIFT_MS = 5 * 60 * 1000;
const MAX_COMMAND_STALENESS_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_START_DRIFT_MS = 10 * 60 * 1000;
const MAX_COMPLETION_CLOCK_DRIFT_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_EXERCISES = 200;
const MAX_EXERCISE_SETS = 100;
const MAX_SET_WEIGHT = 5000;
const MAX_SETS = 30; // aligns with frontend
const MAX_REPS = 200; // aligns with frontend

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

  // Optional reps per set - validate if present (max 200 to align with frontend)
  if (set.reps !== undefined) {
    if (!isValidNumber(set.reps) || set.reps < 1 || set.reps > 200) {
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
): value is { id: string; name: string; sets: number; reps: number; repsBySet?: number[]; restTime?: number } => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.name)) return false;
  if (!isValidIntegerInRange(entry.sets, 1, MAX_SETS)) return false;
  if (!isValidIntegerInRange(entry.reps, 1, MAX_REPS)) return false;

  // Optional repsBySet - validate format if present; must have exactly 'sets' elements
  if (entry.repsBySet !== undefined) {
    if (!Array.isArray(entry.repsBySet)) return false;
    const setsCount = (entry.sets as number) || 0;
    if (entry.repsBySet.length !== setsCount) return false;
    for (const r of entry.repsBySet) {
      if (!isValidIntegerInRange(r, 1, MAX_REPS)) return false;
    }
  }

  if (entry.restTime !== undefined && !isValidIntegerInRange(entry.restTime, 0, 3600)) return false;
  return true;
};

export const isValidExerciseList = (
  value: unknown
): value is Array<{ id: string; name: string; sets: number; reps: number; repsBySet?: number[]; restTime?: number }> => {
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

// Validates reps-by-set updates payload: { [exerciseId]: number[] }
export const isValidRepsBySetUpdates = (value: unknown): value is Record<string, number[]> => {
  if (!value || typeof value !== 'object') return false;
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [exerciseId, repsArray] of entries) {
    if (!isNonEmptyString(exerciseId)) return false;
    if (!Array.isArray(repsArray)) return false;
    if (repsArray.length === 0) return false;
    if (repsArray.length > MAX_SETS) return false;
    for (const r of repsArray) {
      if (!isValidIntegerInRange(r, 1, MAX_REPS)) return false;
    }
  }
  return true;
};

// Body measurements validation constants
const MAX_BODY_WEIGHT_KG = 500;
const MAX_HEIGHT_CM = 300;
const MAX_BODY_FAT_PERCENTAGE = 100;
const MAX_BODY_MEASUREMENT_CM = 500;
const MAX_MEASUREMENT_NOTES_LENGTH = 500;

export const isValidMeasurementValue = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

export const sanitizeOptionalMeasurement = (
  value: unknown,
  maxValue: number
): number | null => {
  if (value === null || value === undefined) return null;
  if (!isValidMeasurementValue(value)) return null;
  if (value > maxValue) return maxValue;
  if (value < 0) return 0;
  return value;
};

export const isValidMeasurementNotes = (value: unknown): value is string | null => {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  return value.length <= MAX_MEASUREMENT_NOTES_LENGTH;
};

export const isValidMeasuredAtMs = (value: unknown): value is number => {
  if (!isValidNumber(value) || value <= 0) return false;
  const now = Date.now();
  const timestamp = Math.floor(value);
  // Allow up to 1 day in the future (for timezone differences)
  if (timestamp > now + 24 * 60 * 60 * 1000) return false;
  // Don't allow measurements from before 2020
  if (timestamp < new Date('2020-01-01').getTime()) return false;
  return true;
};

export interface BodyMeasurementInput {
  id?: string;
  measuredAt?: number;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPercentage?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  chestCm?: number | null;
  armsCm?: number | null;
  thighsCm?: number | null;
  calvesCm?: number | null;
  notes?: string | null;
}

export const sanitizeBodyMeasurementInput = (body: unknown): BodyMeasurementInput | null => {
  if (!body || typeof body !== 'object') return null;

  const input = body as Record<string, unknown>;

  // measuredAt is required
  if (!isValidMeasuredAtMs(input.measuredAt)) return null;

  const result: BodyMeasurementInput = {
    measuredAt: Math.floor(input.measuredAt),
  };

  // Optional fields
  if (input.id !== undefined && isNonEmptyString(input.id)) {
    result.id = input.id;
  }

  if (input.weightKg !== undefined) {
    result.weightKg = sanitizeOptionalMeasurement(input.weightKg, MAX_BODY_WEIGHT_KG);
  }
  if (input.heightCm !== undefined) {
    result.heightCm = sanitizeOptionalMeasurement(input.heightCm, MAX_HEIGHT_CM);
  }
  if (input.bodyFatPercentage !== undefined) {
    result.bodyFatPercentage = sanitizeOptionalMeasurement(input.bodyFatPercentage, MAX_BODY_FAT_PERCENTAGE);
  }
  if (input.waistCm !== undefined) {
    result.waistCm = sanitizeOptionalMeasurement(input.waistCm, MAX_BODY_MEASUREMENT_CM);
  }
  if (input.hipsCm !== undefined) {
    result.hipsCm = sanitizeOptionalMeasurement(input.hipsCm, MAX_BODY_MEASUREMENT_CM);
  }
  if (input.chestCm !== undefined) {
    result.chestCm = sanitizeOptionalMeasurement(input.chestCm, MAX_BODY_MEASUREMENT_CM);
  }
  if (input.armsCm !== undefined) {
    result.armsCm = sanitizeOptionalMeasurement(input.armsCm, MAX_BODY_MEASUREMENT_CM);
  }
  if (input.thighsCm !== undefined) {
    result.thighsCm = sanitizeOptionalMeasurement(input.thighsCm, MAX_BODY_MEASUREMENT_CM);
  }
  if (input.calvesCm !== undefined) {
    result.calvesCm = sanitizeOptionalMeasurement(input.calvesCm, MAX_BODY_MEASUREMENT_CM);
  }
  if (input.notes !== undefined) {
    const notes = typeof input.notes === 'string' ? input.notes.trim() : null;
    result.notes = notes && notes.length <= MAX_MEASUREMENT_NOTES_LENGTH ? notes : null;
  }

  return result;
};
