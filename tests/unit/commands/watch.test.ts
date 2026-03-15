import { describe, test, expect, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';

// We can't easily test the actual watch daemon (it runs indefinitely),
// but we can test the validation and edge cases.

describe('watchCommand validation', () => {
  test('rejects interval of 0', async () => {
    // Import dynamically to avoid side effects
    const { watchCommand } = await import('../../../src/commands/watch.js');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aphype-watch-'));
    const engine = new PipelineEngine(tmpDir);

    vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(watchCommand(engine, { interval: '0' }))
      .rejects.toThrow('Minimum is 1');

    vi.restoreAllMocks();
    await fs.remove(tmpDir);
  });

  test('rejects non-numeric interval', async () => {
    const { watchCommand } = await import('../../../src/commands/watch.js');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aphype-watch-'));
    const engine = new PipelineEngine(tmpDir);

    vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(watchCommand(engine, { interval: 'abc' }))
      .rejects.toThrow('Invalid interval');

    vi.restoreAllMocks();
    await fs.remove(tmpDir);
  });
});
