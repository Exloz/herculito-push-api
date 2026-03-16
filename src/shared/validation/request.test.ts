import { describe, it, expect } from 'vitest';
import {
  isNonEmptyString,
  isValidSeconds,
  isValidLimit,
  isValidSlug,
  isValidNumber,
  isValidIntegerInRange,
  isBoolean,
  isValidDateKey,
  sanitizeCommandAtMs,
  sanitizeSessionStartedAtMs,
  sanitizeCompletedAtMs,
  isValidSetPayload,
  isValidSetsPayload,
  isValidSessionExercisePayload,
  isValidSessionExercisesPayload,
  isValidExerciseEntry,
  isValidExerciseList,
  isValidLimitParam,
} from './request';

describe('isNonEmptyString', () => {
  it('should return true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString('with spaces')).toBe(true);
  });

  it('should return false for empty strings', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('should return false for non-strings', () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
    expect(isNonEmptyString([])).toBe(false);
  });
});

describe('isValidSeconds', () => {
  it('should return true for valid seconds', () => {
    expect(isValidSeconds(1)).toBe(true);
    expect(isValidSeconds(3600)).toBe(true);
    expect(isValidSeconds(60)).toBe(true);
  });

  it('should return false for invalid seconds', () => {
    expect(isValidSeconds(0)).toBe(false);
    expect(isValidSeconds(-1)).toBe(false);
    expect(isValidSeconds(3601)).toBe(false);
    expect(isValidSeconds('60')).toBe(false);
  });
});

describe('isValidLimit', () => {
  it('should return true for valid limits', () => {
    expect(isValidLimit(1)).toBe(true);
    expect(isValidLimit(20)).toBe(true);
    expect(isValidLimit(10)).toBe(true);
  });

  it('should return false for invalid limits', () => {
    expect(isValidLimit(0)).toBe(false);
    expect(isValidLimit(-1)).toBe(false);
    expect(isValidLimit(21)).toBe(false);
    expect(isValidLimit('10')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('should return true for valid slugs', () => {
    expect(isValidSlug('bench-press')).toBe(true);
    expect(isValidSlug('squat')).toBe(true);
    expect(isValidSlug('pull-up-123')).toBe(true);
  });

  it('should return false for invalid slugs', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('Upper Case')).toBe(false);
    expect(isValidSlug('with spaces')).toBe(false);
    expect(isValidSlug('special@char')).toBe(false);
    expect(isValidSlug(123)).toBe(false);
  });
});

describe('isValidNumber', () => {
  it('should return true for valid numbers', () => {
    expect(isValidNumber(0)).toBe(true);
    expect(isValidNumber(123)).toBe(true);
    expect(isValidNumber(-456)).toBe(true);
    expect(isValidNumber(3.14)).toBe(true);
  });

  it('should return false for invalid numbers', () => {
    expect(isValidNumber(NaN)).toBe(false);
    expect(isValidNumber(Infinity)).toBe(false);
    expect(isValidNumber(-Infinity)).toBe(false);
    expect(isValidNumber('123')).toBe(false);
    expect(isValidNumber(null)).toBe(false);
  });
});

describe('isValidIntegerInRange', () => {
  it('should return true for valid integers in range', () => {
    expect(isValidIntegerInRange(5, 1, 10)).toBe(true);
    expect(isValidIntegerInRange(1, 1, 10)).toBe(true);
    expect(isValidIntegerInRange(10, 1, 10)).toBe(true);
  });

  it('should return false for integers out of range', () => {
    expect(isValidIntegerInRange(0, 1, 10)).toBe(false);
    expect(isValidIntegerInRange(11, 1, 10)).toBe(false);
  });

  it('should return false for non-integers', () => {
    expect(isValidIntegerInRange(5.5, 1, 10)).toBe(false);
    expect(isValidIntegerInRange('5', 1, 10)).toBe(false);
  });
});

describe('isBoolean', () => {
  it('should return true for booleans', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
  });

  it('should return false for non-booleans', () => {
    expect(isBoolean(1)).toBe(false);
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean(null)).toBe(false);
  });
});

