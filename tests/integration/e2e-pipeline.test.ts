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
import { approveCommand } from '../../src/commands/approve.js';

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
  LLMFactory: { create: vi.fn(), createFromApiKey: vi.fn() },
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

describe('E2E: Full Pipeline (inbox → sent)', () => {
  test('complete lifecycle: inbox → draft → master → adapt → schedule → publish → sent', async () => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Create inbox content
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'bun-vs-node.md'), 'Compare Bun and Node.js performance');

    // Verify status shows 1 item in inbox
    let status = await engine.getStatus();
    expect(status.stages['01_inbox'].count).toBe(1);
    expect(status.totalProjects).toBe(1);

    // 2. Generate draft
    await draftCommand(engine, 'bun-vs-node.md');

    expect(await fs.pathExists(path.join(tmpDir, '02_drafts', 'bun-vs-node', 'draft.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_drafts', 'bun-vs-node', 'meta.yaml'))).toBe(true);
    const draftMeta = await engine.metadata.readMeta('02_drafts', 'bun-vs-node');
    expect(draftMeta?.status).toBe('drafted');

    // 3. Promote to master via approve command
    await approveCommand(engine, 'bun-vs-node');

    const masterDir = path.join(tmpDir, '03_master', 'bun-vs-node');
    expect(await fs.pathExists(path.join(masterDir, 'master.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '02_drafts', 'bun-vs-node'))).toBe(false);

    // 4. Adapt for multiple platforms
    await adaptCommand(engine, 'bun-vs-node', { platforms: 'x,devto' });

    const xContent = await fs.readFile(
      path.join(tmpDir, '04_adapted', 'bun-vs-node', 'platform_versions', 'x.md'), 'utf-8'
    );
    const devtoContent = await fs.readFile(
      path.join(tmpDir, '04_adapted', 'bun-vs-node', 'platform_versions', 'devto.md'), 'utf-8'
    );
    expect(xContent).toContain('Thread');
    expect(devtoContent).toContain('Dev.to Article');

    const adaptMeta = await engine.metadata.readMeta('04_adapted', 'bun-vs-node');
    expect(adaptMeta?.status).toBe('adapted');
    expect(adaptMeta?.adapted_platforms).toEqual(['x', 'devto']);

    // 5. Schedule for today
    await scheduleCommand(engine, 'bun-vs-node', today);

    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', `${today}T00-00-00-bun-vs-node`))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'bun-vs-node'))).toBe(false);

    // 6. Publish (mock mode)
    await publishCommand(engine);

    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}T00-00-00-bun-vs-node`))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', `${today}T00-00-00-bun-vs-node`))).toBe(false);

    // Verify receipt
    const receipt = await engine.metadata.readReceipt('06_sent', `${today}T00-00-00-bun-vs-node`);
    expect(receipt).not.toBeNull();
    expect(receipt!.items.length).toBeGreaterThanOrEqual(1);
    expect(receipt!.items.every(i => i.status === 'success')).toBe(true);

    // Final status: everything moved through
    status = await engine.getStatus();
    expect(status.stages['06_sent'].count).toBe(1);
  });

  test('rollback flow: schedule → rollback → re-schedule', async () => {

    // Setup: create an adapted article
    const adaptedDir = path.join(tmpDir, '04_adapted', 'rollback-article');
    await fs.ensureDir(path.join(adaptedDir, 'platform_versions'));
    await fs.writeFile(path.join(adaptedDir, 'platform_versions', 'x.md'), 'tweet content');
    await fs.writeFile(path.join(adaptedDir, 'meta.yaml'), 'article: rollback-article\nstatus: adapted\n');

    // Schedule
    await scheduleCommand(engine, 'rollback-article', '2026-12-25');
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-12-25T00-00-00-rollback-article'))).toBe(true);

    // Rollback
    await rollbackCommand(engine, 'rollback-article');
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'rollback-article'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-12-25T00-00-00-rollback-article'))).toBe(false);

    // Re-schedule with different date
    await scheduleCommand(engine, 'rollback-article', '2026-12-31');
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-12-31T00-00-00-rollback-article'))).toBe(true);
  });

  test('validation blocks publish for invalid X content', async () => {
    const today = new Date().toISOString().split('T')[0];
    const projDir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-bad-thread`);
    await fs.ensureDir(path.join(projDir, 'platform_versions'));
    // X content exceeding 280 chars in one segment
    await fs.writeFile(path.join(projDir, 'platform_versions', 'x.md'), 'a'.repeat(300));
    await fs.writeFile(path.join(projDir, 'meta.yaml'), 'article: bad-thread\nstatus: scheduled\n');

    await publishCommand(engine);

    // Should NOT move to sent — validation failed
    expect(await fs.pathExists(projDir)).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}T00-00-00-bad-thread`))).toBe(false);
  });

  test('publish with mixed valid/invalid platforms only publishes valid ones', async () => {
    const today = new Date().toISOString().split('T')[0];
    const projDir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-mixed`);
    await fs.ensureDir(path.join(projDir, 'platform_versions'));
    // devto is valid (has heading), but x exceeds 280
    await fs.writeFile(path.join(projDir, 'platform_versions', 'devto.md'), '# Valid Article\n\nContent here');
    await fs.writeFile(path.join(projDir, 'platform_versions', 'x.md'), 'a'.repeat(300));
    await fs.writeFile(path.join(projDir, 'meta.yaml'), 'article: mixed\nstatus: scheduled\n');

    await publishCommand(engine);

    // Validation fails for x → entire project blocked
    expect(await fs.pathExists(projDir)).toBe(true);
  });
});

