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
  test('immediate mode: full pipeline reaches schedule or sent', async () => {
    await goCommand(engine, 'write about apcore');

    const slug = 'write-about-apcore';

    // Content should have passed through all stages up to at least 05_scheduled
    // It may stay in 05_scheduled if platform validation blocks publish (e.g. X 280-char limit)
    // or move to 06_sent if all validations pass (mock content is short)
    const scheduled = await engine.listProjects('05_scheduled');
    const sent = await engine.listProjects('06_sent');
    expect(scheduled.length + sent.length).toBe(1);

    // inbox stays (source material), drafts cleared (approved → master), master stays (source of truth)
    expect(await engine.listProjects('01_inbox')).toContain(slug);
    expect(await engine.listProjects('02_drafts')).toEqual([]);
    expect(await engine.listProjects('03_master')).toContain(slug);
    expect(await engine.listProjects('04_adapted')).toEqual([]);
  });

  test('schedule mode: stops at 05_scheduled, does not publish', async () => {
    await goCommand(engine, 'write about apcore', { schedule: '2099-12-31' });

    const slug = 'write-about-apcore';

    // Should be in scheduled, NOT sent
    const scheduled = await engine.listProjects('05_scheduled');
    expect(scheduled.length).toBe(1);
    expect(scheduled[0]).toBe('2099-12-31T00-00-00-write-about-apcore');

    const sent = await engine.listProjects('06_sent');
    expect(sent).toEqual([]);
  });

  test('schedule mode with time: normalizes to directory format', async () => {
    await goCommand(engine, 'time test', { schedule: '2099-12-31T14:30' });

    const scheduled = await engine.listProjects('05_scheduled');
    expect(scheduled.length).toBe(1);
    expect(scheduled[0]).toBe('2099-12-31T14-30-00-time-test');
  });

  test('--dry-run passes through to publish', async () => {
    await goCommand(engine, 'dry run test', { dryRun: true });

    // With dry-run, content stays in scheduled (publish previewed but not executed)
    const scheduled = await engine.listProjects('05_scheduled');
    expect(scheduled.length).toBe(1);
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

    // Inbox item should exist (step 1 succeeded)
    const inbox = await engine.listProjects('01_inbox');
    expect(inbox).toContain('fail-test');

    // Draft should NOT exist (step 2 failed)
    const drafts = await engine.listProjects('02_drafts');
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