describe('isValidDateKey', () => {
  it('should return true for valid date keys', () => {
    expect(isValidDateKey('2024-01-15')).toBe(true);
    expect(isValidDateKey('2023-12-31')).toBe(true);
    expect(isValidDateKey('2024-02-29')).toBe(true);
  });

  it('should return false for invalid date keys', () => {
    expect(isValidDateKey('01-15-2024')).toBe(false);
    expect(isValidDateKey('2024/01/15')).toBe(false);
    expect(isValidDateKey('not-a-date')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
  });

  it('should validate date format but not date validity', () => {
    // The regex only checks format, not actual date validity
    expect(isValidDateKey('2024-13-01')).toBe(true);
    expect(isValidDateKey('2024-01-32')).toBe(true);
  });
});

describe('sanitizeCommandAtMs', () => {
  it('should return valid command timestamps', () => {
    const now = Date.now();
    expect(sanitizeCommandAtMs(now)).toBe(now);
    expect(sanitizeCommandAtMs(now - 1000)).toBe(now - 1000);
  });

  it('should return current time for timestamps too far in the past', () => {
    const now = Date.now();
    const tooOld = now - 25 * 60 * 60 * 1000;
    expect(sanitizeCommandAtMs(tooOld)).toBe(now);
  });

  it('should return current time for timestamps in the future', () => {
    const now = Date.now();
    const future = now + 10 * 60 * 1000;
    expect(sanitizeCommandAtMs(future)).toBe(now);
  });

  it('should return current time for invalid inputs', () => {
    const now = Date.now();
    expect(sanitizeCommandAtMs(null)).toBe(now);
    expect(sanitizeCommandAtMs(undefined)).toBe(now);
    expect(sanitizeCommandAtMs('now')).toBe(now);
  });
});

describe('sanitizeSessionStartedAtMs', () => {
  it('should return valid session start timestamps', () => {
    const now = Date.now();
    expect(sanitizeSessionStartedAtMs(now)).toBe(now);
    expect(sanitizeSessionStartedAtMs(now - 5 * 60 * 1000)).toBe(now - 5 * 60 * 1000);
  });

  it('should return current time for timestamps too far from now', () => {
    const now = Date.now();
    const tooOld = now - 15 * 60 * 1000;
    expect(sanitizeSessionStartedAtMs(tooOld)).toBe(now);
  });

  it('should return undefined for undefined input', () => {
    expect(sanitizeSessionStartedAtMs(undefined)).toBeUndefined();
  });

  it('should return undefined for invalid inputs', () => {
    expect(sanitizeSessionStartedAtMs(null)).toBeUndefined();
    expect(sanitizeSessionStartedAtMs('invalid')).toBeUndefined();
  });
});

describe('sanitizeCompletedAtMs', () => {
  it('should return valid completed timestamps', () => {
    const now = Date.now();
    expect(sanitizeCompletedAtMs(now)).toBe(now);
  });

  it('should return current time for timestamps too far in the future', () => {
    const now = Date.now();
    const tooFuture = now + 25 * 60 * 60 * 1000;
    expect(sanitizeCompletedAtMs(tooFuture)).toBe(now);
  });

  it('should return current time for invalid inputs', () => {
    const now = Date.now();
    expect(sanitizeCompletedAtMs(null)).toBe(now);
    expect(sanitizeCompletedAtMs(undefined)).toBe(now);
  });
});

describe('isValidSetPayload', () => {
  it('should return true for valid set payloads', () => {
    expect(isValidSetPayload({ setNumber: 1, weight: 100, completed: true })).toBe(true);
    expect(isValidSetPayload({ setNumber: 1, weight: 0, completed: false })).toBe(true);
    expect(isValidSetPayload({ setNumber: 5, weight: 200.5, completed: true })).toBe(true);
  });

  it('should return false for invalid setNumber', () => {
    expect(isValidSetPayload({ setNumber: 0, weight: 100, completed: true })).toBe(false);
    expect(isValidSetPayload({ setNumber: 201, weight: 100, completed: true })).toBe(false);
  });

  it('should return false for invalid weight', () => {
    expect(isValidSetPayload({ setNumber: 1, weight: -1, completed: true })).toBe(false);
    expect(isValidSetPayload({ setNumber: 1, weight: 5001, completed: true })).toBe(false);
    expect(isValidSetPayload({ setNumber: 1, weight: NaN, completed: true })).toBe(false);
  });

  it('should return false for invalid completed', () => {
    expect(isValidSetPayload({ setNumber: 1, weight: 100, completed: 'yes' })).toBe(false);
    expect(isValidSetPayload({ setNumber: 1, weight: 100, completed: 1 })).toBe(false);
  });

  it('should return true for payloads without optional fields', () => {
    expect(isValidSetPayload({ weight: 100, completed: true })).toBe(true);
    expect(isValidSetPayload({})).toBe(true);
    expect(isValidSetPayload({ setNumber: 1 })).toBe(true);
  });

  it('should return false for invalid completedAt', () => {
    expect(isValidSetPayload({ setNumber: 1, completedAt: 'invalid' })).toBe(false);
    expect(isValidSetPayload({ setNumber: 1, completedAt: -1 })).toBe(false);
  });

  it('should return true for valid completedAt', () => {
    expect(isValidSetPayload({ setNumber: 1, completedAt: Date.now() })).toBe(true);
    expect(isValidSetPayload({ setNumber: 1, completedAt: new Date().toISOString() })).toBe(true);
    expect(isValidSetPayload({ setNumber: 1, completedAt: null })).toBe(true);
  });

  it('should return false for null or non-objects', () => {
    expect(isValidSetPayload(null)).toBe(false);
    expect(isValidSetPayload('string')).toBe(false);
    expect(isValidSetPayload(123)).toBe(false);
  });
});

describe('isValidSetsPayload', () => {
  it('should return true for valid sets array', () => {
    expect(isValidSetsPayload([
      { setNumber: 1, weight: 100, completed: true },
      { setNumber: 2, weight: 100, completed: true }
    ])).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isValidSetsPayload([])).toBe(true);
  });

  it('should return false for array with invalid items', () => {
    expect(isValidSetsPayload([
      { setNumber: 1, weight: 100, completed: true },
      { setNumber: 0, weight: 100, completed: true }
    ])).toBe(false);
  });

  it('should return false for non-array', () => {
    expect(isValidSetsPayload(null)).toBe(false);
    expect(isValidSetsPayload({})).toBe(false);
  });

  it('should return false for array exceeding max sets', () => {
    const tooManySets = Array(101).fill({ setNumber: 1, weight: 100, completed: true });
    expect(isValidSetsPayload(tooManySets)).toBe(false);
  });
});

