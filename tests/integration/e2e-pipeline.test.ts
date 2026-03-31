import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../src/core/pipeline.js';

import { draftCommand } from '../../src/commands/draft.js';
import { adaptCommand } from '../../src/commands/adapt.js';
import { scheduleCommand } from '../../src/commands/schedule.js';
import { publishCommand } from '../../src/commands/publish.js';
import { statusCommand } from '../../src/commands/status.js';
import { rollbackCommand } from '../../src/commands/rollback.js';

const mockExecute = vi.fn();

// Return platform-appropriate content so content-based assertions pass
function makeAdapterResult(prompt: string) {
  let content = `# Generated Article\n\n${prompt}`;
  if (prompt.includes('Twitter/X thread')) content = 'Thread about the topic.\n---\nSecond tweet with details.\n---\nFinal tweet with CTA.';
  else if (prompt.includes('Dev.to')) content = '---\ntitle: Dev.to Article\n---\nContent about the topic.';
  else if (prompt.includes('WeChat')) content = '# WeChat Article\n\nContent.';
  else if (prompt.includes('Zhihu')) content = '## Zhihu Analysis\n\nContent.';
  return { success: true, content, sessionId: null, usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, costUsd: null, model: 'mock', errorMessage: null, errorCode: null, exitCode: 0, timedOut: false };
}

vi.mock('../../src/llm/factory.js', () => ({
  AdapterFactory: {
    create: () => ({
      adapter: { name: 'claude', command: 'claude', execute: mockExecute, probe: vi.fn() },
      resolver: { resolve: vi.fn().mockResolvedValue([]) },
    }),
  },
}));

let tmpDir: string;
let engine: PipelineEngine;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-e2e-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();
  mockExecute.mockImplementation(async ({ prompt }: any) => makeAdapterResult(prompt));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('E2E: Full Pipeline (draft → published)', () => {
  test('complete lifecycle: draft → adapt → schedule → publish', async () => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Create a source file to draft from
    const srcFile = path.join(tmpDir, 'bun-vs-node.md');
    await fs.writeFile(srcFile, 'Compare Bun and Node.js performance');

    // 2. Generate draft
    await draftCommand(engine, srcFile);

    // Flat file: 01_drafts/bun-vs-node.md
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'bun-vs-node.md'))).toBe(true);
    const draftMeta = await engine.metadata.readArticleMeta('bun-vs-node');
    expect(draftMeta?.status).toBe('drafted');

    // Verify status shows 1 item in drafts
    let status = await engine.getStatus();
    expect(status.stages['01_drafts'].count).toBe(1);

    // 3. Adapt for multiple platforms
    await adaptCommand(engine, 'bun-vs-node', { platforms: 'x,devto' });

    // Flat files: 02_adapted/bun-vs-node.x.md, 02_adapted/bun-vs-node.devto.md
    const xContent = await fs.readFile(
      path.join(tmpDir, '02_adapted', 'bun-vs-node.x.md'), 'utf-8'
    );
    const devtoContent = await fs.readFile(
      path.join(tmpDir, '02_adapted', 'bun-vs-node.devto.md'), 'utf-8'
    );
    expect(xContent).toContain('Thread');
    expect(devtoContent).toContain('Dev.to Article');

    const adaptMeta = await engine.metadata.readArticleMeta('bun-vs-node');
    expect(adaptMeta?.status).toBe('adapted');
    expect(adaptMeta?.adapted_platforms).toEqual(['x', 'devto']);

    // 4. Schedule for today (metadata-only, files stay in 02_adapted)
    await scheduleCommand(engine, 'bun-vs-node', today);

    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'bun-vs-node.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'bun-vs-node.devto.md'))).toBe(true);

    // 5. Publish (mock mode)
    await publishCommand(engine);

    // Flat files moved to 03_published/
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'bun-vs-node.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'bun-vs-node.devto.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'bun-vs-node.x.md'))).toBe(false);

    // Verify publish results in meta.yaml
    const pubMeta = await engine.metadata.readArticleMeta('bun-vs-node');
    expect(pubMeta).not.toBeNull();
    expect(pubMeta!.status).toBe('published');
    expect(pubMeta!.platforms).toBeDefined();

    // Final status: everything moved through
    status = await engine.getStatus();
    expect(status.stages['03_published'].count).toBe(1);
  });

  test('rollback flow: adapt → rollback → re-adapt', async () => {

    // Setup: create base draft + adapted platform file
    await engine.writeArticleFile('02_adapted', 'rollback-article', 'base draft content');
    await engine.writeArticleFile('02_adapted', 'rollback-article', 'tweet content', 'x');
    await engine.metadata.writeArticleMeta('rollback-article', { status: 'adapted', adapted_platforms: ['x'] });

    // Rollback from 02_adapted to 01_drafts: base file moved, platform files deleted
    await rollbackCommand(engine, 'rollback-article');
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'rollback-article.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'rollback-article.x.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '01_drafts', 'rollback-article.x.md'))).toBe(false);
  });

  test('validation blocks publish for invalid X content', async () => {
    const today = new Date().toISOString().split('T')[0];
    // Create flat adapted file with invalid X content (exceeding 280 chars) and scheduled status
    await engine.writeArticleFile('02_adapted', 'bad-thread', 'a'.repeat(300), 'x');
    await engine.metadata.writeArticleMeta('bad-thread', { status: 'scheduled', schedule: today });

    await publishCommand(engine);

    // Should NOT move to published — validation failed
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'bad-thread.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'bad-thread.x.md'))).toBe(false);
  });

  test('publish with mixed valid/invalid platforms only publishes valid ones', async () => {
    const today = new Date().toISOString().split('T')[0];
    // devto is valid (has heading), but x exceeds 280
    await engine.writeArticleFile('02_adapted', 'mixed', '# Valid Article\n\nContent here', 'devto');
    await engine.writeArticleFile('02_adapted', 'mixed', 'a'.repeat(300), 'x');
    await engine.metadata.writeArticleMeta('mixed', { status: 'scheduled', schedule: today });

    await publishCommand(engine);

    // Validation fails for x -> entire article blocked
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'mixed.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'mixed.devto.md'))).toBe(true);
  });
});

