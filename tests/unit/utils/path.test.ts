import { describe, test, expect } from 'vitest';
import { sanitizePath, validateDate } from '../../../src/utils/path.js';
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
