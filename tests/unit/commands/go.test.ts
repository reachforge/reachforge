import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { slugify } from '../../../src/commands/go.js';

// --- slugify unit tests (pure function, no mocks needed) ---

describe('slugify', () => {
  test('basic English prompt', () => {
    expect(slugify('write about apcore framework')).toBe('write-about-apcore-framework');
  });

  test('truncates to 5 words', () => {
    expect(slugify('one two three four five six seven')).toBe('one-two-three-four-five');
  });

  test('strips special characters', () => {
    expect(slugify('Hello, World! @2026')).toBe('hello-world-2026');
  });

  test('handles extra whitespace', () => {
    expect(slugify('  spaced   out  prompt  ')).toBe('spaced-out-prompt');
  });

  test('pure non-ASCII prompt falls back to hash-based slug', () => {
    // Use characters that are stripped by the ASCII filter
    const slug = slugify('\u{1F680}\u{1F525}');
    expect(slug).toMatch(/^go-[a-z0-9]+$/);
  });

  test('same non-ASCII prompt produces same slug', () => {
    expect(slugify('\u{1F680}\u{1F525}')).toBe(slugify('\u{1F680}\u{1F525}'));
  });

  test('different non-ASCII prompts produce different slugs', () => {
    expect(slugify('\u{1F680}')).not.toBe(slugify('\u{2764}'));
  });

  test('empty string falls back to hash slug', () => {
    const slug = slugify('');
    expect(slug).toMatch(/^go-/);
  });

  test('mixed ASCII and CJK keeps ASCII part', () => {
    expect(slugify('apcore is great')).toBe('apcore-is-great');
  });
});

// --- goCommand integration tests (mock LLM) ---

const mockExecute = vi.fn();

vi.mock('../../../src/llm/factory.js', () => ({
  AdapterFactory: {
    create: () => ({
      adapter: {
        name: 'claude',
        command: 'claude',
        execute: mockExecute,
        probe: vi.fn(),
      },
      resolver: { resolve: vi.fn().mockResolvedValue([]) },
    }),
  },
  LLMFactory: { create: vi.fn(), createFromApiKey: vi.fn() },
}));

const { goCommand } = await import('../../../src/commands/go.js');
const { PipelineEngine } = await import('../../../src/core/pipeline.js');

let tmpDir: string;
let engine: ReturnType<typeof createEngine>;

function createEngine(dir: string) {
  return new PipelineEngine(dir);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-go-'));
  engine = createEngine(tmpDir);
  await engine.initPipeline();

  mockExecute.mockImplementation(async ({ prompt }: { prompt: string }) => ({
    success: true,
    content: `# Generated\n\n${prompt}`,
    sessionId: null,
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    costUsd: null,
    model: 'mock',
    errorMessage: null,
    errorCode: null,
    exitCode: 0,
    timedOut: false,
  }));

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('goCommand', () => {
  test('immediate mode: full pipeline reaches adapted or published', async () => {
    await goCommand(engine, 'write about apcore');

    const slug = 'write-about-apcore';

    // Content should have passed through all 3 stages up to at least 02_adapted
    // It may stay in 02_adapted if platform validation blocks publish (e.g. X 280-char limit)
    // or move to 03_published if all validations pass (mock content is short)
    const adapted = await engine.listArticles('02_adapted');
    const published = await engine.listArticles('03_published');
    expect(adapted.length + published.length).toBe(1);

    // Draft stays in 01_drafts (source of truth), adapted cleared on successful publish
    expect(await engine.listArticles('01_drafts')).toContain(slug);
  });

  test('schedule mode: stays in 02_adapted, does not publish', async () => {
    await goCommand(engine, 'write about apcore', { schedule: '2099-12-31' });

    const slug = 'write-about-apcore';

    // Should be in adapted with scheduled metadata, NOT published
    const adapted = await engine.listArticles('02_adapted');
    expect(adapted.length).toBe(1);
    expect(adapted[0]).toBe(slug);

    const published = await engine.listArticles('03_published');
    expect(published).toEqual([]);
  });

  test('schedule mode with time: stores normalized date in meta', async () => {
    await goCommand(engine, 'time test', { schedule: '2099-12-31T14:30' });

    const adapted = await engine.listArticles('02_adapted');
    expect(adapted.length).toBe(1);
    expect(adapted[0]).toBe('time-test');

    // Date stored in meta.yaml, not directory name
    const meta = await engine.metadata.readArticleMeta('time-test');
    expect(meta?.schedule).toBe('2099-12-31T14:30:00');
  });

  test('--dry-run passes through to publish', async () => {
    await goCommand(engine, 'dry run test', { dryRun: true });

    // With dry-run, content stays in 02_adapted (publish previewed but not executed)
    const adapted = await engine.listArticles('02_adapted');
    expect(adapted.length).toBe(1);
  });

  test('invalid schedule date throws', async () => {
    await expect(
      goCommand(engine, 'test', { schedule: 'not-a-date' }),
    ).rejects.toThrow();
  });

  test('LLM failure at draft step reports which step failed', async () => {
    mockExecute.mockRejectedValueOnce(new Error('API down'));

    await expect(
      goCommand(engine, 'fail test'),
    ).rejects.toThrow('API down');

    // Draft should NOT exist (step 1 failed)
    const drafts = await engine.listArticles('01_drafts');
    expect(drafts).toEqual([]);
  });

  test('json mode outputs structured result', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await goCommand(engine, 'json test', { json: true });

    const jsonCall = writeSpy.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('"command":"go"'),
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0] as string);
    expect(parsed.data.slug).toBe('json-test');
    expect(parsed.data.published).toBe(true);

    writeSpy.mockRestore();
  });
});
