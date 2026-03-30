import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';
import { refreshCommand } from '../../../src/commands/refresh.js';

let tmpDir: string;
let engine: PipelineEngine;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-refresh-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('refreshCommand', () => {
  test('copies article from 03_published to 01_drafts', async () => {
    // Seed a published article
    const content = '# My Article\nContent here.';
    await engine.writeArticleFile('03_published', 'my-article', content);
    await engine.metadata.writeArticleMeta('my-article', { status: 'published' });

    await refreshCommand(engine, 'my-article');

    // Draft should exist
    const draftPath = engine.getArticlePath('01_drafts', 'my-article');
    expect(await fs.pathExists(draftPath)).toBe(true);
    expect(await fs.readFile(draftPath, 'utf-8')).toBe(content);

    // Original should still be in 03_published
    const publishedFiles = await engine.getArticleFiles('my-article', '03_published');
    expect(publishedFiles.length).toBeGreaterThan(0);

    // Metadata should be reset to drafted
    const meta = await engine.metadata.readArticleMeta('my-article');
    expect(meta?.status).toBe('drafted');
    expect(meta?.schedule).toBeUndefined();
    expect(meta?.adapted_platforms).toBeUndefined();
  });

  test('falls back to 02_adapted when not in 03_published', async () => {
    const content = '# Adapted Article\nPlatform content.';
    await engine.writeArticleFile('02_adapted', 'adapted-article', content, 'devto');
    await engine.metadata.writeArticleMeta('adapted-article', { status: 'adapted' });

    await refreshCommand(engine, 'adapted-article');

    const draftPath = engine.getArticlePath('01_drafts', 'adapted-article');
    expect(await fs.pathExists(draftPath)).toBe(true);

    const meta = await engine.metadata.readArticleMeta('adapted-article');
    expect(meta?.status).toBe('drafted');
  });

  test('prefers 03_published over 02_adapted when both exist', async () => {
    const publishedContent = '# Published Version\nFinal.';
    const adaptedContent = '# Adapted Version\nDraft.';

    await engine.writeArticleFile('03_published', 'multi-stage', publishedContent);
    await engine.writeArticleFile('02_adapted', 'multi-stage', adaptedContent, 'devto');
    await engine.metadata.writeArticleMeta('multi-stage', { status: 'published' });

    await refreshCommand(engine, 'multi-stage');

    const draftPath = engine.getArticlePath('01_drafts', 'multi-stage');
    const draftContent = await fs.readFile(draftPath, 'utf-8');
    expect(draftContent).toBe(publishedContent);
  });

  test('throws when article not found in any stage', async () => {
    await expect(refreshCommand(engine, 'nonexistent')).rejects.toThrow(
      'Article "nonexistent" not found in 03_published or 02_adapted',
    );
  });

  test('throws when draft already exists (collision guard)', async () => {
    await engine.writeArticleFile('03_published', 'my-article', '# Published');
    await engine.writeArticleFile('01_drafts', 'my-article', '# Existing draft');

    await expect(refreshCommand(engine, 'my-article')).rejects.toThrow(
      'Article "my-article" already exists in 01_drafts',
    );
  });

  test('rejects path traversal in article name', async () => {
    await expect(refreshCommand(engine, '../escape')).rejects.toThrow();
  });

  test('returns JSON output when json option is set', async () => {
    const content = '# JSON Test\nContent.';
    await engine.writeArticleFile('03_published', 'json-article', content);
    await engine.metadata.writeArticleMeta('json-article', { status: 'published' });

    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });

    await refreshCommand(engine, 'json-article', { json: true });

    spy.mockRestore();
    const output = JSON.parse(chunks.join(''));
    expect(output.command).toBe('refresh');
    expect(output.success).toBe(true);
    expect(output.data.article).toBe('json-article');
    expect(output.data.from).toBe('03_published');
    expect(output.data.to).toBe('01_drafts');
  });
});