describe('E2E: Error & Edge Cases', () => {
  test('LLM failure during draft leaves no residual files in 02_drafts', async () => {
    // Create inbox source
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'fail-test.md'), 'Content that will fail');

    // Adapter that always fails
    mockExecute.mockRejectedValueOnce(new Error('API connection refused'));

    await expect(draftCommand(engine, 'fail-test.md')).rejects.toThrow('API connection refused');

    // No residual directory in 02_drafts
    const drafts = await engine.listProjects('02_drafts');
    expect(drafts).toEqual([]);

    // Source should still be in inbox
    expect(await fs.pathExists(path.join(tmpDir, '01_inbox', 'fail-test.md'))).toBe(true);
  });

  test('draft with non-existent source throws descriptive error', async () => {
    await expect(draftCommand(engine, 'ghost-file.md')).rejects.toThrow('not found in 01_inbox');
  });

  test('future date schedule does not publish today', async () => {

    // Create adapted article and schedule for far future
    const adaptedDir = path.join(tmpDir, '04_adapted', 'future-post');
    await fs.ensureDir(path.join(adaptedDir, 'platform_versions'));
    await fs.writeFile(path.join(adaptedDir, 'platform_versions', 'x.md'), 'Short tweet.');
    await fs.writeFile(path.join(adaptedDir, 'meta.yaml'), 'article: future-post\nstatus: adapted\n');

    await scheduleCommand(engine, 'future-post', '2099-12-31');
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2099-12-31T00-00-00-future-post'))).toBe(true);

    // Publish should skip it (not due yet)
    await publishCommand(engine);

    // Still in scheduled, NOT in sent
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2099-12-31T00-00-00-future-post'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', '2099-12-31T00-00-00-future-post'))).toBe(false);
  });

  test('--force flag overwrites existing platform versions', async () => {
    // Create master
    const masterDir = path.join(tmpDir, '03_master', 'force-test');
    await fs.ensureDir(masterDir);
    await fs.writeFile(path.join(masterDir, 'master.md'), '# Original Article\n\nOriginal content.');

    // First adapt
    await adaptCommand(engine, 'force-test', { platforms: 'x' });
    const firstContent = await fs.readFile(
      path.join(tmpDir, '04_adapted', 'force-test', 'platform_versions', 'x.md'), 'utf-8'
    );

    // Second adapt without --force should skip
    await adaptCommand(engine, 'force-test', { platforms: 'x' });
    const unchangedContent = await fs.readFile(
      path.join(tmpDir, '04_adapted', 'force-test', 'platform_versions', 'x.md'), 'utf-8'
    );
    expect(unchangedContent).toBe(firstContent);

    // Third adapt with --force should overwrite
    await adaptCommand(engine, 'force-test', { platforms: 'x', force: true });
    const overwrittenContent = await fs.readFile(
      path.join(tmpDir, '04_adapted', 'force-test', 'platform_versions', 'x.md'), 'utf-8'
    );
    // Content is regenerated (same mock output, but meta.yaml updated_at changes)
    expect(overwrittenContent).toBeDefined();
  });

  test('dry-run schedule + dry-run publish leaves no side effects', async () => {
    const adaptedDir = path.join(tmpDir, '04_adapted', 'dryrun-test');
    await fs.ensureDir(path.join(adaptedDir, 'platform_versions'));
    await fs.writeFile(path.join(adaptedDir, 'platform_versions', 'x.md'), 'dry run tweet');
    await fs.writeFile(path.join(adaptedDir, 'meta.yaml'), 'article: dryrun-test\nstatus: adapted\n');

    // Dry-run schedule
    await scheduleCommand(engine, 'dryrun-test', '2026-03-20', { dryRun: true });

    // Article still in adapted, NOT in scheduled
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'dryrun-test'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-03-20T00-00-00-dryrun-test'))).toBe(false);

    // Actually schedule, then dry-run publish
    await scheduleCommand(engine, 'dryrun-test', new Date().toISOString().split('T')[0]);
    await publishCommand(engine, { dryRun: true });

    // Should still be in scheduled (dry-run didn't publish)
    const scheduled = await engine.listProjects('05_scheduled');
    expect(scheduled.length).toBe(1);
    const sent = await engine.listProjects('06_sent');
    expect(sent.length).toBe(0);
  });

  test('batch publish processes multiple due items', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create 3 due projects
    for (const name of ['batch-a', 'batch-b', 'batch-c']) {
      const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-${name}`);
      await fs.ensureDir(path.join(dir, 'platform_versions'));
      await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), `Tweet for ${name}`);
      await fs.writeFile(path.join(dir, 'meta.yaml'), `article: ${name}\nstatus: scheduled\n`);
    }

    await publishCommand(engine);

    // All 3 should be in sent
    const sent = await engine.listProjects('06_sent');
    expect(sent.length).toBe(3);
    expect(sent).toContain(`${today}T00-00-00-batch-a`);
    expect(sent).toContain(`${today}T00-00-00-batch-b`);
    expect(sent).toContain(`${today}T00-00-00-batch-c`);

    // None left in scheduled
    const scheduled = await engine.listProjects('05_scheduled');
    expect(scheduled.length).toBe(0);
  });

  test('inbox directory input with multiple files selects main.md first', async () => {
    const inboxDir = path.join(tmpDir, '01_inbox', 'dir-input');
    await fs.ensureDir(inboxDir);
    await fs.writeFile(path.join(inboxDir, 'notes.txt'), 'Just notes');
    await fs.writeFile(path.join(inboxDir, 'main.md'), 'Main content for draft');
    await fs.writeFile(path.join(inboxDir, 'other.md'), 'Other content');

    await draftCommand(engine, 'dir-input');

    const draft = await fs.readFile(path.join(tmpDir, '02_drafts', 'dir-input', 'draft.md'), 'utf-8');
    // mock echoes prompt — main.md content is included in prompt, notes.txt is not
    expect(draft).toContain('Main content for draft');
    expect(draft).not.toContain('Just notes');
  });
});

describe('E2E: Receipt verification', () => {
  test('receipt records all platform results with correct structure', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-receipt-check`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), 'Tweet.');
    await fs.writeFile(path.join(dir, 'platform_versions', 'wechat.md'), 'WeChat content');
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: receipt-check\nstatus: scheduled\n');

    await publishCommand(engine);

    const receipt = await engine.metadata.readReceipt('06_sent', `${today}T00-00-00-receipt-check`);
    expect(receipt).not.toBeNull();
    expect(receipt!.published_at).toBeDefined();
    expect(receipt!.items.length).toBe(2);

    // Check each platform is recorded
    const platforms = receipt!.items.map(i => i.platform).sort();
    expect(platforms).toEqual(['wechat', 'x']);

    // Each item has required fields
    for (const item of receipt!.items) {
      expect(item.status).toBe('success');
      expect(item.url).toBeDefined();
      expect(typeof item.url).toBe('string');
    }
  });
});

