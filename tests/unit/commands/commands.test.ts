import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';

import { draftCommand } from '../../../src/commands/draft.js';
import { adaptCommand } from '../../../src/commands/adapt.js';
import { scheduleCommand } from '../../../src/commands/schedule.js';
import { publishCommand, isExternalFile, parsePlatformFilter, ensurePlatformFrontmatter, extractCoverFromContent, resolveCoverImage } from '../../../src/commands/publish.js';
import { rollbackCommand } from '../../../src/commands/rollback.js';

const mockExecute = vi.fn();

vi.mock('../../../src/llm/factory.js', () => ({
  AdapterFactory: {
    create: () => ({
      adapter: { name: 'claude', command: 'claude', execute: mockExecute, probe: vi.fn() },
      resolver: { resolve: vi.fn().mockResolvedValue([]) },
    }),
  },
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
  test('generates draft from prompt string', async () => {
    await draftCommand(engine, 'Build a CLI tool with Bun');

    // Flat file: 01_drafts/{slug}.md
    const drafts = await engine.listArticles('01_drafts');
    expect(drafts.length).toBeGreaterThan(0);
    const meta = await engine.metadata.readArticleMeta(drafts[0]);
    expect(meta?.status).toBe('drafted');
  });

  test('generates draft from file path', async () => {
    const inputFile = path.join(tmpDir, 'my-idea.md');
    await fs.writeFile(inputFile, 'Build a CLI tool with Bun');

    await draftCommand(engine, inputFile);

    const draftExists = await fs.pathExists(path.join(tmpDir, '01_drafts', 'my-idea.md'));
    expect(draftExists).toBe(true);
    const meta = await engine.metadata.readArticleMeta('my-idea');
    expect(meta?.status).toBe('drafted');
  });

  test('generates draft from directory with deterministic file selection', async () => {
    const dir = path.join(tmpDir, 'multi-file');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'notes.txt'), 'some notes');
    await fs.writeFile(path.join(dir, 'main.md'), 'main content');
    await fs.writeFile(path.join(dir, 'other.md'), 'other content');

    await draftCommand(engine, dir);

    // mock echoes prompt which contains the selected file content
    const draft = await fs.readFile(path.join(tmpDir, '01_drafts', 'multi-file.md'), 'utf-8');
    expect(draft).toContain('main content'); // main.md selected first, included in prompt
  });

  test('rejects non-existent file path with error', async () => {
    await expect(draftCommand(engine, '../etc/passwd')).rejects.toThrow('File not found');
  });

  test('rejects empty input', async () => {
    await expect(draftCommand(engine, '')).rejects.toThrow('Input is required');
  });
});

describe('adaptCommand', () => {
  test('adapts draft article for multiple platforms in parallel', async () => {
    // Flat file: 01_drafts/my-article.md
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'my-article.md'), '# Great Article\n\nContent here.');

    await adaptCommand(engine, 'my-article', { platforms: 'x,wechat,zhihu' });

    // Flat files: 02_adapted/my-article.{platform}.md
    const xExists = await fs.pathExists(path.join(tmpDir, '02_adapted', 'my-article.x.md'));
    const wechatExists = await fs.pathExists(path.join(tmpDir, '02_adapted', 'my-article.wechat.md'));
    const zhihuExists = await fs.pathExists(path.join(tmpDir, '02_adapted', 'my-article.zhihu.md'));
    expect(xExists).toBe(true);
    expect(wechatExists).toBe(true);
    expect(zhihuExists).toBe(true);
  });

  test('throws when no platforms configured and no flag specified', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'no-platforms.md'), 'Content');
    await expect(adaptCommand(engine, 'no-platforms'))
      .rejects.toThrow(/No platforms configured/);
  });

  test('throws when draft article does not exist', async () => {
    await expect(adaptCommand(engine, 'nonexistent'))
      .rejects.toThrow('not found');
  });

  test('respects --platforms flag', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'custom-platforms.md'), 'Content');

    await adaptCommand(engine, 'custom-platforms', { platforms: 'x,devto' });

    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'custom-platforms.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'custom-platforms.devto.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'custom-platforms.wechat.md'))).toBe(false);
  });
});

