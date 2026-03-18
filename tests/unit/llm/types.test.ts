import { describe, it, expect } from 'vitest';
import type {
  CLIAdapter,
  AdapterExecuteOptions,
  AdapterResult,
  AdapterErrorCode,
  TokenUsage,
  AdapterProbeResult,
} from '../../../src/llm/types.js';
import {
  AphypeError,
  AdapterNotFoundError,
  AdapterNotInstalledError,
  AdapterAuthError,
  AdapterTimeoutError,
  AdapterEmptyResponseError,
  AdapterValidationError,
} from '../../../src/types/errors.js';

describe('AdapterExecuteOptions', () => {
  it('requires prompt, cwd, skillPaths, sessionId, timeoutSec, extraArgs', () => {
    const options: AdapterExecuteOptions = {
      prompt: 'Hello',
      cwd: '/tmp/test',
      skillPaths: ['/skills/one.md'],
      sessionId: null,
      timeoutSec: 300,
      extraArgs: [],
    };
    expect(options.prompt).toBe('Hello');
    expect(options.cwd).toBe('/tmp/test');
    expect(options.skillPaths).toEqual(['/skills/one.md']);
    expect(options.sessionId).toBeNull();
    expect(options.timeoutSec).toBe(300);
    expect(options.extraArgs).toEqual([]);
  });
});

describe('AdapterResult', () => {
  it('contains all required fields', () => {
    const result: AdapterResult = {
      success: true,
      content: 'output',
      sessionId: 'sess-123',
      usage: { inputTokens: 10, outputTokens: 20, cachedTokens: 0 },
      costUsd: 0.01,
      model: 'claude-4',
      errorMessage: null,
      errorCode: null,
      exitCode: 0,
      timedOut: false,
    };
    expect(result.success).toBe(true);
    expect(result.content).toBe('output');
    expect(result.sessionId).toBe('sess-123');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(20);
    expect(result.usage.cachedTokens).toBe(0);
    expect(result.costUsd).toBe(0.01);
    expect(result.model).toBe('claude-4');
    expect(result.errorMessage).toBeNull();
    expect(result.errorCode).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });
});

describe('AdapterErrorCode', () => {
  it('is a union of 6 values', () => {
    const codes: AdapterErrorCode[] = [
      'auth_required',
      'command_not_found',
      'timeout',
      'parse_error',
      'session_expired',
      'unknown',
    ];
    expect(codes).toHaveLength(6);
    // Each value is assignable
    codes.forEach((code) => {
      expect(typeof code).toBe('string');
    });
  });
});

describe('TokenUsage', () => {
  it('has inputTokens, outputTokens, cachedTokens', () => {
    const usage: TokenUsage = { inputTokens: 100, outputTokens: 50, cachedTokens: 25 };
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.cachedTokens).toBe(25);
  });
});

describe('AdapterProbeResult', () => {
  it('has available, authenticated, version, errorMessage', () => {
    const probe: AdapterProbeResult = {
      available: true,
      authenticated: true,
      version: '1.0.0',
      errorMessage: null,
    };
    expect(probe.available).toBe(true);
    expect(probe.authenticated).toBe(true);
    expect(probe.version).toBe('1.0.0');
    expect(probe.errorMessage).toBeNull();
  });
});

describe('CLIAdapter', () => {
  it('interface shape includes name, command, execute, probe', () => {
    const adapter: CLIAdapter = {
      name: 'claude',
      command: 'claude',
      execute: async (_opts: AdapterExecuteOptions) => ({
        success: true,
        content: '',
        sessionId: null,
        usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
        costUsd: null,
        model: 'test',
        errorMessage: null,
        errorCode: null,
        exitCode: 0,
        timedOut: false,
      }),
      probe: async () => ({
        available: true,
        authenticated: true,
        version: '1.0.0',
        errorMessage: null,
      }),
    };
    expect(adapter.name).toBe('claude');
    expect(adapter.command).toBe('claude');
    expect(typeof adapter.execute).toBe('function');
    expect(typeof adapter.probe).toBe('function');
  });
});

describe('Adapter error classes', () => {
  it('each error class extends AphypeError with correct name property', () => {
    const errors = [
      { instance: new AdapterNotFoundError('foo'), expectedName: 'AdapterNotFoundError' },
      { instance: new AdapterNotInstalledError('claude', 'https://example.com'), expectedName: 'AdapterNotInstalledError' },
      { instance: new AdapterAuthError('claude', 'claude'), expectedName: 'AdapterAuthError' },
      { instance: new AdapterTimeoutError(300), expectedName: 'AdapterTimeoutError' },
      { instance: new AdapterEmptyResponseError('claude'), expectedName: 'AdapterEmptyResponseError' },
      { instance: new AdapterValidationError('bad input'), expectedName: 'AdapterValidationError' },
    ];

    for (const { instance, expectedName } of errors) {
      expect(instance).toBeInstanceOf(AphypeError);
      expect(instance).toBeInstanceOf(Error);
      expect(instance.name).toBe(expectedName);
    }
  });

  it('AdapterNotFoundError includes supported adapter list in message', () => {
    const err = new AdapterNotFoundError('foo');
    expect(err.message).toContain('claude');
    expect(err.message).toContain('gemini');
    expect(err.message).toContain('codex');
  });

  it('AdapterNotInstalledError includes install URL in message', () => {
    const err = new AdapterNotInstalledError('claude', 'https://docs.anthropic.com');
    expect(err.message).toContain('https://docs.anthropic.com');
  });

  it('AdapterAuthError includes login hint', () => {
    const err = new AdapterAuthError('claude', 'claude');
    expect(err.message).toContain('authentication');
    expect(err.message).toContain("'claude login'");
  });

  it('AdapterTimeoutError includes timeout duration', () => {
    const err = new AdapterTimeoutError(600);
    expect(err.message).toContain('600');
  });

  it('AdapterEmptyResponseError includes adapter name', () => {
    const err = new AdapterEmptyResponseError('gemini');
    expect(err.message).toContain('gemini');
  });

  it('AdapterValidationError carries the provided message', () => {
    const err = new AdapterValidationError('prompt too long');
    expect(err.message).toContain('prompt too long');
  });
});
