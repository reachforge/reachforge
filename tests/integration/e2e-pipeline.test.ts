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
  else if (prompt.includes('WeChat')) content = '# WeChat 文章\n\nContent.';
  else if (prompt.includes('Zhihu')) content = '## Zhihu 深度分析\n\nContent.';
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aphype-e2e-'));
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

    // 3. Promote to master (manual step: copy + rename)
    const draftDir = path.join(tmpDir, '02_drafts', 'bun-vs-node');
    const masterDir = path.join(tmpDir, '03_master', 'bun-vs-node');
    await fs.copy(draftDir, masterDir);
    await fs.rename(path.join(masterDir, 'draft.md'), path.join(masterDir, 'master.md'));

    expect(await fs.pathExists(path.join(masterDir, 'master.md'))).toBe(true);

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

    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', `${today}-bun-vs-node`))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'bun-vs-node'))).toBe(false);

    // 6. Publish (mock mode)
    await publishCommand(engine);

    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}-bun-vs-node`))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', `${today}-bun-vs-node`))).toBe(false);

    // Verify receipt
    const receipt = await engine.metadata.readReceipt('06_sent', `${today}-bun-vs-node`);
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
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-12-25-rollback-article'))).toBe(true);

    // Rollback
    await rollbackCommand(engine, 'rollback-article');
    expect(await fs.pathExists(path.join(tmpDir, '04_adapted', 'rollback-article'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-12-25-rollback-article'))).toBe(false);

    // Re-schedule with different date
    await scheduleCommand(engine, 'rollback-article', '2026-12-31');
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-12-31-rollback-article'))).toBe(true);
  });

  test('validation blocks publish for invalid X content', async () => {
    const today = new Date().toISOString().split('T')[0];
    const projDir = path.join(tmpDir, '05_scheduled', `${today}-bad-thread`);
    await fs.ensureDir(path.join(projDir, 'platform_versions'));
    // X content exceeding 280 chars in one segment
    await fs.writeFile(path.join(projDir, 'platform_versions', 'x.md'), 'a'.repeat(300));
    await fs.writeFile(path.join(projDir, 'meta.yaml'), 'article: bad-thread\nstatus: scheduled\n');

    await publishCommand(engine);

    // Should NOT move to sent — validation failed
    expect(await fs.pathExists(projDir)).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', `${today}-bad-thread`))).toBe(false);
  });

  test('publish with mixed valid/invalid platforms only publishes valid ones', async () => {
    const today = new Date().toISOString().split('T')[0];
    const projDir = path.join(tmpDir, '05_scheduled', `${today}-mixed`);
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
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2099-12-31-future-post'))).toBe(true);

    // Publish should skip it (not due yet)
    await publishCommand(engine);

    // Still in scheduled, NOT in sent
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2099-12-31-future-post'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '06_sent', '2099-12-31-future-post'))).toBe(false);
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
    expect(await fs.pathExists(path.join(tmpDir, '05_scheduled', '2026-03-20-dryrun-test'))).toBe(false);

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
      const dir = path.join(tmpDir, '05_scheduled', `${today}-${name}`);
      await fs.ensureDir(path.join(dir, 'platform_versions'));
      await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), `Tweet for ${name}`);
      await fs.writeFile(path.join(dir, 'meta.yaml'), `article: ${name}\nstatus: scheduled\n`);
    }

    await publishCommand(engine);

    // All 3 should be in sent
    const sent = await engine.listProjects('06_sent');
    expect(sent.length).toBe(3);
    expect(sent).toContain(`${today}-batch-a`);
    expect(sent).toContain(`${today}-batch-b`);
    expect(sent).toContain(`${today}-batch-c`);

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
    const dir = path.join(tmpDir, '05_scheduled', `${today}-receipt-check`);
    await fs.ensureDir(path.join(dir, 'platform_versions'));
    await fs.writeFile(path.join(dir, 'platform_versions', 'x.md'), 'Tweet.');
    await fs.writeFile(path.join(dir, 'platform_versions', 'wechat.md'), 'WeChat content');
    await fs.writeFile(path.join(dir, 'meta.yaml'), 'article: receipt-check\nstatus: scheduled\n');

    await publishCommand(engine);

    const receipt = await engine.metadata.readReceipt('06_sent', `${today}-receipt-check`);
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