describe('scheduleCommand', () => {
  test('sets schedule metadata without moving files', async () => {
    // Create adapted platform files (flat files)
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'my-article.x.md'), 'x content');
    await engine.metadata.writeArticleMeta('my-article', { status: 'adapted' });

    await scheduleCommand(engine, 'my-article', '2026-03-20');

    // Files stay in 02_adapted (metadata-only schedule)
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'my-article.x.md'))).toBe(true);
    // Schedule stored in meta.yaml
    const meta = await engine.metadata.readArticleMeta('my-article');
    expect(meta?.status).toBe('scheduled');
    expect(meta?.schedule).toBe('2026-03-20T00:00:00');
  });

  test('dry-run does not write metadata', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'dry-test.x.md'), 'content');
    await engine.metadata.writeArticleMeta('dry-test', { status: 'adapted' });

    await scheduleCommand(engine, 'dry-test', '2026-03-20', { dryRun: true });

    // Files still in 02_adapted
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'dry-test.x.md'))).toBe(true);
    // Metadata should NOT be updated to scheduled
    const meta = await engine.metadata.readArticleMeta('dry-test');
    expect(meta?.status).toBe('adapted');
  });

  test('rejects invalid date', async () => {
    // Article must exist for date validation to be reached
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'test.x.md'), 'x');
    await engine.metadata.writeArticleMeta('test', { status: 'adapted' });
    await expect(scheduleCommand(engine, 'test', '03/20/2026')).rejects.toThrow('Invalid date');
  });

  test('--clear unschedules article back to adapted', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'clear-test.x.md'), 'x content');
    await engine.metadata.writeArticleMeta('clear-test', {
      status: 'scheduled',
      schedule: '2026-06-01T00:00:00',
    });

    await scheduleCommand(engine, 'clear-test', '', { clear: true });

    const meta = await engine.metadata.readArticleMeta('clear-test');
    expect(meta?.status).toBe('adapted');
    expect(meta?.schedule).toBeUndefined();
    // Files still in 02_adapted
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'clear-test.x.md'))).toBe(true);
  });

  test('--clear on non-scheduled article is idempotent', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'idem-test.x.md'), 'x');
    await engine.metadata.writeArticleMeta('idem-test', { status: 'adapted' });

    await scheduleCommand(engine, 'idem-test', '', { clear: true });

    const meta = await engine.metadata.readArticleMeta('idem-test');
    expect(meta?.status).toBe('adapted');
  });
});

describe('publishCommand', () => {
  test('publishes due items and moves to published', async () => {
    const today = new Date().toISOString().split('T')[0];
    // Create adapted platform file with scheduled status
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'publish-test.x.md'), 'thread content');
    await engine.metadata.writeArticleMeta('publish-test', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine);

    // Moved to 03_published as flat file
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'publish-test.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'publish-test.x.md'))).toBe(false);
  });

  test('dry-run does not publish', async () => {
    const today = new Date().toISOString().split('T')[0];
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'dry-pub.x.md'), 'content');
    await engine.metadata.writeArticleMeta('dry-pub', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine, { dryRun: true });

    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'dry-pub.x.md'))).toBe(true);
  });

  test('does nothing when no items are due', async () => {
    await publishCommand(engine);
    // No error, just silent
  });

  test('blocks publish when validation fails', async () => {
    const today = new Date().toISOString().split('T')[0];
    // X content exceeding 280 chars
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'invalid-content.x.md'), 'a'.repeat(300));
    await engine.metadata.writeArticleMeta('invalid-content', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine);

    // Should remain in 02_adapted (validation blocked it)
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'invalid-content.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'invalid-content.x.md'))).toBe(false);
  });
});

describe('publishCommand — single pipeline article', () => {
  test('publishes a specific article by name', async () => {
    const today = new Date().toISOString().split('T')[0];
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'specific.x.md'), 'thread');
    await engine.metadata.writeArticleMeta('specific', {
      status: 'scheduled',
      schedule: today,
    });

    await publishCommand(engine, { article: 'specific' });

    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'specific.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'specific.x.md'))).toBe(false);
  });

  test('filters platforms when --platforms is set', async () => {
    const today = new Date().toISOString().split('T')[0];
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'multi.x.md'), 'thread');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'multi.devto.md'), '---\ntitle: DevTo Article\n---\n# DevTo Article');
    await engine.metadata.writeArticleMeta('multi', {
      status: 'scheduled',
      schedule: today,
    });

    // Only publish devto
    await publishCommand(engine, { article: 'multi', platforms: 'devto' });

    // Partial publish: should NOT move to 03_published (x not done)
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'multi.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'multi.devto.md'))).toBe(true);

    // Meta should show devto published
    const meta = await engine.metadata.readArticleMeta('multi');
    expect(meta?.platforms?.devto?.status).toBe('success');
  });

  test('throws when article not in 02_adapted', async () => {
    await expect(publishCommand(engine, { article: 'nonexistent' }))
      .rejects.toThrow('not found in 02_adapted');
  });
});

