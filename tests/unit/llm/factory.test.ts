import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { AdapterFactory } from '../../../src/llm/factory.js';
import { AdapterNotFoundError } from '../../../src/types/index.js';
import { ClaudeAdapter } from '../../../src/llm/adapters/claude.js';
import { GeminiAdapter } from '../../../src/llm/adapters/gemini.js';
import { CodexAdapter } from '../../../src/llm/adapters/codex.js';

const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string) {
  savedEnv[key] = process.env[key];
  process.env[key] = value;
}

beforeEach(() => {
  // Clear all adapter env vars
  for (const key of ['APHYPE_LLM_ADAPTER', 'APHYPE_DRAFT_ADAPTER', 'APHYPE_ADAPT_ADAPTER',
                      'APHYPE_CLAUDE_COMMAND', 'APHYPE_GEMINI_COMMAND', 'APHYPE_CODEX_COMMAND']) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('AdapterFactory.create', () => {
  test('returns ClaudeAdapter when adapter is "claude"', () => {
    setEnv('APHYPE_LLM_ADAPTER', 'claude');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
    expect(adapter.name).toBe('claude');
  });

  test('returns GeminiAdapter when adapter is "gemini"', () => {
    setEnv('APHYPE_LLM_ADAPTER', 'gemini');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(GeminiAdapter);
    expect(adapter.name).toBe('gemini');
  });

  test('returns CodexAdapter when adapter is "codex"', () => {
    setEnv('APHYPE_LLM_ADAPTER', 'codex');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(CodexAdapter);
    expect(adapter.name).toBe('codex');
  });

  test('throws AdapterNotFoundError for "gpt4"', () => {
    setEnv('APHYPE_LLM_ADAPTER', 'gpt4');
    expect(() => AdapterFactory.create('draft')).toThrow(AdapterNotFoundError);
    expect(() => AdapterFactory.create('draft')).toThrow(/gpt4/);
  });

  test('respects APHYPE_DRAFT_ADAPTER for draft stage', () => {
    setEnv('APHYPE_LLM_ADAPTER', 'claude');
    setEnv('APHYPE_DRAFT_ADAPTER', 'gemini');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(GeminiAdapter);
  });

  test('respects APHYPE_ADAPT_ADAPTER for adapt stage', () => {
    setEnv('APHYPE_LLM_ADAPTER', 'claude');
    setEnv('APHYPE_ADAPT_ADAPTER', 'codex');
    const { adapter } = AdapterFactory.create('adapt');
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });

  test('defaults to "claude" when no config is set', () => {
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
  });

  test('respects APHYPE_CLAUDE_COMMAND for custom command path', () => {
    setEnv('APHYPE_CLAUDE_COMMAND', '/custom/path/claude');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter.command).toBe('/custom/path/claude');
  });
});