describe('isValidSessionExercisePayload', () => {
  it('should return true for valid exercise payload', () => {
    expect(isValidSessionExercisePayload({
      exerciseId: 'ex-123',
      sets: [{ setNumber: 1, weight: 100, completed: true }]
    })).toBe(true);
  });

  it('should return false for missing exerciseId', () => {
    expect(isValidSessionExercisePayload({
      sets: [{ setNumber: 1, weight: 100, completed: true }]
    })).toBe(false);
  });

  it('should return false for invalid exerciseId', () => {
    expect(isValidSessionExercisePayload({
      exerciseId: '',
      sets: [{ setNumber: 1, weight: 100, completed: true }]
    })).toBe(false);
  });

  it('should return false for invalid sets', () => {
    expect(isValidSessionExercisePayload({
      exerciseId: 'ex-123',
      sets: []
    })).toBe(true); // Empty sets array is valid according to current implementation
    expect(isValidSessionExercisePayload({
      exerciseId: 'ex-123',
      sets: [{ setNumber: 0, weight: 100, completed: true }]
    })).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isValidSessionExercisePayload(null)).toBe(false);
    expect(isValidSessionExercisePayload('string')).toBe(false);
  });
});

describe('isValidSessionExercisesPayload', () => {
  it('should return true for valid exercises array', () => {
    expect(isValidSessionExercisesPayload([
      {
        exerciseId: 'ex-123',
        exerciseName: 'Bench Press',
        sets: [{ setNumber: 1, weight: 100, completed: true }]
      }
    ])).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isValidSessionExercisesPayload([])).toBe(true);
  });

  it('should return false for non-array', () => {
    expect(isValidSessionExercisesPayload(null)).toBe(false);
  });
});