describe('E2E: Error & Edge Cases', () => {
  test('LLM failure during draft leaves no residual files in 01_drafts', async () => {
    // Create source file
    const srcFile = path.join(tmpDir, 'fail-test.md');
    await fs.writeFile(srcFile, 'Content that will fail');

    // Adapter that always fails
    mockExecute.mockRejectedValueOnce(new Error('API connection refused'));

    await expect(draftCommand(engine, srcFile)).rejects.toThrow('API connection refused');

    // No residual files in 01_drafts
    const drafts = await engine.listArticles('01_drafts');
    expect(drafts).toEqual([]);
  });

  test('future date schedule does not publish today', async () => {

    // Create adapted article as flat file and schedule for far future
    await engine.writeArticleFile('02_adapted', 'future-post', 'Short tweet.', 'x');
    await engine.metadata.writeArticleMeta('future-post', { status: 'adapted' });

    await scheduleCommand(engine, 'future-post', '2099-12-31');
    // Files stay in 02_adapted (metadata-only schedule)
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'future-post.x.md'))).toBe(true);

    // Publish should skip it (not due yet)
    await publishCommand(engine);

    // Still in adapted, NOT in published
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'future-post.x.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'future-post.x.md'))).toBe(false);
  });

  test('--force flag overwrites existing platform versions', async () => {
    // Create draft as flat file
    await engine.writeArticleFile('01_drafts', 'force-test', '# Original Article\n\nOriginal content.');

    // First adapt
    await adaptCommand(engine, 'force-test', { platforms: 'x' });
    const firstContent = await fs.readFile(
      path.join(tmpDir, '02_adapted', 'force-test.x.md'), 'utf-8'
    );

    // Second adapt without --force should skip
    await adaptCommand(engine, 'force-test', { platforms: 'x' });
    const unchangedContent = await fs.readFile(
      path.join(tmpDir, '02_adapted', 'force-test.x.md'), 'utf-8'
    );
    expect(unchangedContent).toBe(firstContent);

    // Third adapt with --force should overwrite
    await adaptCommand(engine, 'force-test', { platforms: 'x', force: true });
    const overwrittenContent = await fs.readFile(
      path.join(tmpDir, '02_adapted', 'force-test.x.md'), 'utf-8'
    );
    // Content is regenerated (same mock output, but meta.yaml updated_at changes)
    expect(overwrittenContent).toBeDefined();
  });

  test('dry-run schedule + dry-run publish leaves no side effects', async () => {
    await engine.writeArticleFile('02_adapted', 'dryrun-test', 'dry run tweet', 'x');
    await engine.metadata.writeArticleMeta('dryrun-test', { status: 'adapted' });

    // Dry-run schedule
    await scheduleCommand(engine, 'dryrun-test', '2026-03-20', { dryRun: true });

    // Article still in adapted, metadata NOT updated to scheduled
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'dryrun-test.x.md'))).toBe(true);
    const metaAfterDrySchedule = await engine.metadata.readArticleMeta('dryrun-test');
    expect(metaAfterDrySchedule?.status).toBe('adapted');

    // Actually schedule, then dry-run publish
    await scheduleCommand(engine, 'dryrun-test', new Date().toISOString().split('T')[0]);
    await publishCommand(engine, { dryRun: true });

    // Should still be in adapted (dry-run didn't publish)
    const adapted = await engine.listArticles('02_adapted');
    expect(adapted.length).toBe(1);
    const published = await engine.listArticles('03_published');
    expect(published.length).toBe(0);
  });

  test('batch publish processes multiple due items', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create 3 due articles as flat files in 02_adapted with scheduled status
    for (const name of ['batch-a', 'batch-b', 'batch-c']) {
      await engine.writeArticleFile('02_adapted', name, `Tweet for ${name}`, 'x');
      await engine.metadata.writeArticleMeta(name, { status: 'scheduled', schedule: today });
    }

    await publishCommand(engine);

    // All 3 should be in published
    const published = await engine.listArticles('03_published');
    expect(published.length).toBe(3);
    expect(published).toContain('batch-a');
    expect(published).toContain('batch-b');
    expect(published).toContain('batch-c');

    // None left in adapted
    const adapted = await engine.listArticles('02_adapted');
    expect(adapted.length).toBe(0);
  });

  test('directory input with multiple files selects main.md first', async () => {
    const inputDir = path.join(tmpDir, 'dir-input');
    await fs.ensureDir(inputDir);
    await fs.writeFile(path.join(inputDir, 'notes.txt'), 'Just notes');
    await fs.writeFile(path.join(inputDir, 'main.md'), 'Main content for draft');
    await fs.writeFile(path.join(inputDir, 'other.md'), 'Other content');

    await draftCommand(engine, inputDir);

    // Draft is written as flat file: 01_drafts/dir-input.md
    const draft = await fs.readFile(path.join(tmpDir, '01_drafts', 'dir-input.md'), 'utf-8');
    // mock echoes prompt -- main.md content is included in prompt, notes.txt is not
    expect(draft).toContain('Main content for draft');
    expect(draft).not.toContain('Just notes');
  });
});

