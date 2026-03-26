import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';

import { draftCommand } from '../../../src/commands/draft.js';
import { adaptCommand } from '../../../src/commands/adapt.js';
import { scheduleCommand } from '../../../src/commands/schedule.js';
import { publishCommand, isExternalFile, parsePlatformFilter } from '../../../src/commands/publish.js';
import { rollbackCommand } from '../../../src/commands/rollback.js';
import { approveCommand } from '../../../src/commands/approve.js';

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-cmd-'));
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

    // Flat file: 02_drafts/my-idea.md
    const draftExists = await fs.pathExists(path.join(tmpDir, '02_drafts', 'my-idea.md'));
    expect(draftExists).toBe(true);
    const meta = await engine.metadata.readArticleMeta('my-idea');
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
    const draft = await fs.readFile(path.join(tmpDir, '02_drafts', 'multi-file.md'), 'utf-8');
    expect(draft).toContain('main content'); // main.md selected first, included in prompt
  });

  test('rejects path traversal in source name', async () => {
    await expect(draftCommand(engine, '../etc/passwd')).rejects.toThrow('Unsafe path');
  });
});

describe('adaptCommand', () => {
  test('adapts master article for multiple platforms in parallel', async () => {
    // Flat file: 03_master/my-article.md
    await fs.writeFile(path.join(tmpDir, '03_master', 'my-article.md'), '# Great Article\n\nContent here.');

    await adaptCommand(engine, 'my-article');

    // Flat files: 04_adapted/my-article.{platform}.md
    const xExists = await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article.x.md'));
    const wechatExists = await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article.wechat.md'));
    const zhihuExists = await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article.zhihu.md'));
    expect(xExists).toBe(true);
    expect(wechatExists).toBe(true);
    expect(zhihuExists).toBe(true);
  });

  test('throws when master article does not exist', async () => {
    await expect(adaptCommand(engine, 'nonexistent'))
      .rejects.toThrow('not found');
  });

  test('respects --platforms flag', async () => {
    await fs.writeFile(path.join(tmpDir, '03_master', 'custom-platforms.md'), 'Content');

    await adaptCommand(engine, 'custom-platforms', { platforms: 'x,devto' });

    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'custom-platforms.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'custom-platforms.devto.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'custom-platforms.wechat.md'))).toBe(false);
  });
});

describe('scheduleCommand', () => {
  test('moves article from adapted to scheduled and stores date in meta', async () => {
    // Create adapted platform files (flat files)
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'my-article.x.md'), 'x content');
    await engine.metadata.writeArticleMeta('my-article', { status: 'adapted' });

    await scheduleCommand(engine, 'my-article', '2026-03-20');

    // Files moved to 05_scheduled as flat files
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'my-article.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'my-article.x.md'))).toBe(false);
    // Schedule stored in meta.yaml
    const meta = await engine.metadata.readArticleMeta('my-article');
    expect(meta?.status).toBe('scheduled');
    expect(meta?.schedule).toBe('2026-03-20T00-00-00');
  });

  test('dry-run does not move files', async () => {
    await fs.writeFile(path.join(tmpDir, '04_adapted', 'dry-test.x.md'), 'content');

    await scheduleCommand(engine, 'dry-test', '2026-03-20', { dryRun: true });

    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'dry-test.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'dry-test.x.md'))).toBe(false);
  });

  test('rejects invalid date', async () => {
    await expect(scheduleCommand(engine, 'test', '03/20/2026')).rejects.toThrow('Invalid date');
  });
});

describe('publishCommand', () => {
  test('publishes due items and moves to sent', async () => {
    const today = new Date().toISOString().split('T')[0];
    // Create scheduled platform file (flat file)
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'publish-test.x.md'), 'thread content');
    await engine.metadata.writeArticleMeta('publish-test', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine);

    // Moved to 06_sent as flat file
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', 'publish-test.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'publish-test.x.md'))).toBe(false);
  });

  test('dry-run does not publish', async () => {
    const today = new Date().toISOString().split('T')[0];
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'dry-pub.x.md'), 'content');
    await engine.metadata.writeArticleMeta('dry-pub', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine, { dryRun: true });

    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'dry-pub.x.md'))).toBe(true);
  });

  test('does nothing when no items are due', async () => {
    await publishCommand(engine);
    // No error, just silent
  });

  test('blocks publish when validation fails', async () => {
    const today = new Date().toISOString().split('T')[0];
    // X content exceeding 280 chars
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'invalid-content.x.md'), 'a'.repeat(300));
    await engine.metadata.writeArticleMeta('invalid-content', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine);

    // Should remain in scheduled (validation blocked it)
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'invalid-content.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', 'invalid-content.x.md'))).toBe(false);
  });
});

describe('publishCommand — single pipeline article', () => {
  test('publishes a specific article by name', async () => {
    const today = new Date().toISOString().split('T')[0];
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'specific.x.md'), 'thread');
    await engine.metadata.writeArticleMeta('specific', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine, { article: 'specific' });

    expect(await fs.pathExists(path.join(tmpDir, '06_sent', 'specific.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'specific.x.md'))).toBe(false);
  });

  test('filters platforms when --platforms is set', async () => {
    const today = new Date().toISOString().split('T')[0];
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'multi.x.md'), 'thread');
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'multi.devto.md'), '---\ntitle: DevTo Article\n---\n# DevTo Article');
    await engine.metadata.writeArticleMeta('multi', {
      status: 'scheduled',
      schedule: today,
    });

    // Only publish devto
    await publishCommand(engine, { article: 'multi', platforms: 'devto' });

    // Partial publish: should NOT move to 06_sent (x not done)
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'multi.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'multi.devto.md'))).toBe(true);

    // Meta should show devto published
    const meta = await engine.metadata.readArticleMeta('multi');
    expect(meta?.platforms?.devto?.status).toBe('success');
  });

  test('throws when article not in 05_scheduled', async () => {
    await expect(publishCommand(engine, { article: 'nonexistent' }))
      .rejects.toThrow('not found in 05_scheduled');
  });
});

