import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ClaudeAdapter } from '../../../../src/llm/adapters/claude.js';

// Mock runCLIProcess
const mockRunCLIProcess = vi.fn();
vi.mock('../../../../src/llm/process.js', () => ({
  runCLIProcess: (...args: unknown[]) => mockRunCLIProcess(...args),
}));

function successResult(stdout: string, exitCode = 0) {
  return { exitCode, signal: null, timedOut: false, stdout, stderr: '' };
}

const INIT_EVENT = '{"type":"system","subtype":"init","session_id":"s1","model":"claude-sonnet-4-6"}';
const ASSISTANT_EVENT = '{"type":"assistant","message":{"content":[{"type":"text","text":"Generated content"}]}}';
const RESULT_EVENT = '{"type":"result","usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":5},"total_cost_usd":0.01}';
const FULL_STDOUT = [INIT_EVENT, ASSISTANT_EVENT, RESULT_EVENT].join('\n');

const baseOptions = {
  prompt: 'Write an article',
  cwd: '/tmp',
  skillPaths: [],
  sessionId: null as string | null,
  timeoutSec: 300,
  extraArgs: [] as string[],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRunCLIProcess.mockResolvedValue(successResult(FULL_STDOUT));
});

describe('ClaudeAdapter.execute', () => {
  test('builds correct args with --print --output-format stream-json', async () => {
    const adapter = new ClaudeAdapter('claude');
    await adapter.execute(baseOptions);

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.args).toContain('--print');
    expect(call.args).toContain('--output-format');
    expect(call.args[call.args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(call.args).toContain('--verbose');
    expect(call.args).toContain('--dangerously-skip-permissions');
  });

  test('adds --resume when sessionId is provided', async () => {
    const adapter = new ClaudeAdapter('claude');
    await adapter.execute({ ...baseOptions, sessionId: 'sess-abc' });

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.args).toContain('--resume');
    expect(call.args[call.args.indexOf('--resume') + 1]).toBe('sess-abc');
  });

  test('creates temp skills dir and passes via --add-dir', async () => {
    const adapter = new ClaudeAdapter('claude');
    await adapter.execute(baseOptions);

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.args).toContain('--add-dir');
    const addDirIdx = call.args.indexOf('--add-dir');
    expect(call.args[addDirIdx + 1]).toMatch(/aphype-skills-/);
  });

  test('passes prompt via stdin', async () => {
    const adapter = new ClaudeAdapter('claude');
    await adapter.execute({ ...baseOptions, prompt: 'my prompt' });

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.stdin).toBe('my prompt');
  });

  test('returns auth_required errorCode on auth failure', async () => {
    mockRunCLIProcess.mockResolvedValue({
      exitCode: 1, signal: null, timedOut: false,
      stdout: '', stderr: 'Error: not logged in',
    });

    const adapter = new ClaudeAdapter('claude');
    const result = await adapter.execute(baseOptions);

    expect(result.errorCode).toBe('auth_required');
    expect(result.success).toBe(false);
  });

  test('retries on unknown session error without --resume', async () => {
    // First call: session error
    mockRunCLIProcess.mockResolvedValueOnce({
      exitCode: 1, signal: null, timedOut: false,
      stdout: '{"type":"result","error":"no conversation found with session id abc"}',
      stderr: '',
    });
    // Retry: success
    mockRunCLIProcess.mockResolvedValueOnce(successResult(FULL_STDOUT));

    const adapter = new ClaudeAdapter('claude');
    const result = await adapter.execute({ ...baseOptions, sessionId: 'abc' });

    expect(mockRunCLIProcess).toHaveBeenCalledTimes(2);
    // Second call should not have --resume
    const retryCall = mockRunCLIProcess.mock.calls[1][0];
    expect(retryCall.args).not.toContain('--resume');
    expect(result.content).toBe('Generated content');
  });

  test('returns parsed content and usage on success', async () => {
    const adapter = new ClaudeAdapter('claude');
    const result = await adapter.execute(baseOptions);

    expect(result.success).toBe(true);
    expect(result.content).toBe('Generated content');
    expect(result.sessionId).toBe('s1');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20, cachedTokens: 5 });
    expect(result.costUsd).toBe(0.01);
    expect(result.model).toBe('claude-sonnet-4-6');
  });
});

describe('ClaudeAdapter.probe', () => {
  test('returns available:true for working command', async () => {
    mockRunCLIProcess
      .mockResolvedValueOnce(successResult('claude-code 1.0.0'))
      .mockResolvedValueOnce(successResult(FULL_STDOUT));

    const adapter = new ClaudeAdapter('claude');
    const result = await adapter.probe();

    expect(result.available).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.version).toBe('claude-code 1.0.0');
  });

  test('returns available:false for missing command', async () => {
    mockRunCLIProcess.mockResolvedValue({
      exitCode: null, signal: null, timedOut: false,
      stdout: '', stderr: 'command not found',
    });

    const adapter = new ClaudeAdapter('nonexistent');
    const result = await adapter.probe();

    expect(result.available).toBe(false);
  });
});
