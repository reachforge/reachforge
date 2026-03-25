import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { PipelineEngine } from '../../../src/core/pipeline.js';
import { analyticsCommand, collectAnalytics } from '../../../src/commands/analytics.js';

let tmpDir: string;
let engine: PipelineEngine;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-analytics-'));
  engine = new PipelineEngine(tmpDir);
  await engine.initPipeline();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

/** Create a published article with platform results in meta.yaml */
async function createSentArticle(
  name: string,
  platforms: Record<string, { status: 'success' | 'failed'; url?: string; error?: string }>,
  publishedAt: string,
): Promise<void> {
  // Create flat platform files in 06_sent
  for (const platform of Object.keys(platforms)) {
    await engine.writeArticleFile('06_sent', name, `Content for ${platform}`, platform);
  }
  // Add published_at to each successful platform for date filtering
  const platformsWithDates: Record<string, any> = {};
  for (const [p, data] of Object.entries(platforms)) {
    platformsWithDates[p] = { ...data, published_at: publishedAt };
  }
  await engine.metadata.writeArticleMeta(name, {
    status: 'published',
    platforms: platformsWithDates,
  });
}

describe('collectAnalytics', () => {
  test('returns empty result when no articles in 06_sent', async () => {
    const result = await collectAnalytics(engine);
    expect(result.totalProjects).toBe(0);
    expect(Object.keys(result.platforms)).toHaveLength(0);
  });

  test('aggregates single article with one platform', async () => {
    await createSentArticle('test', {
      devto: { status: 'success', url: 'https://dev.to/test' },
    }, '2026-03-14T10:00:00Z');

    const result = await collectAnalytics(engine);
    expect(result.totalProjects).toBe(1);
    expect(result.platforms['devto'].success).toBe(1);
    expect(result.platforms['devto'].successRate).toBe(100);
  });

  test('aggregates multiple articles with mixed results', async () => {
    await createSentArticle('article-a', {
      devto: { status: 'success', url: 'https://dev.to/a' },
      x: { status: 'success', url: 'https://x.com/a' },
    }, '2026-03-14T10:00:00Z');

    await createSentArticle('article-b', {
      devto: { status: 'success', url: 'https://dev.to/b' },
      x: { status: 'failed', error: 'rate limit' },
    }, '2026-03-15T10:00:00Z');

    const result = await collectAnalytics(engine);
    expect(result.totalProjects).toBe(2);
    expect(result.platforms['devto'].success).toBe(2);
    expect(result.platforms['devto'].total).toBe(2);
    expect(result.platforms['devto'].successRate).toBe(100);
    expect(result.platforms['x'].success).toBe(1);
    expect(result.platforms['x'].failed).toBe(1);
    expect(result.platforms['x'].successRate).toBe(50);
    expect(result.overallSuccess).toBe(3);
    expect(result.overallTotal).toBe(4);
  });

  test('filters by --from date', async () => {
    await createSentArticle('old-article', {
      devto: { status: 'success' },
    }, '2026-03-10T10:00:00Z');

    await createSentArticle('new-article', {
      devto: { status: 'success' },
    }, '2026-03-15T10:00:00Z');

    const result = await collectAnalytics(engine, { from: '2026-03-12' });
    expect(result.totalProjects).toBe(1);
    expect(result.platforms['devto'].total).toBe(1);
  });

  test('filters by --to date', async () => {
    await createSentArticle('old-article', {
      devto: { status: 'success' },
    }, '2026-03-10T10:00:00Z');

    await createSentArticle('new-article', {
      devto: { status: 'success' },
    }, '2026-03-15T10:00:00Z');

    const result = await collectAnalytics(engine, { to: '2026-03-12' });
    expect(result.totalProjects).toBe(1);
  });

  test('filters by both --from and --to', async () => {
    await createSentArticle('a', { x: { status: 'success' } }, '2026-03-10T10:00:00Z');
    await createSentArticle('b', { x: { status: 'success' } }, '2026-03-12T10:00:00Z');
    await createSentArticle('c', { x: { status: 'success' } }, '2026-03-15T10:00:00Z');

    const result = await collectAnalytics(engine, { from: '2026-03-11', to: '2026-03-13' });
    expect(result.totalProjects).toBe(1);
  });

  test('throws on invalid date format', async () => {
    await expect(collectAnalytics(engine, { from: 'invalid' })).rejects.toThrow('Invalid --from date');
    await expect(collectAnalytics(engine, { to: '03/20/2026' })).rejects.toThrow('Invalid --to date');
  });

  test('skips articles without platform data in meta', async () => {
    // Article file exists in 06_sent but no platforms in meta
    await engine.writeArticleFile('06_sent', 'no-platforms', 'content', 'x');
    await engine.metadata.writeArticleMeta('no-platforms', { status: 'published' });

    const result = await collectAnalytics(engine);
    expect(result.totalProjects).toBe(0);
  });

  test('handles all-failed article', async () => {
    await createSentArticle('fail-article', {
      devto: { status: 'failed', error: 'API error' },
      x: { status: 'failed', error: 'timeout' },
    }, '2026-03-14T10:00:00Z');

    const result = await collectAnalytics(engine);
    expect(result.overallSuccess).toBe(0);
    expect(result.platforms['devto'].successRate).toBe(0);
  });
});

describe('analyticsCommand', () => {
  test('shows empty message when no items', async () => {
    await analyticsCommand(engine);
    const logs = (console.log as any).mock.calls.flat().join('\n');
    expect(logs).toContain('No published items');
  });

  test('displays analytics for published items', async () => {
    await createSentArticle('test', {
      devto: { status: 'success', url: 'https://dev.to/test' },
    }, '2026-03-14T10:00:00Z');

    await analyticsCommand(engine);
    const logs = (console.log as any).mock.calls.flat().join('\n');
    expect(logs).toContain('devto');
    expect(logs).toContain('100%');
  });
});
