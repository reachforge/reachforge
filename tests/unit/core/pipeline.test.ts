import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';
import { STAGES } from '../../../src/core/constants.js';

let tmpDir: string;
let engine: PipelineEngine;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-test-'));
  engine = new PipelineEngine(tmpDir);
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('PipelineEngine.initPipeline', () => {
  test('creates all 3 stage directories', async () => {
    await engine.initPipeline();
    for (const stage of STAGES) {
      const exists = await fs.pathExists(path.join(tmpDir, stage));
      expect(exists).toBe(true);
    }
  });

  test('is idempotent (safe to call twice)', async () => {
    await engine.initPipeline();
    await engine.initPipeline();
    const items = await fs.readdir(tmpDir);
    expect(items.filter(i => !i.startsWith('.')).length).toBe(3);
  });
});

describe('PipelineEngine.getStatus', () => {
  test('returns status with all stages and counts', async () => {
    await engine.initPipeline();
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'post-a.md'), 'raw');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'post-b.x.md'), 'adapted');
    const status = await engine.getStatus();
    expect(status.stages['01_drafts'].count).toBe(1);
    expect(status.stages['02_adapted'].count).toBe(1);
    expect(status.stages['03_published'].count).toBe(0);
    expect(status.totalProjects).toBe(2);
  });
});