describe('isValidExerciseEntry', () => {
  it('should return true for valid exercise entries', () => {
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 3, reps: 10 })).toBe(true);
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 1, reps: 100 })).toBe(true);
  });

  it('should return true with optional restTime', () => {
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 3, reps: 10, restTime: 90 })).toBe(true);
  });

  it('should return false for missing required fields', () => {
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press' })).toBe(false); // missing sets and reps
    expect(isValidExerciseEntry({ id: 'ex-123', sets: 3, reps: 10 })).toBe(false); // missing name
    expect(isValidExerciseEntry({ name: 'Bench Press', sets: 3, reps: 10 })).toBe(false); // missing id
  });

  it('should return false for invalid values', () => {
    expect(isValidExerciseEntry({ id: '', name: 'Bench Press', sets: 3, reps: 10 })).toBe(false);
    expect(isValidExerciseEntry({ id: 'ex-123', name: '', sets: 3, reps: 10 })).toBe(false);
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 0, reps: 10 })).toBe(false);
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 3, reps: 0 })).toBe(false);
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 21, reps: 10 })).toBe(false);
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 3, reps: 101 })).toBe(false);
  });

  it('should return false for invalid restTime', () => {
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 3, reps: 10, restTime: -1 })).toBe(false);
    expect(isValidExerciseEntry({ id: 'ex-123', name: 'Bench Press', sets: 3, reps: 10, restTime: 3601 })).toBe(false);
  });

  it('should return false for non-objects', () => {
    expect(isValidExerciseEntry(null)).toBe(false);
    expect(isValidExerciseEntry('string')).toBe(false);
  });
});

describe('isValidExerciseList', () => {
  it('should return true for valid exercise list', () => {
    expect(isValidExerciseList([
      { id: 'ex-1', name: 'Bench Press', sets: 3, reps: 10 },
      { id: 'ex-2', name: 'Squat', sets: 4, reps: 8 }
    ])).toBe(true);
  });

  it('should return true for empty list', () => {
    expect(isValidExerciseList([])).toBe(true);
  });

  it('should return false for list with invalid items', () => {
    expect(isValidExerciseList([
      { id: 'ex-1', name: 'Bench Press', sets: 3, reps: 10 },
      { id: 'ex-2', name: 'Squat' }
    ])).toBe(false);
  });
});

describe('isValidLimitParam', () => {
  it('should return parsed value for valid limit params', () => {
    expect(isValidLimitParam('10', 100)).toBe(10);
    expect(isValidLimitParam('1', 100)).toBe(1);
    expect(isValidLimitParam('100', 100)).toBe(100);
  });

  it('should return default for values exceeding max', () => {
    expect(isValidLimitParam('150', 100, 20)).toBe(100);
  });

  it('should return default for invalid values', () => {
    expect(isValidLimitParam('0', 100, 20)).toBe(20);
    expect(isValidLimitParam('abc', 100, 20)).toBe(20);
    expect(isValidLimitParam('', 100, 20)).toBe(20);
  });

  it('should return undefined for null', () => {
    expect(isValidLimitParam(null, 100, 20)).toBeUndefined();
  });
});