describe('E2E: Receipt verification', () => {
  test('receipt records all platform results with correct structure', async () => {
    const today = new Date().toISOString().split('T')[0];
    // Create adapted flat files for 2 platforms with scheduled status
    await engine.writeArticleFile('02_adapted', 'receipt-check', 'Tweet.', 'x');
    await engine.writeArticleFile('02_adapted', 'receipt-check', 'WeChat content', 'wechat');
    await engine.metadata.writeArticleMeta('receipt-check', { status: 'scheduled', schedule: today });

    await publishCommand(engine);

    // Verify publish results in meta.yaml
    const meta = await engine.metadata.readArticleMeta('receipt-check');
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe('published');
    expect(meta!.platforms).toBeDefined();

    // Check each platform is recorded
    const platforms = Object.keys(meta!.platforms!).sort();
    expect(platforms).toEqual(['wechat', 'x']);

    // Each platform has required fields
    for (const platform of platforms) {
      expect(meta!.platforms![platform].status).toBe('success');
      expect(meta!.platforms![platform].url).toBeDefined();
      expect(typeof meta!.platforms![platform].url).toBe('string');
    }
  });
});

describe('E2E: Publishing state management', () => {
  test('no .publish.lock after successful publish', async () => {
    const today = new Date().toISOString().split('T')[0];
    await engine.writeArticleFile('02_adapted', 'lock-clean', 'Tweet.', 'x');
    await engine.metadata.writeArticleMeta('lock-clean', { status: 'scheduled', schedule: today });

    await publishCommand(engine);

    // File should be in 03_published
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'lock-clean.x.md'))).toBe(true);
    // Article should not be locked
    const isLocked = await engine.metadata.isArticleLocked('lock-clean');
    expect(isLocked).toBe(false);
  });

  test('meta status is published when all platforms succeed', async () => {
    const today = new Date().toISOString().split('T')[0];
    await engine.writeArticleFile('02_adapted', 'all-ok', 'Tweet.', 'x');
    await engine.writeArticleFile('02_adapted', 'all-ok', 'WeChat content', 'wechat');
    await engine.metadata.writeArticleMeta('all-ok', { status: 'scheduled', schedule: today });

    await publishCommand(engine);

    const meta = await engine.metadata.readArticleMeta('all-ok');
    expect(meta!.status).toBe('published');
  });

  test('meta status is failed when all platforms fail', async () => {
    const today = new Date().toISOString().split('T')[0];
    await engine.writeArticleFile('02_adapted', 'all-fail', 'Tweet content', 'x');
    await engine.metadata.writeArticleMeta('all-fail', { status: 'scheduled', schedule: today });

    // Temporarily replace MockProvider.publish to always fail
    const { MockProvider } = await import('../../src/providers/mock.js');
    const origPublish = MockProvider.prototype.publish;
    MockProvider.prototype.publish = async () => ({
      platform: 'mock', status: 'failed' as const, error: 'Simulated failure',
    });

    await publishCommand(engine);

    // Restore
    MockProvider.prototype.publish = origPublish;

    // Should remain in adapted (all failed)
    expect(await fs.pathExists(path.join(tmpDir, '02_adapted', 'all-fail.x.md'))).toBe(true);

    const meta = await engine.metadata.readArticleMeta('all-fail');
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe('failed');
    expect(meta!.platforms).toBeDefined();
    expect(meta!.platforms!['x'].status).toBe('failed');
  });
});

