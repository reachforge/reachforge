import { describe, test, expect } from 'vitest';
import { parseCodexJsonl, isCodexUnknownSessionError } from '../../../../src/llm/parsers/codex.js';

describe('parseCodexJsonl', () => {
  test('extracts sessionId from thread.started event', () => {
    const stdout = '{"type":"thread.started","thread_id":"thread-abc"}\n';
    const result = parseCodexJsonl(stdout);
    expect(result.sessionId).toBe('thread-abc');
  });

  test('extracts text from item.completed agent_message events', () => {
    const stdout = [
      '{"type":"item.completed","item":{"type":"agent_message","text":"Hello from Codex"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"More content"}}',
    ].join('\n');
    const result = parseCodexJsonl(stdout);
    expect(result.summary).toBe('Hello from Codex\n\nMore content');
  });

  test('extracts usage from turn.completed events', () => {
    const stdout = '{"type":"turn.completed","usage":{"input_tokens":50,"output_tokens":30,"cached_input_tokens":10}}\n';
    const result = parseCodexJsonl(stdout);
    expect(result.usage).toEqual({ inputTokens: 50, outputTokens: 30, cachedInputTokens: 10 });
  });

  test('captures error from turn.failed events', () => {
    const stdout = '{"type":"turn.failed","error":{"message":"context too long"}}\n';
    const result = parseCodexJsonl(stdout);
    expect(result.errorMessage).toBe('context too long');
  });

  test('handles empty stdout', () => {
    const result = parseCodexJsonl('');
    expect(result.sessionId).toBeNull();
    expect(result.summary).toBe('');
    expect(result.usage).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });

  test('skips non-agent_message items', () => {
    const stdout = '{"type":"item.completed","item":{"type":"tool_call","text":"some tool"}}\n';
    const result = parseCodexJsonl(stdout);
    expect(result.summary).toBe('');
  });
});

describe('isCodexUnknownSessionError', () => {
  test('returns true for "unknown thread"', () => {
    expect(isCodexUnknownSessionError('unknown thread', '')).toBe(true);
  });

  test('returns true for "thread not found"', () => {
    expect(isCodexUnknownSessionError('', 'thread xyz not found')).toBe(true);
  });

  test('returns false for normal output', () => {
    expect(isCodexUnknownSessionError('Hello', '')).toBe(false);
  });
});
