import { describe, test, expect } from 'vitest';
import { parseGeminiJsonl, detectGeminiAuthRequired, isGeminiUnknownSessionError } from '../../../../src/llm/parsers/gemini.js';

describe('parseGeminiJsonl', () => {
  test('extracts sessionId from event with session_id field', () => {
    const stdout = '{"type":"result","session_id":"gem-sess-1","usage":{"input_tokens":0,"output_tokens":0}}\n';
    const result = parseGeminiJsonl(stdout);
    expect(result.sessionId).toBe('gem-sess-1');
  });

  test('accumulates usage across multiple step_finish events', () => {
    const stdout = [
      '{"type":"step_finish","usage":{"input_tokens":10,"output_tokens":5,"cached_input_tokens":2}}',
      '{"type":"step_finish","usage":{"input_tokens":20,"output_tokens":15,"cached_input_tokens":3}}',
    ].join('\n');
    const result = parseGeminiJsonl(stdout);
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 20, cachedInputTokens: 5 });
  });

  test('extracts error message from error events', () => {
    const stdout = '{"type":"error","message":"something went wrong"}\n';
    const result = parseGeminiJsonl(stdout);
    expect(result.errorMessage).toBe('something went wrong');
  });

  test('extracts text from assistant and text events', () => {
    const stdout = [
      '{"type":"assistant","message":{"content":[{"text":"Part 1"}]}}',
      '{"type":"text","part":{"text":"Part 2"}}',
    ].join('\n');
    const result = parseGeminiJsonl(stdout);
    expect(result.summary).toBe('Part 1\n\nPart 2');
  });

  test('reads sessionId from checkpoint_id fallback', () => {
    const stdout = '{"type":"result","checkpoint_id":"ckpt-42","usage":{"input_tokens":0,"output_tokens":0}}\n';
    const result = parseGeminiJsonl(stdout);
    expect(result.sessionId).toBe('ckpt-42');
  });

  test('handles empty stdout', () => {
    const result = parseGeminiJsonl('');
    expect(result.sessionId).toBeNull();
    expect(result.summary).toBe('');
    expect(result.usage).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });
});

describe('detectGeminiAuthRequired', () => {
  test('returns true for "not authenticated"', () => {
    expect(detectGeminiAuthRequired('', 'Error: not authenticated')).toBe(true);
  });

  test('returns true for "api key required"', () => {
    expect(detectGeminiAuthRequired('api key required', '')).toBe(true);
  });

  test('returns false for normal output', () => {
    expect(detectGeminiAuthRequired('Generated text', '')).toBe(false);
  });
});

describe('isGeminiUnknownSessionError', () => {
  test('returns true for "unknown session"', () => {
    expect(isGeminiUnknownSessionError('unknown session', '')).toBe(true);
  });

  test('returns true for "failed to resume"', () => {
    expect(isGeminiUnknownSessionError('', 'failed to resume session')).toBe(true);
  });

  test('returns false for normal output', () => {
    expect(isGeminiUnknownSessionError('Hello', '')).toBe(false);
  });
});
