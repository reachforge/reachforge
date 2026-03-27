import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';
import { statusCommand } from '../../../src/commands/status.js';
import { scheduleCommand } from '../../../src/commands/schedule.js';
import { rollbackCommand } from '../../../src/commands/rollback.js';

let tmpDir: string;
let engine: PipelineEngine;
let jsonOutput: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-json-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();
  jsonOutput = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
    jsonOutput += typeof data === 'string' ? data : data.toString();
    return true;
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('statusCommand --json', () => {
  test('outputs valid JSON envelope', async () => {
    // Flat file in drafts
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'idea-1.md'), 'raw');
    await statusCommand(engine, { json: true });
    const result = JSON.parse(jsonOutput);
    expect(result.jsonVersion).toBe(1);
    expect(result.command).toBe('status');
    expect(result.success).toBe(true);
  });

  test('includes project stages with counts', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'idea-1.md'), 'raw');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'idea-2.md'), 'raw');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'draft-1.md'), 'draft');

    await statusCommand(engine, { json: true });
    const result = JSON.parse(jsonOutput);
    const stages = result.data.stages;

    expect(stages['01_drafts'].count).toBe(3);
    expect(stages['01_drafts'].items).toEqual(expect.arrayContaining(['idea-1', 'idea-2', 'draft-1']));
    expect(stages['02_adapted'].count).toBe(0);
    expect(stages['03_published'].count).toBe(0);
  });

  test('parses adapted items as article names', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'my-article.x.md'), 'content');
    await engine.metadata.writeArticleMeta('my-article', {
      status: 'scheduled',
      schedule: '2026-03-25T00:00',
    });
    await statusCommand(engine, { json: true });
    const result = JSON.parse(jsonOutput);
    const adapted = result.data.stages['02_adapted'];
    expect(adapted.count).toBe(1);
    expect(adapted.items[0]).toBe('my-article');
  });

  test('includes dueToday', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'urgent-post.x.md'), 'content');
    await engine.metadata.writeArticleMeta('urgent-post', {
      status: 'scheduled',
      schedule: '2020-01-01',
    });
    await statusCommand(engine, { json: true });
    const result = JSON.parse(jsonOutput);
    expect(result.data.dueToday.length).toBeGreaterThan(0);
    expect(result.data.dueToday[0]).toBe('urgent-post');
  });
});

describe('scheduleCommand --json', () => {
  test('outputs JSON', async () => {
    // Create adapted platform file (flat file)
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'my-article.x.md'), 'content');
    await engine.metadata.writeArticleMeta('my-article', { status: 'adapted' });

    await scheduleCommand(engine, 'my-article', '2026-04-01', { json: true });
    const result = JSON.parse(jsonOutput);
    expect(result.jsonVersion).toBe(1);
    expect(result.command).toBe('schedule');
    expect(result.success).toBe(true);
    expect(result.data.article).toBe('my-article');
    expect(result.data.date).toBe('2026-04-01T00:00:00');
    expect(result.data.stage).toBe('02_adapted');
  });

  test('dry-run outputs JSON', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'my-article.x.md'), 'content');
    await engine.metadata.writeArticleMeta('my-article', { status: 'adapted' });

    await scheduleCommand(engine, 'my-article', '2026-04-01', { dryRun: true, json: true });
    const result = JSON.parse(jsonOutput);
    expect(result.jsonVersion).toBe(1);
    expect(result.command).toBe('schedule');
    expect(result.success).toBe(true);
    expect(result.data.article).toBe('my-article');
    expect(result.data.date).toBe('2026-04-01T00:00:00');
  });
});

describe('rollbackCommand --json', () => {
  test('outputs JSON', async () => {
    // Flat file in 02_adapted
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'my-article.x.md'), 'adapted content');
    await engine.metadata.writeArticleMeta('my-article', { status: 'adapted' });

    await rollbackCommand(engine, 'my-article', { json: true });
    const result = JSON.parse(jsonOutput);
    expect(result.jsonVersion).toBe(1);
    expect(result.command).toBe('rollback');
    expect(result.success).toBe(true);
    expect(result.data.article).toBe('my-article');
    expect(result.data.from).toBe('02_adapted');
    expect(result.data.to).toBe('01_drafts');
    expect(result.data.timestamp).toBeDefined();
  });
});