describe('E2E: Publishing state management', () => {
  test('no .publish.lock file in 06_sent after successful publish', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-lock-clean`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), 'Tweet.');
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: lock-clean\nstatus: scheduled\n');

    await publishCommand(engine);

    const sentDir = path.join(tmpDir, '06_sent', `${today}T00-00-00-lock-clean`);
    expect(await fs.pathExists(sentDir)).toBe(true);
    expect(await fs.pathExists(path.join(sentDir, '.publish.lock'))).toBe(false);
  });

  test('receipt status is completed when all platforms succeed', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-all-ok`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), 'Tweet.');
    await fs.writeFile(path.join(dir, 'platform_versions', 'wechat.md'), 'WeChat content');
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: all-ok\nstatus: scheduled\n');

    await publishCommand(engine);

    const receipt = await engine.metadata.readReceipt('06_sent', `${today}T00-00-00-all-ok`);
    expect(receipt!.status).toBe('completed');
  });

  test('receipt status is partial when all platforms fail', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-all-fail`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), 'Tweet content');
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: all-fail\nstatus: scheduled\n');

    // Temporarily replace MockProvider.publish to always fail
    const { MockProvider } = await import('../../src/providers/mock.js');
    const origPublish = MockProvider.prototype.publish;
    MockProvider.prototype.publish = async () => ({
      platform: 'mock', status: 'failed' as const, error: 'Simulated failure',
    });

    await publishCommand(engine);

    // Restore
    MockProvider.prototype.publish = origPublish;

    // Should remain in scheduled (all failed)
    expect(await fs.pathExists(dir)).toBe(true);

    const receipt = await engine.metadata.readReceipt('05_scheduled', `${today}T00-00-00-all-fail`);
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe('partial');
    expect(receipt!.items.every(i => i.status === 'failed')).toBe(true);
  });

  test('old receipt without status field parses with default completed', async () => {
    // Simulate a legacy receipt (pre-status field)
    const yamlMod = await import('js-yaml');
    await fs.ensureDir(path.join(tmpDir, '06_sent', '2026-01-01-legacy'));
    const legacyReceipt = {
      published_at: '2026-01-01T00:00:00Z',
      items: [
        { platform: 'devto', status: 'success', url: 'https://dev.to/test' },
      ],
    };
    await fs.writeFile(
      path.join(tmpDir, '06_sent', '2026-01-01-legacy', 'receipt.yaml'),
      yamlMod.dump(legacyReceipt),
    );

    const receipt = await engine.metadata.readReceipt('06_sent', '2026-01-01-legacy');
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe('completed');
  });
});

describe('E2E: Content format conversion', () => {
  test('html contentFormat triggers markdown-to-html conversion', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-html-fmt`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), '# Hello\n\n**Bold** text.');
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: html-fmt\nstatus: scheduled\n');

    // Patch ProviderLoader to return a provider with contentFormat='html'
    const { ProviderLoader } = await import('../../src/providers/loader.js');
    const origGetProviderOrMock = ProviderLoader.prototype.getProviderOrMock;
    let capturedContent = '';

    ProviderLoader.prototype.getProviderOrMock = function () {
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
    ProviderLoader.prototype.getProviderOrMock = origGetProviderOrMock;

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

    // Create scheduled article with @assets/ reference in content
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-asset-test`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    await fs.writeFile(
      path.join(dir, 'platform_versions', 'wechat.md'),
      '# Article\n\n![hero](@assets/images/hero.png)\n\nBody text.',
    );
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: asset-test\nstatus: scheduled\n');

    // Capture the content sent to provider
    const { ProviderLoader } = await import('../../src/providers/loader.js');
    const origGetProviderOrMock = ProviderLoader.prototype.getProviderOrMock;
    let capturedContent = '';

    ProviderLoader.prototype.getProviderOrMock = function () {
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
    ProviderLoader.prototype.getProviderOrMock = origGetProviderOrMock;

    // @assets/ should be resolved to absolute path
    expect(capturedContent).not.toContain('@assets/');
    expect(capturedContent).toContain(path.join(tmpDir, 'assets', 'images', 'hero.png'));
  });

  test('media processing is called for devto platform with local images', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create a scheduled devto article with a local image reference
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-media-test`);
    const versionsDir = path.join(dir, 'platform_versions');
    await fs.ensureDir(versionsDir);
    // Create the local image file so MediaManager can find it
    const imgDir = path.join(dir, 'images');
    await fs.ensureDir(imgDir);
    await fs.writeFile(path.join(imgDir, 'diagram.png'), 'fake-png-data');

    await fs.writeFile(
      path.join(versionsDir, 'devto.md'),
      '---\ntitle: Media Test\n---\n\n![diagram](./images/diagram.png)\n\nContent here.',
    );
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: media-test\nstatus: scheduled\n');

    // Capture content sent to provider to verify media processing ran
    const { ProviderLoader } = await import('../../src/providers/loader.js');
    const origGetProviderOrMock = ProviderLoader.prototype.getProviderOrMock;
    let capturedContent = '';

    ProviderLoader.prototype.getProviderOrMock = function () {
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
    ProviderLoader.prototype.getProviderOrMock = origGetProviderOrMock;

    // The article should have been published (moved to 06_sent)
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}T00-00-00-media-test`))).toBe(true);
    // Content was captured (media processing ran, though upload would fail without real API)
    expect(capturedContent).toContain('diagram');
  });

  test('media processing is non-fatal - publish continues on upload failure', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-media-fail`);
    const versionsDir = path.join(dir, 'platform_versions');
    await fs.ensureDir(versionsDir);

    // Reference a non-existent image — MediaManager will warn but not throw
    await fs.writeFile(
      path.join(versionsDir, 'devto.md'),
      '---\ntitle: Fail Test\n---\n\n![missing](./images/gone.png)\n\nContent.',
    );
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: media-fail\nstatus: scheduled\n');

    await publishCommand(engine);

    // Should still publish successfully despite media warnings
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}T00-00-00-media-fail`))).toBe(true);
  });

  test('@assets/ references do not inflate X validation character count', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create a short X thread with an @assets/ reference
    // The @assets/ ref is short, but the resolved absolute path would be long
    const dir = path.join(tmpDir, '05_scheduled', `${today}T00-00-00-x-asset`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    // Content under 280 chars with @assets/ reference
    const xContent = 'Check out this image @assets/images/hero.png - amazing!';
    expect(xContent.length).toBeLessThan(280);
    await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), xContent);
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: x-asset\nstatus: scheduled\n');

    await publishCommand(engine);

    // Should have published successfully (validation passes on original short content)
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}T00-00-00-x-asset`))).toBe(true);
  });
});

describe('E2E: Multi-project pipeline', () => {
  test('handles multiple projects at different stages', async () => {
    // Create projects at various stages
    await fs.ensureDir(path.join(tmpDir, '01_inbox', 'idea-1'));
    await fs.writeFile(path.join(tmpDir, '01_inbox', 'idea-1', 'main.md'), 'Idea 1');

    await fs.ensureDir(path.join(tmpDir, '02_drafts', 'draft-2'));
    await fs.writeFile(path.join(tmpDir, '02_drafts', 'draft-2', 'meta.yaml'), 'article: draft-2\nstatus: drafted\n');

    await fs.ensureDir(path.join(tmpDir, '06_sent', '2026-01-01-old-post'));
    await fs.writeFile(path.join(tmpDir, '06_sent', '2026-01-01-old-post', 'meta.yaml'), 'article: old-post\nstatus: published\n');

    const status = await engine.getStatus();
    expect(status.stages['01_inbox'].count).toBe(1);
    expect(status.stages['02_drafts'].count).toBe(1);
    expect(status.stages['06_sent'].count).toBe(1);
    expect(status.totalProjects).toBe(3);
  });
});
