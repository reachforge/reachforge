import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';

import { draftCommand } from '../../../src/commands/draft.js';
import { adaptCommand } from '../../../src/commands/adapt.js';
import { scheduleCommand } from '../../../src/commands/schedule.js';
import { publishCommand } from '../../../src/commands/publish.js';
import { rollbackCommand } from '../../../src/commands/rollback.js';

const mockExecute = vi.fn();

vi.mock('../../../src/llm/factory.js', () => ({
  AdapterFactory: {
    create: () => ({
      adapter: { name: 'claude', command: 'claude', execute: mockExecute, probe: vi.fn() },
      resolver: { resolve: vi.fn().mockResolvedValue([]) },
    }),
  },
  LLMFactory: { create: vi.fn(), createFromApiKey: vi.fn() },
}));

function mockSuccess(content: string) {
  return { success: true, content, sessionId: null, usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, costUsd: null, model: 'mock', errorMessage: null, errorCode: null, exitCode: 0, timedOut: false };
}

let tmpDir: string;
let engine: PipelineEngine;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reachforge-cmd-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();
  // Default mock: echo prompt so content-based assertions see input text
  mockExecute.mockImplementation(async ({ prompt }: any) => mockSuccess(prompt));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('draftCommand', () => {
  test('generates draft from inbox file', async () => {
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'my-idea.md'), 'Build a CLI tool with Bun');

    await draftCommand(engine, 'my-idea.md');

    const draftExists = await fs.pathExists(path.join(tmpDir, '02_drafts', 'my-idea', 'draft.md'));
    expect(draftExists).toBe(true);
    const meta = await engine.metadata.readMeta('02_drafts', 'my-idea');
    expect(meta?.status).toBe('drafted');
  });

  test('generates draft from inbox directory with deterministic file selection', async () => {
    const dir = path.join(tmpDir, '01_inbox', 'multi-file');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'notes.txt'), 'some notes');
    await fs.writeFile(path.join(dir, 'main.md'), 'main content');
    await fs.writeFile(path.join(dir, 'other.md'), 'other content');

    await draftCommand(engine, 'multi-file');

    // mock echoes prompt which contains the selected file content
    const draft = await fs.readFile(path.join(tmpDir, '02_drafts', 'multi-file', 'draft.md'), 'utf-8');
    expect(draft).toContain('main content'); // main.md selected first, included in prompt
  });

  test('rejects path traversal in source name', async () => {
    await expect(draftCommand(engine, '../etc/passwd')).rejects.toThrow('Unsafe path');
  });
});

describe('adaptCommand', () => {
  test('adapts master article for multiple platforms in parallel', async () => {
    const masterDir = path.join(tmpDir, '03_master', 'my-article');
    await fs.ensureDir(masterDir);
    await fs.writeFile(path.join(masterDir, 'master.md'), '# Great Article\n\nContent here.');

    await adaptCommand(engine, 'my-article');

    const xExists = await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article', 'platform_versions', 'x.md'));
    const wechatExists = await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article', 'platform_versions', 'wechat.md'));
    const zhihuExists = await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article', 'platform_versions', 'zhihu.md'));
    expect(xExists).toBe(true);
    expect(wechatExists).toBe(true);
    expect(zhihuExists).toBe(true);
  });

  test('suggests rename when draft.md exists but master.md does not', async () => {
    const masterDir = path.join(tmpDir, '03_master', 'forgot-rename');
    await fs.ensureDir(masterDir);
    await fs.writeFile(path.join(masterDir, 'draft.md'), 'Forgot to rename');

    await expect(adaptCommand(engine, 'forgot-rename'))
      .rejects.toThrow('Did you mean to rename draft.md to master.md?');
  });

  test('respects --platforms flag', async () => {
    const masterDir = path.join(tmpDir, '03_master', 'custom-platforms');
    await fs.ensureDir(masterDir);
    await fs.writeFile(path.join(masterDir, 'master.md'), 'Content');

    await adaptCommand(engine, 'custom-platforms', { platforms: 'x,devto' });

    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'custom-platforms', 'platform_versions', 'x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'custom-platforms', 'platform_versions', 'devto.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'custom-platforms', 'platform_versions', 'wechat.md'))).toBe(false);
  });
});

describe('scheduleCommand', () => {
  test('moves article from adapted to scheduled with date prefix', async () => {
    await fs.ensureDir(path.join(tmpDir, '04_adapted', 'my-article'));
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'my-article', 'meta.yaml'), 'article: my-article\nstatus: adapted\n');

    await scheduleCommand(engine, 'my-article', '2026-03-20');

    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-03-20-my-article'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article'))).toBe(false);
  });

  test('dry-run does not move files', async () => {
    await fs.ensureDir(path.join(tmpDir, '04_adapted', 'dry-test'));

    await scheduleCommand(engine, 'dry-test', '2026-03-20', { dryRun: true });

    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'dry-test'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-03-20-dry-test'))).toBe(false);
  });

  test('rejects invalid date', async () => {
    await expect(scheduleCommand(engine, 'test', '03/20/2026')).rejects.toThrow('Invalid date');
  });
});

describe('publishCommand', () => {
  test('publishes due items and moves to sent', async () => {
    const today = new Date().toISOString().split('T')[0];
    const projDir = path.join(tmpDir, '05_scheduled', `${today}-publish-test`);
    const versionsDir = path.join(projDir, 'platform_versions');
    await fs.ensureDir(versionsDir);
    await fs.writeFile(path.join(versionsDir, 'x.md'), 'thread content');
    await fs.writeFile(path.join(projDir, 'meta.yaml'), `article: publish-test\nstatus: scheduled\n`);

    await publishCommand(engine);

    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}-publish-test`))).toBe(true);
    expect(await fs.pathExists(projDir)).toBe(false);
  });

  test('dry-run does not publish', async () => {
    const today = new Date().toISOString().split('T')[0];
    const projDir = path.join(tmpDir, '05_scheduled', `${today}-dry-pub`);
    await fs.ensureDir(projDir);

    await publishCommand(engine, { dryRun: true });

    expect(await fs.pathExists(projDir)).toBe(true);
  });

  test('does nothing when no items are due', async () => {
    await publishCommand(engine);
    // No error, just silent
  });

  test('blocks publish when validation fails', async () => {
    const today = new Date().toISOString().split('T')[0];
    const projDir = path.join(tmpDir, '05_scheduled', `${today}-invalid-content`);
    const versionsDir = path.join(projDir, 'platform_versions');
    await fs.ensureDir(versionsDir);
    // X content exceeding 280 chars
    await fs.writeFile(path.join(versionsDir, 'x.md'), 'a'.repeat(300));
    await fs.writeFile(path.join(projDir, 'meta.yaml'), `article: invalid-content\nstatus: scheduled\n`);

    await publishCommand(engine);

    // Should remain in scheduled (validation blocked it)
    expect(await fs.pathExists(projDir)).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}-invalid-content`))).toBe(false);
  });
});

describe('rollbackCommand', () => {
  test('rolls back a scheduled project', async () => {
    const projDir = path.join(tmpDir, '05_scheduled', '2026-03-20-rollback-test');
    await fs.ensureDir(projDir);
    await fs.writeFile(path.join(projDir, 'meta.yaml'), 'article: rollback-test\nstatus: scheduled\n');

    await rollbackCommand(engine, 'rollback-test');

    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'rollback-test'))).toBe(true);
    expect(await fs.pathExists(projDir)).toBe(false);
  });
});
