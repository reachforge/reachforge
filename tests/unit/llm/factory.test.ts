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
  for (const key of ['REACHFORGE_LLM_ADAPTER', 'REACHFORGE_DRAFT_ADAPTER', 'REACHFORGE_ADAPT_ADAPTER',
                      'REACHFORGE_CLAUDE_COMMAND', 'REACHFORGE_GEMINI_COMMAND', 'REACHFORGE_CODEX_COMMAND']) {
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
    setEnv('REACHFORGE_LLM_ADAPTER', 'claude');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
    expect(adapter.name).toBe('claude');
  });

  test('returns GeminiAdapter when adapter is "gemini"', () => {
    setEnv('REACHFORGE_LLM_ADAPTER', 'gemini');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(GeminiAdapter);
    expect(adapter.name).toBe('gemini');
  });

  test('returns CodexAdapter when adapter is "codex"', () => {
    setEnv('REACHFORGE_LLM_ADAPTER', 'codex');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(CodexAdapter);
    expect(adapter.name).toBe('codex');
  });

  test('throws AdapterNotFoundError for "gpt4"', () => {
    setEnv('REACHFORGE_LLM_ADAPTER', 'gpt4');
    expect(() => AdapterFactory.create('draft')).toThrow(AdapterNotFoundError);
    expect(() => AdapterFactory.create('draft')).toThrow(/gpt4/);
  });

  test('respects REACHFORGE_DRAFT_ADAPTER for draft stage', () => {
    setEnv('REACHFORGE_LLM_ADAPTER', 'claude');
    setEnv('REACHFORGE_DRAFT_ADAPTER', 'gemini');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(GeminiAdapter);
  });

  test('respects REACHFORGE_ADAPT_ADAPTER for adapt stage', () => {
    setEnv('REACHFORGE_LLM_ADAPTER', 'claude');
    setEnv('REACHFORGE_ADAPT_ADAPTER', 'codex');
    const { adapter } = AdapterFactory.create('adapt');
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });

  test('defaults to "claude" when no config is set', () => {
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
  });

  test('respects REACHFORGE_CLAUDE_COMMAND for custom command path', () => {
    setEnv('REACHFORGE_CLAUDE_COMMAND', '/custom/path/claude');
    const { adapter } = AdapterFactory.create('draft');
    expect(adapter.command).toBe('/custom/path/claude');
  });
});