describe('publishCommand — external file', () => {
  test('publishes external file without tracking by default', async () => {
    const extFile = path.join(tmpDir, 'external-post.md');
    await fs.writeFile(extFile, '# External Post\nContent here.');

    // Default: no tracking — no 03_published, no meta.yaml
    await publishCommand(engine, { article: extFile, platforms: 'linkedin' });

    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'external-post.linkedin.md'))).toBe(false);
    const meta = await engine.metadata.readArticleMeta('external-post');
    expect(meta).toBeNull();
  });

  test('publishes external file with --track imports to pipeline then publishes', async () => {
    const extFile = path.join(tmpDir, 'tracked-post.md');
    await fs.writeFile(extFile, '# Tracked Post');

    await publishCommand(engine, { article: extFile, platforms: 'linkedin', track: true });

    // Should be archived in 03_published (moved from 02_adapted after publish)
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'tracked-post.linkedin.md'))).toBe(true);
    // 02_adapted should be empty (files moved to 03_published)
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'tracked-post.linkedin.md'))).toBe(false);

    // Should have meta.yaml entry
    const meta = await engine.metadata.readArticleMeta('tracked-post');
    expect(meta?.status).toBe('published');
    expect(meta?.platforms?.linkedin?.status).toBe('success');
  });

  test('publishes external file without engine (no project context)', async () => {
    const extFile = path.join(tmpDir, 'standalone-post.md');
    await fs.writeFile(extFile, '# Standalone Post');

    // engine = null, no tracking
    await publishCommand(null, { article: extFile, platforms: 'linkedin' });

    // Should NOT crash, should NOT track
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'standalone-post.linkedin.md'))).toBe(false);
  });

  test('throws when --platforms not provided and no project.yaml', async () => {
    const extFile = path.join(tmpDir, 'no-platforms.md');
    await fs.writeFile(extFile, '# Post');

    await expect(publishCommand(engine, { article: extFile }))
      .rejects.toThrow('No platforms specified');
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
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'batch-filter.x.md'), 'thread');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'batch-filter.devto.md'), '# DevTo');
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

  test('filename with document extension is external', () => {
    expect(isExternalFile('my-article.md')).toBe(true);
    expect(isExternalFile('post.txt')).toBe(true);
    expect(isExternalFile('page.html')).toBe(true);
    expect(isExternalFile('page.HTM')).toBe(true);
    expect(isExternalFile('draft.mdx')).toBe(true);
  });

  test('plain name or dotted article name is not external', () => {
    expect(isExternalFile('my-article')).toBe(false);
    expect(isExternalFile('some-post')).toBe(false);
    expect(isExternalFile('v2.0-release')).toBe(false);
    expect(isExternalFile('part1.final')).toBe(false);
  });
});

describe('ensurePlatformFrontmatter', () => {
  const mdContent = '# My Article\n\nSome content here.';

  test('injects devto frontmatter when missing', () => {
    const result = ensurePlatformFrontmatter(mdContent, 'devto');
    expect(result.injected).toBe(true);
    expect(result.content).toMatch(/^---\ntitle: "My Article"\npublished: true\n---\n/);
    expect(result.content).toContain('# My Article');
    expect(result.fields).toEqual({ title: '"My Article"', published: 'true' });
  });

  test('injects devto frontmatter with draft flag', () => {
    const result = ensurePlatformFrontmatter(mdContent, 'devto', { draft: true });
    expect(result.content).toMatch(/published: false/);
    expect(result.fields?.published).toBe('false');
  });

  test('injects hashnode frontmatter when missing', () => {
    const result = ensurePlatformFrontmatter(mdContent, 'hashnode');
    expect(result.injected).toBe(true);
    expect(result.content).toMatch(/^---\ntitle: "My Article"\n---\n/);
    expect(result.fields).toEqual({ title: '"My Article"' });
  });

  test('preserves existing frontmatter', () => {
    const withFm = '---\ntitle: "Existing"\npublished: true\n---\n# My Article\n\nContent.';
    const devto = ensurePlatformFrontmatter(withFm, 'devto');
    expect(devto.injected).toBe(false);
    expect(devto.content).toBe(withFm);
    const hashnode = ensurePlatformFrontmatter(withFm, 'hashnode');
    expect(hashnode.injected).toBe(false);
    expect(hashnode.content).toBe(withFm);
  });

  test('escapes quotes in title', () => {
    const content = '# Say "Hello" World\n\nBody.';
    const result = ensurePlatformFrontmatter(content, 'devto');
    expect(result.content).toMatch(/title: "Say \\"Hello\\" World"/);
  });

  test('passes through platforms without injector unchanged', () => {
    const github = ensurePlatformFrontmatter(mdContent, 'github');
    expect(github.injected).toBe(false);
    expect(github.content).toBe(mdContent);
    const x = ensurePlatformFrontmatter(mdContent, 'x');
    expect(x.injected).toBe(false);
    expect(x.content).toBe(mdContent);
  });

  test('uses "Untitled" when no heading found', () => {
    const noHeading = 'Just some text without a heading.';
    const result = ensurePlatformFrontmatter(noHeading, 'devto');
    expect(result.content).toMatch(/title: "Untitled"/);
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

describe('rollbackCommand', () => {
  test('rolls back adapted article: moves base file, deletes platform files', async () => {
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'rollback-test.x.md'), 'x content');
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'rollback-test.md'), 'base draft');
    await engine.metadata.writeArticleMeta('rollback-test', { status: 'adapted', adapted_platforms: ['x'] });

    await rollbackCommand(engine, 'rollback-test');

    // Base file moved to 01_drafts
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'rollback-test.md'))).toBe(true);
    // Platform files deleted, not moved
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'rollback-test.x.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'rollback-test.x.md'))).toBe(false);
  });

  test('rollback from first stage throws', async () => {
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'first-stage.md'), 'content');
    await engine.metadata.writeArticleMeta('first-stage', { status: 'drafted' });

    await expect(rollbackCommand(engine, 'first-stage')).rejects.toThrow(/first stage/i);
  });
});

