import { describe, test, expect } from 'vitest';
import { jsonSuccess, jsonError, errorToCode, errorToHint } from '../../../src/core/json-output.js';
import { ProjectNotFoundError, InvalidDateError, ReachforgeError } from '../../../src/types/errors.js';

describe('jsonSuccess', () => {
  test('returns valid JSON with jsonVersion=1, command, success=true, data', () => {
    const result = JSON.parse(jsonSuccess('status', { foo: 'bar' }));
    expect(result.jsonVersion).toBe(1);
    expect(result.command).toBe('status');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test('includes the correct data payload', () => {
    const payload = { stages: ['a', 'b'], count: 42 };
    const result = JSON.parse(jsonSuccess('schedule', payload));
    expect(result.data).toEqual(payload);
  });
});

describe('jsonError', () => {
  test('returns valid JSON with jsonVersion=1, success=false, data=null, error object', () => {
    const result = JSON.parse(jsonError('rollback', { message: 'fail', code: 'ERR' }));
    expect(result.jsonVersion).toBe(1);
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  test('includes message, code, and hint in error', () => {
    const result = JSON.parse(jsonError('schedule', { message: 'bad date', code: 'INVALID_DATE', hint: 'Use YYYY-MM-DD' }));
    expect(result.error.message).toBe('bad date');
    expect(result.error.code).toBe('INVALID_DATE');
    expect(result.error.hint).toBe('Use YYYY-MM-DD');
  });
});

describe('errorToCode', () => {
  test('maps ProjectNotFoundError -> PROJECT_NOT_FOUND', () => {
    const err = new ProjectNotFoundError('my-proj', '01_inbox');
    expect(errorToCode(err)).toBe('PROJECT_NOT_FOUND');
  });

  test('maps InvalidDateError -> INVALID_DATE', () => {
    const err = new InvalidDateError('not-a-date');
    expect(errorToCode(err)).toBe('INVALID_DATE');
  });

  test('maps unknown error -> UNKNOWN_ERROR', () => {
    const err = new Error('something');
    expect(errorToCode(err)).toBe('UNKNOWN_ERROR');
  });
});

describe('errorToHint', () => {
  test('extracts hint from ReachforgeError', () => {
    const err = new ReachforgeError('msg', 'cause', 'try this');
    expect(errorToHint(err)).toBe('try this');
  });

  test('returns undefined for plain Error', () => {
    const err = new Error('plain');
    expect(errorToHint(err)).toBeUndefined();
  });
});
