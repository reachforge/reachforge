import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import yaml from 'js-yaml';
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

async function createSentProject(name: string, receipt: object): Promise<void> {
  const dir = path.join(tmpDir, '06_sent', name);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'receipt.yaml'), yaml.dump(receipt, { lineWidth: -1 }));
}

describe('collectAnalytics', () => {
  test('returns empty result when no projects in 06_sent', async () => {
    const result = await collectAnalytics(engine);
    expect(result.totalProjects).toBe(0);
    expect(Object.keys(result.platforms)).toHaveLength(0);
  });

  test('aggregates single project with one platform', async () => {
    await createSentProject('2026-03-14-test', {
      status: 'completed',
      published_at: '2026-03-14T10:00:00Z',
      items: [{ platform: 'devto', status: 'success', url: 'https://dev.to/test' }],
    });

    const result = await collectAnalytics(engine);
    expect(result.totalProjects).toBe(1);
    expect(result.platforms['devto'].success).toBe(1);
    expect(result.platforms['devto'].successRate).toBe(100);
  });

  test('aggregates multiple projects with mixed results', async () => {
    await createSentProject('2026-03-14-a', {
      status: 'completed',
      published_at: '2026-03-14T10:00:00Z',
      items: [
        { platform: 'devto', status: 'success', url: 'https://dev.to/a' },
        { platform: 'x', status: 'success', url: 'https://x.com/a' },
      ],
    });
    await createSentProject('2026-03-15-b', {
      status: 'partial',
      published_at: '2026-03-15T10:00:00Z',
      items: [
        { platform: 'devto', status: 'success', url: 'https://dev.to/b' },
        { platform: 'x', status: 'failed', error: 'rate limit' },
      ],
    });

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
    await createSentProject('2026-03-10-old', {
      status: 'completed',
      published_at: '2026-03-10T10:00:00Z',
      items: [{ platform: 'devto', status: 'success' }],
    });
    await createSentProject('2026-03-15-new', {
      status: 'completed',
      published_at: '2026-03-15T10:00:00Z',
      items: [{ platform: 'devto', status: 'success' }],
    });

    const result = await collectAnalytics(engine, { from: '2026-03-12' });
    expect(result.totalProjects).toBe(1);
    expect(result.platforms['devto'].total).toBe(1);
  });

  test('filters by --to date', async () => {
    await createSentProject('2026-03-10-old', {
      status: 'completed',
      published_at: '2026-03-10T10:00:00Z',
      items: [{ platform: 'devto', status: 'success' }],
    });
    await createSentProject('2026-03-15-new', {
      status: 'completed',
      published_at: '2026-03-15T10:00:00Z',
      items: [{ platform: 'devto', status: 'success' }],
    });

    const result = await collectAnalytics(engine, { to: '2026-03-12' });
    expect(result.totalProjects).toBe(1);
  });

  test('filters by both --from and --to', async () => {
    await createSentProject('2026-03-10-a', { status: 'completed', published_at: '2026-03-10T10:00:00Z', items: [{ platform: 'x', status: 'success' }] });
    await createSentProject('2026-03-12-b', { status: 'completed', published_at: '2026-03-12T10:00:00Z', items: [{ platform: 'x', status: 'success' }] });
    await createSentProject('2026-03-15-c', { status: 'completed', published_at: '2026-03-15T10:00:00Z', items: [{ platform: 'x', status: 'success' }] });

    const result = await collectAnalytics(engine, { from: '2026-03-11', to: '2026-03-13' });
    expect(result.totalProjects).toBe(1);
  });

  test('throws on invalid date format', async () => {
    await expect(collectAnalytics(engine, { from: 'invalid' })).rejects.toThrow('Invalid --from date');
    await expect(collectAnalytics(engine, { to: '03/20/2026' })).rejects.toThrow('Invalid --to date');
  });

  test('skips projects without receipt.yaml', async () => {
    await fs.ensureDir(path.join(tmpDir, '06_sent', 'no-receipt'));
    const result = await collectAnalytics(engine);
    expect(result.totalProjects).toBe(0);
  });

  test('handles all-failed receipt', async () => {
    await createSentProject('2026-03-14-fail', {
      status: 'partial',
      published_at: '2026-03-14T10:00:00Z',
      items: [
        { platform: 'devto', status: 'failed', error: 'API error' },
        { platform: 'x', status: 'failed', error: 'timeout' },
      ],
    });

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
    await createSentProject('2026-03-14-test', {
      status: 'completed',
      published_at: '2026-03-14T10:00:00Z',
      items: [{ platform: 'devto', status: 'success', url: 'https://dev.to/test' }],
    });

    await analyticsCommand(engine);
    const logs = (console.log as any).mock.calls.flat().join('\n');
    expect(logs).toContain('devto');
    expect(logs).toContain('100%');
  });
});
