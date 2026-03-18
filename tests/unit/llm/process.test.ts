import { describe, test, expect } from 'vitest';
import { runCLIProcess } from '../../../src/llm/process.js';

const baseEnv = { PATH: process.env.PATH ?? '' };

describe('runCLIProcess', () => {
  test('captures stdout from a simple echo command', async () => {
    const result = await runCLIProcess({
      command: 'echo',
      args: ['hello world'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutSec: 10,
    });
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.exitCode).toBe(0);
  });

  test('captures stderr separately from stdout', async () => {
    const result = await runCLIProcess({
      command: 'sh',
      args: ['-c', 'echo out; echo err >&2'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutSec: 10,
    });
    expect(result.stdout.trim()).toBe('out');
    expect(result.stderr.trim()).toBe('err');
  });

  test('delivers stdin content to the child process', async () => {
    const result = await runCLIProcess({
      command: 'cat',
      args: [],
      cwd: process.cwd(),
      env: baseEnv,
      stdin: 'stdin-content',
      timeoutSec: 10,
    });
    expect(result.stdout.trim()).toBe('stdin-content');
  });

  test('returns timedOut:true when process exceeds timeout', async () => {
    const result = await runCLIProcess({
      command: 'sleep',
      args: ['60'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutSec: 1,
    });
    expect(result.timedOut).toBe(true);
  }, 10000);

  test('strips CLAUDECODE env vars from spawned environment', async () => {
    const result = await runCLIProcess({
      command: 'sh',
      args: ['-c', 'echo ${CLAUDECODE:-unset}'],
      cwd: process.cwd(),
      env: { ...baseEnv, CLAUDECODE: 'should-be-stripped' },
      timeoutSec: 10,
    });
    expect(result.stdout.trim()).toBe('unset');
  });

  test('caps stdout capture at 4MB', async () => {
    // Generate slightly more than 4MB output
    const result = await runCLIProcess({
      command: 'sh',
      args: ['-c', 'dd if=/dev/zero bs=1024 count=5000 2>/dev/null | tr "\\0" "A"'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutSec: 10,
    });
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(4_194_304);
  });

  test('returns exitCode from child process', async () => {
    const result = await runCLIProcess({
      command: 'sh',
      args: ['-c', 'exit 42'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutSec: 10,
    });
    expect(result.exitCode).toBe(42);
  });
});