describe('publishCommand — external file', () => {
  test('publishes external file and tracks in pipeline', async () => {
    const extFile = path.join(tmpDir, 'external-post.md');
    await fs.writeFile(extFile, '# External Post\nContent here.');

    // Use linkedin (no validator registered — passes by default)
    await publishCommand(engine, { article: extFile, platforms: 'linkedin' });

    // Should be tracked in 06_sent
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', 'external-post.linkedin.md'))).toBe(true);

    // Should have meta.yaml entry
    const meta = await engine.metadata.readArticleMeta('external-post');
    expect(meta?.status).toBe('published');
    expect(meta?.platforms?.linkedin?.status).toBe('success');
  });

  test('publishes external file with --skip-track skips pipeline', async () => {
    const extFile = path.join(tmpDir, 'notrack-post.md');
    await fs.writeFile(extFile, '# No Track Post');

    await publishCommand(engine, { article: extFile, platforms: 'linkedin', skipTrack: true });

    // Should NOT be in 06_sent
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', 'notrack-post.linkedin.md'))).toBe(false);

    // Should NOT have meta.yaml entry
    const meta = await engine.metadata.readArticleMeta('notrack-post');
    expect(meta).toBeNull();
  });

  test('throws when --platforms not provided for external file', async () => {
    const extFile = path.join(tmpDir, 'no-platforms.md');
    await fs.writeFile(extFile, '# Post');

    await expect(publishCommand(engine, { article: extFile }))
      .rejects.toThrow('requires --platforms');
  });

  test('throws when external file does not exist', async () => {
    const fakePath = path.join(tmpDir, 'subdir', 'nope.md');
    await expect(publishCommand(engine, { article: fakePath, platforms: 'linkedin' }))
      .rejects.toThrow('File not found');
  });
});

describe('publishCommand — batch with --platforms filter', () => {
  test('batch mode filters platforms', async () => {
    const today = new Date().toISOString().split('T')[0];
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'batch-filter.x.md'), 'thread');
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'batch-filter.devto.md'), '# DevTo');
    await engine.metadata.writeArticleMeta('batch-filter', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine, { platforms: 'x' });

    // Only x should be published, devto skipped
    const meta = await engine.metadata.readArticleMeta('batch-filter');
    expect(meta?.platforms?.x?.status).toBe('success');
    expect(meta?.platforms?.devto).toBeUndefined();
  });
});

describe('isExternalFile', () => {
  test('absolute path is external', () => {
    expect(isExternalFile('/home/user/post.md')).toBe(true);
  });

  test('relative path with slash is external', () => {
    expect(isExternalFile('./my-post.md')).toBe(true);
    expect(isExternalFile('../post.md')).toBe(true);
    expect(isExternalFile('subdir/post.md')).toBe(true);
  });

  test('plain name is not external', () => {
    expect(isExternalFile('my-article')).toBe(false);
    expect(isExternalFile('my-article.md')).toBe(false);
  });
});

describe('parsePlatformFilter', () => {
  test('returns null for undefined', () => {
    expect(parsePlatformFilter(undefined)).toBeNull();
  });

  test('splits comma-separated platforms', () => {
    expect(parsePlatformFilter('devto,hashnode')).toEqual(['devto', 'hashnode']);
  });

  test('trims whitespace', () => {
    expect(parsePlatformFilter('devto , hashnode')).toEqual(['devto', 'hashnode']);
  });

  test('filters empty strings', () => {
    expect(parsePlatformFilter('devto,,hashnode')).toEqual(['devto', 'hashnode']);
  });
});

describe('approveCommand', () => {
  test('promotes draft to master as flat file', async () => {
    // Flat file: 02_drafts/my-article.md
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'my-article.md'), '# My Draft');
    await engine.metadata.writeArticleMeta('my-article', { status: 'drafted' });

    await approveCommand(engine, 'my-article');

    // Moved to 03_master as flat file (no rename needed)
    expect(await fs.pathExists(path.join(tmpDir, '03_master', 'my-article.md'))).toBe(true);
    // Source removed
    expect(await fs.pathExists(path.join(tmpDir, '02_drafts', 'my-article.md'))).toBe(false);
    // Metadata updated
    const meta = await engine.metadata.readArticleMeta('my-article');
    expect(meta?.status).toBe('master');
  });

  test('throws when draft does not exist', async () => {
    await expect(approveCommand(engine, 'nonexistent')).rejects.toThrow('not found');
  });

  test('throws when target already exists in master', async () => {
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'dup-article.md'), 'draft');
    await fs.writeFile(path.join(tmpDir, '03_master', 'dup-article.md'), 'master');

    await expect(approveCommand(engine, 'dup-article')).rejects.toThrow('already exists');
  });
});

describe('rollbackCommand', () => {
  test('rolls back a scheduled article', async () => {
    // Flat file in 05_scheduled
    await fs.writeFile(path.join(tmpDir, '05_scheduled', 'rollback-test.x.md'), 'content');
    await engine.metadata.writeArticleMeta('rollback-test', { status: 'scheduled' });

    await rollbackCommand(engine, 'rollback-test');

    // Moved back to 04_adapted as flat file
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'rollback-test.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', 'rollback-test.x.md'))).toBe(false);
  });
});