describe('extractCoverFromContent', () => {
  test('extracts unquoted cover_image from frontmatter', () => {
    const content = '---\ntitle: Test\ncover_image: ./cover.png\n---\nBody';
    expect(extractCoverFromContent(content)).toBe('./cover.png');
  });

  test('extracts double-quoted cover_image', () => {
    const content = '---\ntitle: Test\ncover_image: "./path/to/cover.png"\n---\nBody';
    expect(extractCoverFromContent(content)).toBe('./path/to/cover.png');
  });

  test('extracts single-quoted cover_image', () => {
    const content = "---\ntitle: Test\ncover_image: './cover.png'\n---\nBody";
    expect(extractCoverFromContent(content)).toBe('./cover.png');
  });

  test('extracts URL cover_image', () => {
    const content = '---\ntitle: Test\ncover_image: https://example.com/cover.jpg\n---\nBody';
    expect(extractCoverFromContent(content)).toBe('https://example.com/cover.jpg');
  });

  test('returns null when no cover_image in frontmatter', () => {
    const content = '---\ntitle: Test\n---\nBody';
    expect(extractCoverFromContent(content)).toBeNull();
  });

  test('returns null when no frontmatter', () => {
    const content = '# Title\n\nBody';
    expect(extractCoverFromContent(content)).toBeNull();
  });

  test('returns null for cover_image outside frontmatter', () => {
    const content = '# Title\n\ncover_image: ./not-frontmatter.png';
    expect(extractCoverFromContent(content)).toBeNull();
  });
});

describe('resolveCoverImage', () => {
  test('--cover flag takes highest priority', () => {
    const content = '---\ntitle: T\ncover_image: ./fm-cover.png\n---\nBody';
    const meta = { status: 'drafted' as const, cover_image: './meta-cover.png' };
    expect(resolveCoverImage({ cover: './flag-cover.png' }, content, meta)).toBe('./flag-cover.png');
  });

  test('frontmatter cover_image is second priority', () => {
    const content = '---\ntitle: T\ncover_image: ./fm-cover.png\n---\nBody';
    const meta = { status: 'drafted' as const, cover_image: './meta-cover.png' };
    expect(resolveCoverImage({}, content, meta)).toBe('./fm-cover.png');
  });

  test('meta.yaml cover_image is third priority', () => {
    const content = '---\ntitle: T\n---\nBody';
    const meta = { status: 'drafted' as const, cover_image: './meta-cover.png' };
    expect(resolveCoverImage({}, content, meta)).toBe('./meta-cover.png');
  });

  test('returns null when no cover source exists', () => {
    const content = '---\ntitle: T\n---\nBody';
    expect(resolveCoverImage({}, content, null)).toBeNull();
  });

  test('returns null when articleMeta is undefined', () => {
    expect(resolveCoverImage({}, '# Title\nBody', undefined)).toBeNull();
  });
});
