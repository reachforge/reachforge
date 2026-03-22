import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import {
  buildRefinePrompt,
  printStatus,
  printDiff,
  printContentPreview,
  refineCommand,
} from '../../../src/commands/refine.js';
import { PipelineEngine } from '../../../src/core/pipeline.js';
import { STAGES, DRAFT_FILENAME, MASTER_FILENAME } from '../../../src/core/constants.js';

// Mock AdapterFactory
const mockExecute = vi.fn();
const mockAdapter = {
  name: 'claude' as const,
  command: 'claude',
  execute: mockExecute,
  probe: vi.fn(),
};

vi.mock('../../../src/llm/factory.js', () => ({
  AdapterFactory: {
    create: () => ({
      adapter: mockAdapter,
      resolver: { resolve: vi.fn().mockResolvedValue([]) },
    }),
  },
  LLMFactory: { create: vi.fn(), createFromApiKey: vi.fn() },
}));

let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-refine-'));
  // Create pipeline stages
  for (const stage of STAGES) {
    await fs.ensureDir(path.join(tmpDir, stage));
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(tmpDir);
});

async function createDraft(name: string, content: string = '# Draft\n\nContent here.') {
  const dir = path.join(tmpDir, '02_drafts', name);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, DRAFT_FILENAME), content);
}

async function createMaster(name: string, content: string = '# Master\n\nMaster content.') {
  const dir = path.join(tmpDir, '03_master', name);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, MASTER_FILENAME), content);
}

function successResult(content: string): any {
  return {
    success: true,
    content,
    sessionId: 'sess-1',
    usage: { inputTokens: 10, outputTokens: 20, cachedTokens: 0 },
    costUsd: 0.01,
    model: 'claude-sonnet-4-6',
    errorMessage: null,
    errorCode: null,
    exitCode: 0,
    timedOut: false,
  };
}

// --- T01: Helper functions ---

describe('buildRefinePrompt', () => {
  test('includes current content and user feedback', () => {
    const prompt = buildRefinePrompt('My draft', 'Make it shorter');
    expect(prompt).toContain('My draft');
    expect(prompt).toContain('Make it shorter');
  });

  test('includes refine instructions', () => {
    const prompt = buildRefinePrompt('Draft', 'Feedback');
    expect(prompt).toContain('COMPLETE revised article');
    expect(prompt).toContain('## Current Draft');
    expect(prompt).toContain('## User Feedback');
  });
});