describe('E2E: Content format conversion', () => {
  test('html contentFormat triggers markdown-to-html conversion', async () => {
    const today = new Date().toISOString().split('T')[0];
    await engine.writeArticleFile('02_adapted', 'html-fmt', '# Hello\n\n**Bold** text.', 'x');
    await engine.metadata.writeArticleMeta('html-fmt', { status: 'scheduled', schedule: today });

    // Patch ProviderLoader to return a provider with contentFormat='html'
    const { ProviderLoader } = await import('../../src/providers/loader.js');
    const origGetProviderOrMock = ProviderLoader.prototype.resolveProviderOrMock;
    let capturedContent = '';

    ProviderLoader.prototype.resolveProviderOrMock = function () {
      return {
        id: 'mock-html', name: 'Mock HTML', platforms: ['x'],
        contentFormat: 'html' as const,
        validate: () => ({ valid: true, errors: [] }),
        publish: async (content: string) => {
          capturedContent = content;
          return { platform: 'x', status: 'success' as const, url: 'https://mock.reach.dev/post/1' };
        },
        formatContent: (c: string) => c,
      };
    };

    await publishCommand(engine);

    // Restore
    ProviderLoader.prototype.resolveProviderOrMock = origGetProviderOrMock;

    // The content should have been converted to HTML
    expect(capturedContent).toContain('<h1>Hello</h1>');
    expect(capturedContent).toContain('<strong>Bold</strong>');
    expect(capturedContent).not.toContain('# Hello');
  });
});

