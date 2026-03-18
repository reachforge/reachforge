import { describe, test, expect } from 'vitest';
import { parseClaudeStreamJson, detectClaudeAuthRequired, isClaudeUnknownSessionError } from '../../../../src/llm/parsers/claude.js';

describe('parseClaudeStreamJson', () => {
  test('extracts sessionId from init event', () => {
    const stdout = '{"type":"system","subtype":"init","session_id":"sess-123","model":"claude-sonnet-4-6"}\n';
    const result = parseClaudeStreamJson(stdout);
    expect(result.sessionId).toBe('sess-123');
  });

  test('extracts model from init event', () => {
    const stdout = '{"type":"system","subtype":"init","session_id":"s1","model":"claude-opus-4-6"}\n';
    const result = parseClaudeStreamJson(stdout);
    expect(result.model).toBe('claude-opus-4-6');
  });

  test('concatenates text from multiple assistant events', () => {
    const stdout = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"World"}]}}',
    ].join('\n');
    const result = parseClaudeStreamJson(stdout);
    expect(result.summary).toBe('Hello\n\nWorld');
  });

  test('extracts usage from result event', () => {
    const stdout = '{"type":"result","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":20}}\n';
    const result = parseClaudeStreamJson(stdout);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, cachedInputTokens: 20 });
  });

  test('extracts costUsd from result event', () => {
    const stdout = '{"type":"result","total_cost_usd":0.042,"usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0}}\n';
    const result = parseClaudeStreamJson(stdout);
    expect(result.costUsd).toBe(0.042);
  });

  test('returns null sessionId when no events contain session_id', () => {
    const stdout = '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}\n';
    const result = parseClaudeStreamJson(stdout);
    expect(result.sessionId).toBeNull();
  });

  test('handles empty stdout gracefully', () => {
    const result = parseClaudeStreamJson('');
    expect(result.sessionId).toBeNull();
    expect(result.summary).toBe('');
    expect(result.usage).toBeNull();
  });

  test('skips non-JSON lines', () => {
    const stdout = 'some random text\n{"type":"system","subtype":"init","session_id":"s1","model":"m1"}\nnot json\n';
    const result = parseClaudeStreamJson(stdout);
    expect(result.sessionId).toBe('s1');
    expect(result.model).toBe('m1');
  });
});

describe('detectClaudeAuthRequired', () => {
  test('returns true for "not logged in" in stderr', () => {
    expect(detectClaudeAuthRequired('', 'Error: not logged in')).toBe(true);
  });

  test('returns true for "please log in" in stdout', () => {
    expect(detectClaudeAuthRequired('Please log in to continue', '')).toBe(true);
  });

  test('returns false for normal output', () => {
    expect(detectClaudeAuthRequired('Hello world', 'some warning')).toBe(false);
  });
});

describe('isClaudeUnknownSessionError', () => {
  test('returns true for "no conversation found with session id"', () => {
    expect(isClaudeUnknownSessionError({
      error: 'no conversation found with session id abc-123',
    })).toBe(true);
  });

  test('returns true for "unknown session"', () => {
    expect(isClaudeUnknownSessionError({ message: 'unknown session' })).toBe(true);
  });

  test('returns false for unrelated error', () => {
    expect(isClaudeUnknownSessionError({ error: 'rate limit exceeded' })).toBe(false);
  });
});