describe('printStatus', () => {
  test('displays adapter, session, turn count, article', () => {
    printStatus('claude', 'sess-123', 3, 'my-article');
    const output = (console.log as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(output).toContain('claude');
    expect(output).toContain('sess-123');
    expect(output).toContain('3');
    expect(output).toContain('my-article');
  });
});

describe('printDiff', () => {
  test('shows "No changes" when content is identical', () => {
    printDiff('same', 'same');
    const output = (console.log as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(output).toContain('No changes');
  });

  test('shows character delta when content differs', () => {
    printDiff('short', 'a much longer string');
    const output = (console.log as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(output).toContain('Delta:');
    expect(output).toContain('+');
  });
});

describe('printContentPreview', () => {
  test('truncates at 500 chars with ellipsis', () => {
    const longContent = 'A'.repeat(1000);
    printContentPreview(longContent);
    const output = (console.log as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(output).toContain('...');
    expect(output).toContain('1000 characters total');
  });

  test('shows full content when under 500 chars', () => {
    printContentPreview('Short content');
    const output = (console.log as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(output).toContain('Short content');
    expect(output).not.toContain('...');
  });
});

// --- T02: Article lookup + session ---

describe('refineCommand article lookup', () => {
  test('throws when article doesn\'t exist in drafts or master', async () => {
    const engine = new PipelineEngine(tmpDir);
    await expect(
      refineCommand(engine, 'nonexistent', { inputLines: ['/quit'] }),
    ).rejects.toThrow('not found in 02_drafts or 03_master');
  });

  test('locates article in 02_drafts when it exists there', async () => {
    await createDraft('my-art');
    mockExecute.mockResolvedValue(successResult('Revised draft'));
    const engine = new PipelineEngine(tmpDir);
    await refineCommand(engine, 'my-art', { inputLines: ['/save'] });
    // Should save to 02_drafts
    const saved = await fs.readFile(path.join(tmpDir, '02_drafts', 'my-art', DRAFT_FILENAME), 'utf-8');
    expect(saved).toContain('Draft');
  });

  test('locates article in 03_master when not in 02_drafts', async () => {
    await createMaster('my-art');
    const engine = new PipelineEngine(tmpDir);
    await refineCommand(engine, 'my-art', { inputLines: ['/save'] });
    const saved = await fs.readFile(path.join(tmpDir, '03_master', 'my-art', MASTER_FILENAME), 'utf-8');
    expect(saved).toContain('Master');
  });

  test('starts new session when no session file exists', async () => {
    await createDraft('my-art');
    mockExecute.mockResolvedValue(successResult('Revised'));
    const engine = new PipelineEngine(tmpDir);
    await refineCommand(engine, 'my-art', { inputLines: ['make it better'] });
    const output = (console.log as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(output).toContain('Starting new refinement session');
  });
});

// --- T03: Interactive loop (tested via inputLines for non-TTY) ---

describe('refineCommand slash commands', () => {
  test('/save command writes content to draft file and exits', async () => {
    await createDraft('art', 'Original content');
    mockExecute.mockResolvedValue(successResult('Better content'));
    const engine = new PipelineEngine(tmpDir);
    // Send feedback then save
    await refineCommand(engine, 'art', { inputLines: ['improve it'] });
    const saved = await fs.readFile(path.join(tmpDir, '02_drafts', 'art', DRAFT_FILENAME), 'utf-8');
    expect(saved).toBe('Better content');
  });

  test('/quit command exits without writing', async () => {
    await createDraft('art', 'Original content');
    const engine = new PipelineEngine(tmpDir);
    await refineCommand(engine, 'art', { inputLines: ['/quit'] });
    const content = await fs.readFile(path.join(tmpDir, '02_drafts', 'art', DRAFT_FILENAME), 'utf-8');
    expect(content).toBe('Original content');
  });

  test('successful LLM turn updates content and saves session', async () => {
    await createDraft('art', 'Original');
    mockExecute.mockResolvedValue(successResult('Updated content'));
    const engine = new PipelineEngine(tmpDir);
    await refineCommand(engine, 'art', { inputLines: ['revise it'] });
    // Content should be updated
    const saved = await fs.readFile(path.join(tmpDir, '02_drafts', 'art', DRAFT_FILENAME), 'utf-8');
    expect(saved).toBe('Updated content');
    // Session should be saved
    const sessionPath = path.join(tmpDir, '.reach', 'sessions', 'art', 'draft.json');
    expect(await fs.pathExists(sessionPath)).toBe(true);
  });

  test('failed LLM turn prints error and does not update content', async () => {
    await createDraft('art', 'Original');
    mockExecute.mockResolvedValue({
      success: false,
      content: '',
      sessionId: null,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      costUsd: null,
      model: 'unknown',
      errorMessage: 'Something went wrong',
      errorCode: 'unknown',
      exitCode: 1,
      timedOut: false,
    });
    const engine = new PipelineEngine(tmpDir);
    // Non-TTY mode: even on failure, it tries to save original content
    await refineCommand(engine, 'art', { inputLines: ['do something'] });
    const saved = await fs.readFile(path.join(tmpDir, '02_drafts', 'art', DRAFT_FILENAME), 'utf-8');
    expect(saved).toBe('Original');
  });

  test('auth error in non-TTY mode does not save', async () => {
    await createDraft('art', 'Original');
    mockExecute.mockResolvedValue({
      success: false,
      content: '',
      sessionId: null,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      costUsd: null,
      model: 'unknown',
      errorMessage: 'Not logged in',
      errorCode: 'auth_required',
      exitCode: 1,
      timedOut: false,
    });
    const engine = new PipelineEngine(tmpDir);
    // Even on auth failure, non-TTY saves the original (no changes were made)
    await refineCommand(engine, 'art', { inputLines: ['do something'] });
    const saved = await fs.readFile(path.join(tmpDir, '02_drafts', 'art', DRAFT_FILENAME), 'utf-8');
    expect(saved).toBe('Original');
  });
});

// --- T04: Non-TTY ---

describe('refineCommand non-TTY', () => {
  test('reads input, executes one turn, saves, exits', async () => {
    await createDraft('art', 'Original');
    mockExecute.mockResolvedValue(successResult('Non-TTY result'));
    const engine = new PipelineEngine(tmpDir);
    await refineCommand(engine, 'art', { inputLines: ['make it concise'] });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const saved = await fs.readFile(path.join(tmpDir, '02_drafts', 'art', DRAFT_FILENAME), 'utf-8');
    expect(saved).toBe('Non-TTY result');
  });
});

// --- T05: --feedback flag ---

describe('refineCommand --feedback', () => {
  test('normalizes feedback into single-turn non-interactive path', async () => {
    await createDraft('art', 'Original');
    mockExecute.mockResolvedValue(successResult('Feedback result'));
    const engine = new PipelineEngine(tmpDir);
    await refineCommand(engine, 'art', { feedback: 'make it shorter' });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const prompt = mockExecute.mock.calls[0][0].prompt;
    expect(prompt).toContain('make it shorter');

    const saved = await fs.readFile(path.join(tmpDir, '02_drafts', 'art', DRAFT_FILENAME), 'utf-8');
    expect(saved).toBe('Feedback result');
  });

  test('--feedback + --json outputs structured result on success', async () => {
    await createDraft('art', 'Original');
    mockExecute.mockResolvedValue(successResult('Better'));
    const engine = new PipelineEngine(tmpDir);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await refineCommand(engine, 'art', { feedback: 'improve', json: true });

    const jsonCall = writeSpy.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('"command":"refine"'),
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0] as string);
    expect(parsed.data.article).toBe('art');
    expect(parsed.data.updated).toBe(true);
    expect(parsed.data.error).toBeUndefined();

    writeSpy.mockRestore();
  });

  test('--feedback + --json includes error on LLM failure', async () => {
    await createDraft('art', 'Original');
    mockExecute.mockResolvedValue({
      success: false,
      content: '',
      sessionId: null,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      costUsd: null,
      model: 'unknown',
      errorMessage: 'API down',
      errorCode: 'unknown',
      exitCode: 1,
      timedOut: false,
    });
    const engine = new PipelineEngine(tmpDir);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await refineCommand(engine, 'art', { feedback: 'try something', json: true });

    const jsonCall = writeSpy.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('"command":"refine"'),
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0] as string);
    expect(parsed.data.updated).toBe(false);
    expect(parsed.data.error).toBe('API down');

    writeSpy.mockRestore();
  });
});
