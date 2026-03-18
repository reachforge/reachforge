import { describe, test, expect, vi, beforeEach } from 'vitest';
import { CodexAdapter } from '../../../../src/llm/adapters/codex.js';

const mockRunCLIProcess = vi.fn();
vi.mock('../../../../src/llm/process.js', () => ({
  runCLIProcess: (...args: unknown[]) => mockRunCLIProcess(...args),
}));

const CODEX_STDOUT = [
  '{"type":"thread.started","thread_id":"thread-1"}',
  '{"type":"item.completed","item":{"type":"agent_message","text":"Codex output"}}',
  '{"type":"turn.completed","usage":{"input_tokens":15,"output_tokens":25,"cached_input_tokens":0}}',
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
    exitCode: 0, signal: null, timedOut: false, stdout: CODEX_STDOUT, stderr: '',
  });
});

describe('CodexAdapter.execute', () => {
  test('builds correct args with exec --json', async () => {
    const adapter = new CodexAdapter('codex');
    await adapter.execute(baseOptions);

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.args[0]).toBe('exec');
    expect(call.args[1]).toBe('--json');
    expect(call.args).toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  test('adds resume SESSION_ID - when sessionId provided', async () => {
    const adapter = new CodexAdapter('codex');
    await adapter.execute({ ...baseOptions, sessionId: 'thread-x' });

    const call = mockRunCLIProcess.mock.calls[0][0];
    const resumeIdx = call.args.indexOf('resume');
    expect(resumeIdx).toBeGreaterThan(-1);
    expect(call.args[resumeIdx + 1]).toBe('thread-x');
    expect(call.args[resumeIdx + 2]).toBe('-');
  });

  test('adds - without resume when no sessionId', async () => {
    const adapter = new CodexAdapter('codex');
    await adapter.execute(baseOptions);

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.args[call.args.length - 1]).toBe('-');
    expect(call.args).not.toContain('resume');
  });

  test('passes prompt via stdin', async () => {
    const adapter = new CodexAdapter('codex');
    await adapter.execute({ ...baseOptions, prompt: 'codex prompt' });

    const call = mockRunCLIProcess.mock.calls[0][0];
    expect(call.stdin).toBe('codex prompt');
  });

  test('returns costUsd as null always', async () => {
    const adapter = new CodexAdapter('codex');
    const result = await adapter.execute(baseOptions);

    expect(result.costUsd).toBeNull();
  });

  test('retries on unknown session error', async () => {
    mockRunCLIProcess
      .mockResolvedValueOnce({
        exitCode: 1, signal: null, timedOut: false,
        stdout: '', stderr: 'unknown thread xyz',
      })
      .mockResolvedValueOnce({
        exitCode: 0, signal: null, timedOut: false, stdout: CODEX_STDOUT, stderr: '',
      });

    const adapter = new CodexAdapter('codex');
    const result = await adapter.execute({ ...baseOptions, sessionId: 'xyz' });

    expect(mockRunCLIProcess).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('Codex output');
  });
});

describe('CodexAdapter.probe', () => {
  test('returns available:true for working command', async () => {
    mockRunCLIProcess.mockResolvedValue({
      exitCode: 0, signal: null, timedOut: false,
      stdout: 'codex 1.2.3', stderr: '',
    });

    const adapter = new CodexAdapter('codex');
    const result = await adapter.probe();

    expect(result.available).toBe(true);
    expect(result.version).toBe('codex 1.2.3');
  });
});
