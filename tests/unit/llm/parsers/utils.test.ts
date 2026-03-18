import { describe, test, expect } from 'vitest';
import {
  parseJsonLine,
  appendWithCap,
  extractAllErrorText,
  MAX_CAPTURE_BYTES,
} from '../../../../src/llm/parsers/utils.js';

describe('parseJsonLine', () => {
  test('returns parsed object for valid JSON', () => {
    const result = parseJsonLine('{"type":"test","value":42}');
    expect(result).toEqual({ type: 'test', value: 42 });
  });

  test('returns null for invalid JSON', () => {
    expect(parseJsonLine('not json')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseJsonLine('')).toBeNull();
  });

  test('returns null for whitespace-only string', () => {
    expect(parseJsonLine('   ')).toBeNull();
  });

  test('returns null for JSON array', () => {
    expect(parseJsonLine('[1,2,3]')).toBeNull();
  });

  test('returns null for JSON primitive', () => {
    expect(parseJsonLine('"hello"')).toBeNull();
    expect(parseJsonLine('42')).toBeNull();
    expect(parseJsonLine('null')).toBeNull();
  });
});

describe('appendWithCap', () => {
  test('appends content up to limit', () => {
    const result = appendWithCap('hello', ' world');
    expect(result).toBe('hello world');
  });

  test('truncates when exceeding limit', () => {
    const result = appendWithCap('hello ', 'world!!!!', 10);
    // "hello " is 6 bytes, cap is 10, so only 4 bytes of chunk fit
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(10);
    expect(result).toBe('hello worl');
  });

  test('returns buffer unchanged when chunk would exceed and no room left', () => {
    const result = appendWithCap('0123456789', 'more', 10);
    expect(result).toBe('0123456789');
  });

  test('defaults maxBytes to MAX_CAPTURE_BYTES', () => {
    expect(MAX_CAPTURE_BYTES).toBe(4_194_304);
    // Small strings should concatenate fine with default
    const result = appendWithCap('a', 'b');
    expect(result).toBe('ab');
  });
});

describe('extractAllErrorText', () => {
  test('joins error and message fields from nested object', () => {
    const obj = { error: 'fail', nested: { message: 'detail' } };
    expect(extractAllErrorText(obj)).toBe('fail\ndetail');
  });

  test('returns empty string for null', () => {
    expect(extractAllErrorText(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(extractAllErrorText(undefined)).toBe('');
  });

  test('returns empty string for a plain string', () => {
    expect(extractAllErrorText('some string')).toBe('');
  });

  test('recurses into arrays', () => {
    const obj = { errors: [{ error: 'a' }, { message: 'b' }] };
    expect(extractAllErrorText(obj)).toBe('a\nb');
  });

  test('handles deeply nested structures', () => {
    const obj = {
      level1: {
        error: 'e1',
        level2: {
          message: 'm2',
          level3: { error: 'e3' },
        },
      },
    };
    const result = extractAllErrorText(obj);
    expect(result).toContain('e1');
    expect(result).toContain('m2');
    expect(result).toContain('e3');
  });
});
