import { describe, test, expect } from 'vitest';
import {
  sanitizePath,
  validateDate,
  validateScheduleDate,
  normalizeScheduleDate,
} from '../../../src/utils/path.js';
import { PathTraversalError } from '../../../src/types/index.js';

describe('sanitizePath', () => {
  test('accepts simple names', () => {
    expect(sanitizePath('my-article')).toBe('my-article');
    expect(sanitizePath('post_123')).toBe('post_123');
    expect(sanitizePath('Hello World')).toBe('Hello World');
  });

  test('rejects empty input', () => {
    expect(() => sanitizePath('')).toThrow(PathTraversalError);
    expect(() => sanitizePath('   ')).toThrow(PathTraversalError);
  });

  test('rejects path traversal sequences', () => {
    expect(() => sanitizePath('..')).toThrow(PathTraversalError);
    expect(() => sanitizePath('../etc/passwd')).toThrow(PathTraversalError);
    expect(() => sanitizePath('foo/../bar')).toThrow(PathTraversalError);
    expect(() => sanitizePath('..%2F..%2Fetc')).toThrow(PathTraversalError);
  });

  test('rejects absolute paths', () => {
    expect(() => sanitizePath('/etc/passwd')).toThrow(PathTraversalError);
    expect(() => sanitizePath('/tmp/test')).toThrow(PathTraversalError);
  });

  test('rejects path separators', () => {
    expect(() => sanitizePath('foo/bar')).toThrow(PathTraversalError);
    expect(() => sanitizePath('foo\\bar')).toThrow(PathTraversalError);
  });

  test('rejects null bytes', () => {
    expect(() => sanitizePath('foo\0bar')).toThrow(PathTraversalError);
  });

  test('rejects hidden files', () => {
    expect(() => sanitizePath('.env')).toThrow(PathTraversalError);
    expect(() => sanitizePath('.git')).toThrow(PathTraversalError);
  });
});

describe('validateDate', () => {
  test('accepts valid YYYY-MM-DD dates', () => {
    expect(validateDate('2026-03-15')).toBe(true);
    expect(validateDate('2026-01-01')).toBe(true);
    expect(validateDate('2026-12-31')).toBe(true);
  });

  test('rejects invalid formats', () => {
    expect(validateDate('03-15-2026')).toBe(false);
    expect(validateDate('2026/03/15')).toBe(false);
    expect(validateDate('20260315')).toBe(false);
    expect(validateDate('not-a-date')).toBe(false);
    expect(validateDate('')).toBe(false);
  });

  test('rejects impossible dates', () => {
    expect(validateDate('2026-02-30')).toBe(false);
    expect(validateDate('2026-13-01')).toBe(false);
    expect(validateDate('2026-00-01')).toBe(false);
  });
});

describe('validateScheduleDate', () => {
  test('accepts date-only YYYY-MM-DD', () => {
    expect(validateScheduleDate('2026-03-22')).toBe(true);
  });

  test('accepts date + time HH:MM', () => {
    expect(validateScheduleDate('2026-03-22T14:30')).toBe(true);
    expect(validateScheduleDate('2026-03-22T00:00')).toBe(true);
    expect(validateScheduleDate('2026-03-22T23:59')).toBe(true);
  });

  test('accepts full datetime HH:MM:SS', () => {
    expect(validateScheduleDate('2026-03-22T14:30:45')).toBe(true);
    expect(validateScheduleDate('2026-03-22T00:00:00')).toBe(true);
  });

  test('rejects invalid date portion', () => {
    expect(validateScheduleDate('2026-02-30')).toBe(false);
    expect(validateScheduleDate('2026-13-01T14:30')).toBe(false);
  });

  test('rejects invalid time values', () => {
    expect(validateScheduleDate('2026-03-22T25:00')).toBe(false);
    expect(validateScheduleDate('2026-03-22T14:60')).toBe(false);
    expect(validateScheduleDate('2026-03-22T14:30:61')).toBe(false);
  });

  test('rejects wrong formats', () => {
    expect(validateScheduleDate('not-a-date')).toBe(false);
    expect(validateScheduleDate('2026-03-22T14')).toBe(false);
    expect(validateScheduleDate('2026/03/22')).toBe(false);
    expect(validateScheduleDate('')).toBe(false);
  });
});

describe('normalizeScheduleDate', () => {
  test('date-only adds T00:00:00', () => {
    expect(normalizeScheduleDate('2026-03-22')).toBe('2026-03-22T00:00:00');
  });

  test('HH:MM adds :00 seconds', () => {
    expect(normalizeScheduleDate('2026-03-22T14:30')).toBe('2026-03-22T14:30:00');
  });

  test('full datetime passes through', () => {
    expect(normalizeScheduleDate('2026-03-22T14:30:45')).toBe('2026-03-22T14:30:45');
  });

  test('legacy hyphenated format converted to colons', () => {
    expect(normalizeScheduleDate('2026-03-22T14-30-00')).toBe('2026-03-22T14:30:00');
    expect(normalizeScheduleDate('2026-03-22T00-00-00')).toBe('2026-03-22T00:00:00');
  });
});
