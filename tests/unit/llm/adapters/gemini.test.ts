import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from '../../../../src/llm/adapters/gemini.js';

const mockRunCLIProcess = vi.fn();
vi.mock('../../../../src/llm/process.js', () => ({
  runCLIProcess: (...args: unknown[]) => mockRunCLIProcess(...args),
}));

const GEMINI_STDOUT = [
  '{"type":"result","session_id":"gem-1","usage":{"input_tokens":10,"output_tokens":20},"total_cost_usd":0.005}',
  '{"type":"assistant","message":{"content":[{"text":"Gemini content"}]}}',
].join('\n');

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
  mockRunCLIProcess.mockResolvedValue({
    exitCode: 0, signal: null, timedOut: false, stdout: GEMINI_STDOUT, stderr: '',
  });
});

describe('GeminiAdapter.execute', () => {
  test('builds correct args with --approval-mode yolo --sandbox=none', async () => {
    const adapter = new GeminiAdapter('gemini');
    await adapter.execute(baseOptions);

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.args).toContain('--approval-mode');
    expect(call.args[call.args.indexOf('--approval-mode') + 1]).toBe('yolo');
    expect(call.args).toContain('--sandbox=none');
    expect(call.args).toContain('--output-format');
  });

  test('adds --resume when sessionId is provided', async () => {
    const adapter = new GeminiAdapter('gemini');
    await adapter.execute({ ...baseOptions, sessionId: 'gem-sess' });

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.args).toContain('--resume');
    expect(call.args[call.args.indexOf('--resume') + 1]).toBe('gem-sess');
  });

  test('passes prompt as final positional argument (not stdin)', async () => {
    const adapter = new GeminiAdapter('gemini');
    await adapter.execute({ ...baseOptions, prompt: 'my gemini prompt' });

    const call = mockRunCLIProcess.mock.calls[0][0];
    // Last arg should be the prompt
    expect(call.args[call.args.length - 1]).toBe('my gemini prompt');
    // No stdin
    expect(call.stdin).toBeUndefined();
  });

  test('returns auth_required errorCode on auth failure', async () => {
    mockRunCLIProcess.mockResolvedValue({
      exitCode: 1, signal: null, timedOut: false,
      stdout: '', stderr: 'Error: not authenticated',
    });

    const adapter = new GeminiAdapter('gemini');
    const result = await adapter.execute(baseOptions);

    expect(result.errorCode).toBe('auth_required');
  });

  test('retries on unknown session error', async () => {
    mockRunCLIProcess
      .mockResolvedValueOnce({
        exitCode: 1, signal: null, timedOut: false,
        stdout: '', stderr: 'unknown session xyz',
      })
      .mockResolvedValueOnce({
        exitCode: 0, signal: null, timedOut: false, stdout: GEMINI_STDOUT, stderr: '',
      });

    const adapter = new GeminiAdapter('gemini');
    const result = await adapter.execute({ ...baseOptions, sessionId: 'xyz' });

    expect(mockRunCLIProcess).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('Gemini content');
  });
});

describe('GeminiAdapter.probe', () => {
  test('returns available:true for working command', async () => {
    mockRunCLIProcess.mockResolvedValue({
      exitCode: 0, signal: null, timedOut: false,
      stdout: 'gemini-cli 2.5.0', stderr: '',
    });

    const adapter = new GeminiAdapter('gemini');
    const result = await adapter.probe();

    expect(result.available).toBe(true);
    expect(result.version).toBe('gemini-cli 2.5.0');
  });
});
