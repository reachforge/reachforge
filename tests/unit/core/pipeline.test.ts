import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';
import { ProjectNotFoundError, ReachforgeError } from '../../../src/types/index.js';
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
  test('creates all 6 stage directories', async () => {
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
    expect(items.filter(i => !i.startsWith('.')).length).toBe(6);
  });
});

describe('PipelineEngine.listProjects', () => {
  test('returns empty array for empty stage', async () => {
    await engine.initPipeline();
    const items = await engine.listProjects('01_inbox');
    expect(items).toEqual([]);
  });

  test('lists project directories, sorted', async () => {
    await engine.initPipeline();
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'zebra-post'));
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'alpha-post'));
    const items = await engine.listProjects('01_inbox');
    expect(items).toEqual(['alpha-post', 'zebra-post']);
  });

  test('excludes hidden files and .yaml files', async () => {
    await engine.initPipeline();
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'real-project'));
    await fs.writeFile(path.join(tmpDir, '01_inbox', '.hidden'), '');
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'template.yaml'), '');
    const items = await engine.listProjects('01_inbox');
    expect(items).toEqual(['real-project']);
  });
});

describe('PipelineEngine.getStatus', () => {
  test('returns status with all stages and counts', async () => {
    await engine.initPipeline();
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'post-a'));
    await fs.ensureDir(path.join(tmpDir, '02_drafts', 'post-b'));
    const status = await engine.getStatus();
    expect(status.stages['01_inbox'].count).toBe(1);
    expect(status.stages['02_drafts'].count).toBe(1);
    expect(status.stages['03_master'].count).toBe(0);
    expect(status.totalProjects).toBe(2);
  });
});

describe('PipelineEngine.moveProject', () => {
  test('moves a project between stages', async () => {
    await engine.initPipeline();
    await fs.ensureDir(path.join(tmpDir, '04_adapted', 'my-article'));
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'my-article', 'meta.yaml'), 'article: my-article\nstatus: adapted\n');

    const result = await engine.moveProject('my-article', '04_adapted', '05_scheduled', '2026-03-20-my-article');

    expect(result.from).toBe('04_adapted');
    expect(result.to).toBe('05_scheduled');
    expect(result.project).toBe('2026-03-20-my-article');
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-03-20-my-article'))).toBe(true);
  });

  test('throws ProjectNotFoundError for missing source', async () => {
    await engine.initPipeline();
    await expect(engine.moveProject('nonexistent', '01_inbox', '02_drafts'))
      .rejects.toThrow(ProjectNotFoundError);
  });

  test('throws ReachforgeError if target already exists', async () => {
    await engine.initPipeline();
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'dup'));
    await fs.ensureDir(path.join(tmpDir, '02_drafts', 'dup'));
    await expect(engine.moveProject('dup', '01_inbox', '02_drafts'))
      .rejects.toThrow(ReachforgeError);
  });

  test('uses copy+remove for safe move (not rename)', async () => {
    await engine.initPipeline();
    const srcDir = path.join(tmpDir, '01_inbox', 'safe-move');
    await fs.ensureDir(srcDir);
    await fs.writeFile(path.join(srcDir, 'content.md'), 'test content');

    await engine.moveProject('safe-move', '01_inbox', '02_drafts');

    // Source should be gone
    expect(await fs.pathExists(srcDir)).toBe(false);
    // Target should have content
    const content = await fs.readFile(path.join(tmpDir, '02_drafts', 'safe-move', 'content.md'), 'utf-8');
    expect(content).toBe('test content');
  });
});

describe('PipelineEngine.rollbackProject', () => {
  test('rolls back from scheduled to adapted, stripping date prefix', async () => {
    await engine.initPipeline();
    const projDir = path.join(tmpDir, '05_scheduled', '2026-03-20-my-article');
    await fs.ensureDir(projDir);
    await fs.writeFile(path.join(projDir, 'meta.yaml'), 'article: my-article\nstatus: scheduled\n');

    const result = await engine.rollbackProject('my-article');

    expect(result.from).toBe('05_scheduled');
    expect(result.to).toBe('04_adapted');
    expect(result.project).toBe('my-article');
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article'))).toBe(true);
  });

  test('throws when project is in first stage', async () => {
    await engine.initPipeline();
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'first'));
    await expect(engine.rollbackProject('first')).rejects.toThrow('already in the first stage');
  });

  test('throws when project not found anywhere', async () => {
    await engine.initPipeline();
    await expect(engine.rollbackProject('ghost')).rejects.toThrow(ProjectNotFoundError);
  });
});

describe('PipelineEngine.findDueProjects', () => {
  test('returns projects with date <= today', async () => {
    await engine.initPipeline();
    const today = new Date().toISOString().split('T')[0];
    const past = '2020-01-01';
    const future = '2099-12-31';
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', `${past}-old-post`));
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', `${today}-today-post`));
    await fs.ensureDir(path.join(tmpDir, '05_scheduled', `${future}-future-post`));

    const due = await engine.findDueProjects();
    expect(due).toContain(`${past}-old-post`);
    expect(due).toContain(`${today}-today-post`);
    expect(due).not.toContain(`${future}-future-post`);
  });
});