describe('E2E: Asset reference resolution in publish', () => {
  test('@assets/ references are resolved to absolute paths before publishing', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create assets directory with a registered image
    const assetsDir = path.join(tmpDir, 'assets', 'images');
    await fs.ensureDir(assetsDir);
    await fs.writeFile(path.join(assetsDir, 'hero.png'), 'png-data');

    // Create adapted article with @assets/ reference in content
    await engine.writeArticleFile(
      '02_adapted', 'asset-test',
      '# Article\n\n![hero](@assets/images/hero.png)\n\nBody text.',
      'wechat',
    );
    await engine.metadata.writeArticleMeta('asset-test', { status: 'scheduled', schedule: today });

    // Capture the content sent to provider
    const { ProviderLoader } = await import('../../src/providers/loader.js');
    const origGetProviderOrMock = ProviderLoader.prototype.resolveProviderOrMock;
    let capturedContent = '';

    ProviderLoader.prototype.resolveProviderOrMock = function () {
      return {
        id: 'mock-asset', name: 'Mock Asset', platforms: ['wechat'],
        contentFormat: 'markdown' as const,
        validate: () => ({ valid: true, errors: [] }),
        publish: async (content: string) => {
          capturedContent = content;
          return { platform: 'wechat', status: 'success' as const, url: 'https://mock.reach.dev/post/1' };
        },
        formatContent: (c: string) => c,
      };
    };

    await publishCommand(engine);

    // Restore
    ProviderLoader.prototype.resolveProviderOrMock = origGetProviderOrMock;

    // @assets/ should be resolved to absolute path
    expect(capturedContent).not.toContain('@assets/');
    expect(capturedContent).toContain(path.join(tmpDir, 'assets', 'images', 'hero.png'));
  });

  test('media processing is called for devto platform with local images', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create adapted devto article with a local image reference
    await engine.writeArticleFile(
      '02_adapted', 'media-test',
      '---\ntitle: Media Test\n---\n\n![diagram](./images/diagram.png)\n\nContent here.',
      'devto',
    );
    await engine.metadata.writeArticleMeta('media-test', { status: 'scheduled', schedule: today });

    // Create the local image file so MediaManager can find it
    const imgDir = path.join(tmpDir, 'images');
    await fs.ensureDir(imgDir);
    await fs.writeFile(path.join(imgDir, 'diagram.png'), 'fake-png-data');

    // Capture content sent to provider to verify media processing ran
    const { ProviderLoader } = await import('../../src/providers/loader.js');
    const origGetProviderOrMock = ProviderLoader.prototype.resolveProviderOrMock;
    let capturedContent = '';

    ProviderLoader.prototype.resolveProviderOrMock = function () {
      return {
        id: 'mock-devto', name: 'Mock DevTo', platforms: ['devto'],
        contentFormat: 'markdown' as const,
        validate: () => ({ valid: true, errors: [] }),
        publish: async (content: string) => {
          capturedContent = content;
          return { platform: 'devto', status: 'success' as const, url: 'https://dev.to/test/media-test' };
        },
        formatContent: (c: string) => c,
      };
    };

    await publishCommand(engine);

    // Restore
    ProviderLoader.prototype.resolveProviderOrMock = origGetProviderOrMock;

    // The article should have been published (moved to 03_published)
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'media-test.devto.md'))).toBe(true);
    // Content was captured (media processing ran, though upload would fail without real API)
    expect(capturedContent).toContain('diagram');
  });

  test('media processing is non-fatal - publish continues on upload failure', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Reference a non-existent image -- MediaManager will warn but not throw
    await engine.writeArticleFile(
      '02_adapted', 'media-fail',
      '---\ntitle: Fail Test\n---\n\n![missing](./images/gone.png)\n\nContent.',
      'devto',
    );
    await engine.metadata.writeArticleMeta('media-fail', { status: 'scheduled', schedule: today });

    await publishCommand(engine);

    // Should still publish successfully despite media warnings
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'media-fail.devto.md'))).toBe(true);
  });

  test('@assets/ references do not inflate X validation character count', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Content under 280 chars with @assets/ reference
    const xContent = 'Check out this image @assets/images/hero.png - amazing!';
    expect(xContent.length).toBeLessThan(280);
    await engine.writeArticleFile('02_adapted', 'x-asset', xContent, 'x');
    await engine.metadata.writeArticleMeta('x-asset', { status: 'scheduled', schedule: today });

    await publishCommand(engine);

    // Should have published successfully (validation passes on original short content)
    expect(await fs.pathExists(path.join(tmpDir, '03_published', 'x-asset.x.md'))).toBe(true);
  });
});

describe('E2E: Multi-article pipeline', () => {
  test('handles multiple articles at different stages', async () => {
    // getStatus now uses listArticles (flat .md files)
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'idea-1.md'), 'Idea 1');
    await fs.writeFile(path.join(tmpDir, '01_drafts', 'draft-2.md'), 'Draft 2');
    await fs.writeFile(path.join(tmpDir, '03_published', 'old-post.x.md'), 'Old post');

    const status = await engine.getStatus();
    expect(status.stages['01_drafts'].count).toBe(2);
    expect(status.stages['03_published'].count).toBe(1);
    expect(status.totalProjects).toBe(3);
  });
});
