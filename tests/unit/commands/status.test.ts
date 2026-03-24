import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';
import { statusCommand } from '../../../src/commands/status.js';

let tmpDir: string;
let engine: PipelineEngine;
let logOutput: string[];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-status-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();
  logOutput = [];
  vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
    logOutput.push(args.map(String).join(' '));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('statusCommand', () => {
  test('shows dashboard header', async () => {
    await statusCommand(engine);
    const output = logOutput.join('\n');
    expect(output).toContain('Dashboard');
  });

  test('shows all 6 stages', async () => {
    await statusCommand(engine);
    const output = logOutput.join('\n');
    expect(output).toContain('01_inbox');
    expect(output).toContain('02_drafts');
    expect(output).toContain('03_master');
    expect(output).toContain('04_adapted');
    expect(output).toContain('05_scheduled');
    expect(output).toContain('06_sent');
  });

  test('shows item counts', async () => {
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'idea-1.md'), 'raw');
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'idea-2.md'), 'raw');

    await statusCommand(engine);
    const output = logOutput.join('\n');
    expect(output).toContain('2');
    expect(output).toContain('idea-1');
    expect(output).toContain('idea-2');
  });

  test('shows due today items', async () => {
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'urgent-post.x.md'), 'content');
    await engine.metadata.writeArticleMeta('urgent-post', {
      status: 'scheduled',
      schedule: '2020-01-01',
    });

    await statusCommand(engine);
    const output = logOutput.join('\n');
    expect(output).toContain('Due today');
    expect(output).toContain('urgent-post');
  });

  test('empty pipeline shows zero counts', async () => {
    await statusCommand(engine);
    const output = logOutput.join('\n');
    // All stages should show 0
    const zeroMatches = output.match(/0/g);
    expect(zeroMatches).not.toBeNull();
    expect(zeroMatches!.length).toBeGreaterThanOrEqual(6);
  });
});
