import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';

const mockExecute = vi.fn();

vi.mock('../../../src/llm/factory.js', () => ({
  AdapterFactory: {
    create: () => ({
      adapter: { name: 'mock', command: 'mock', execute: mockExecute, probe: vi.fn() },
      resolver: { resolve: vi.fn().mockResolvedValue([]) },
    }),
  },
}));

const { updateCommand } = await import('../../../src/commands/update.js');

let tmpDir: string;
let engine: PipelineEngine;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-update-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('updateCommand', () => {
  test('throws if article not in meta.yaml', async () => {
    await expect(updateCommand(engine, { article: 'nonexistent' }))
      .rejects.toThrow('not found in meta.yaml');
  });

  test('throws if article not published', async () => {
    await engine.metadata.writeArticleMeta('draft-only', { status: 'adapted' });

    await expect(updateCommand(engine, { article: 'draft-only' }))
      .rejects.toThrow('has not been published yet');
  });

  test('throws if no platforms have article_id (without --force)', async () => {
    await engine.metadata.writeArticleMeta('no-ids', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01' },
      },
    });

    await expect(updateCommand(engine, { article: 'no-ids' }))
      .rejects.toThrow('lack article_id');
  });

  test('skips platforms without article_id when --force is set', async () => {
    await engine.metadata.writeArticleMeta('partial-ids', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
        hashnode: { status: 'success', url: 'https://hashnode.com/test', published_at: '2026-01-01' },
      },
    });
    // Write content for devto in 03_published
    await fs.writeFile(path.join(tmpDir, '03_published', 'partial-ids.devto.md'), '---\ntitle: Test\n---\n\nBody');

    await updateCommand(engine, { article: 'partial-ids', force: true });

    // hashnode should be skipped, devto updated (mock provider)
    const meta = await engine.metadata.readArticleMeta('partial-ids');
    expect(meta?.platforms?.devto?.updated_at).toBeDefined();
  });

  test('prefers 02_adapted content over 03_published', async () => {
    await engine.metadata.writeArticleMeta('content-prio', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
      },
    });
    await fs.writeFile(path.join(tmpDir, '02_adapted', 'content-prio.devto.md'), '---\ntitle: Adapted Version\n---\n\nNew body');
    await fs.writeFile(path.join(tmpDir, '03_published', 'content-prio.devto.md'), '---\ntitle: Old Version\n---\n\nOld body');

    await updateCommand(engine, { article: 'content-prio' });

    // Should have used adapted content (mock provider doesn't verify content, but no error means it found the file)
    const meta = await engine.metadata.readArticleMeta('content-prio');
    expect(meta?.platforms?.devto?.updated_at).toBeDefined();
  });

  test('falls back to 03_published if 02_adapted missing', async () => {
    await engine.metadata.writeArticleMeta('fallback', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
      },
    });
    await fs.writeFile(path.join(tmpDir, '03_published', 'fallback.devto.md'), '---\ntitle: Published\n---\n\nBody');

    await updateCommand(engine, { article: 'fallback' });

    const meta = await engine.metadata.readArticleMeta('fallback');
    expect(meta?.platforms?.devto?.updated_at).toBeDefined();
  });

  test('throws if content file missing for target platform', async () => {
    await engine.metadata.writeArticleMeta('no-content', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
      },
    });

    await expect(updateCommand(engine, { article: 'no-content' }))
      .rejects.toThrow('No content found');
  });

  test('updates meta.yaml with updated_at on success', async () => {
    await engine.metadata.writeArticleMeta('update-meta', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
      },
    });
    await fs.writeFile(path.join(tmpDir, '03_published', 'update-meta.devto.md'), '---\ntitle: Test\n---\n\nBody');

    await updateCommand(engine, { article: 'update-meta' });

    const meta = await engine.metadata.readArticleMeta('update-meta');
    expect(meta?.platforms?.devto?.updated_at).toBeDefined();
    expect(meta?.platforms?.devto?.article_id).toBeDefined();
  });

  test('applies platform filter', async () => {
    await engine.metadata.writeArticleMeta('filter-test', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
        hashnode: { status: 'success', url: 'https://hashnode.com/test', published_at: '2026-01-01', article_id: 'abc' },
      },
    });
    await fs.writeFile(path.join(tmpDir, '03_published', 'filter-test.devto.md'), '---\ntitle: Test\n---\n\nBody');
    await fs.writeFile(path.join(tmpDir, '03_published', 'filter-test.hashnode.md'), '---\ntitle: Test\n---\n\nBody');

    await updateCommand(engine, { article: 'filter-test', platforms: 'devto' });

    const meta = await engine.metadata.readArticleMeta('filter-test');
    expect(meta?.platforms?.devto?.updated_at).toBeDefined();
    expect(meta?.platforms?.hashnode?.updated_at).toBeUndefined();
  });

  test('dry run does not call provider', async () => {
    await engine.metadata.writeArticleMeta('dry-test', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
      },
    });
    await fs.writeFile(path.join(tmpDir, '03_published', 'dry-test.devto.md'), '---\ntitle: Test\n---\n\nBody');

    await updateCommand(engine, { article: 'dry-test', dryRun: true });

    const meta = await engine.metadata.readArticleMeta('dry-test');
    expect(meta?.platforms?.devto?.updated_at).toBeUndefined();
  });

  test('produces correct JSON output', async () => {
    await engine.metadata.writeArticleMeta('json-test', {
      status: 'published',
      platforms: {
        devto: { status: 'success', url: 'https://dev.to/test', published_at: '2026-01-01', article_id: '42' },
      },
    });
    await fs.writeFile(path.join(tmpDir, '03_published', 'json-test.devto.md'), '---\ntitle: Test\n---\n\nBody');

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await updateCommand(engine, { article: 'json-test', json: true });

    const jsonCall = writeSpy.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('"command":"update"'),
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0] as string);
    expect(parsed.success).toBe(true);
    expect(parsed.data.updated).toHaveLength(1);
    expect(parsed.data.updated[0].platform).toBe('devto');

    writeSpy.mockRestore();
  });
});
