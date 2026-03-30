import * as readline from 'readline';
import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';

import { AdapterFactory } from '../llm/factory.js';
import { SessionManager } from '../llm/session.js';
import { sanitizePath } from '../utils/path.js';
import { jsonSuccess } from '../core/json-output.js';
import type { PipelineStage } from '../types/index.js';

export async function refineCommand(
  engine: PipelineEngine,
  article: string,
  options?: {
    /** Override stdin for non-TTY/testing. If provided, runs one turn and saves. */
    inputLines?: string[];
    /** Single-turn feedback (non-interactive). Implies inputLines. */
    feedback?: string;
    /** Output JSON envelope instead of human text. */
    json?: boolean;
  },
): Promise<void> {
  const safeName = sanitizePath(article);
  if (!safeName) throw new Error('Article name is required');

  // Normalize --feedback flag into inputLines for the non-interactive path
  if (options?.feedback && !options.inputLines) {
    options = { ...options, inputLines: [options.feedback] };
  }

  await engine.initPipeline();

  // Locate article in 01_drafts
  const { stage, filename, filePath } = await locateArticle(engine, safeName);

  // Read current content
  const currentContent = await fs.readFile(filePath, 'utf-8');
  const originalContent = currentContent;

  // Derive project dir (needed for adapter, resolver, and session)
  const projectDir = engine.projectDir;

  // Create adapter and resolver (built-in skills dir wired automatically)
  const { adapter, resolver } = AdapterFactory.create('draft', { projectDir });

  // Resolve skills
  const skills = await resolver.resolve('draft');

  // Load session
  const sessionManager = new SessionManager(projectDir);
  let session = await sessionManager.load(safeName, 'draft');

  if (session && session.adapter !== adapter.name) {
    console.log(chalk.yellow(
      `Previous session was with ${session.adapter}. Starting fresh session with ${adapter.name}.`,
    ));
    // Archive old session
    const oldPath = sessionManager.getSessionPath(safeName, 'draft');
    await fs.copy(oldPath, oldPath + '.bak').catch(() => {
      console.warn('Warning: Could not backup old session file — continuing without backup.');
    });
    await sessionManager.delete(safeName, 'draft');
    session = null;
  }

  if (session) {
    console.log(chalk.dim(`Resuming session ${session.sessionId} (last used: ${session.lastUsedAt})`));
  } else {
    console.log(chalk.dim(`Starting new refinement session with ${adapter.name}.`));
  }

  // Display preview
  printContentPreview(currentContent);

  // State
  let turnCount = 0;
  let sessionId = session?.sessionId ?? null;
  let latestContent = currentContent;

  // Non-TTY / test mode: single turn
  if (options?.inputLines) {
    const feedback = options.inputLines.join('\n').trim();
    let errorMessage: string | null = null;
    if (feedback && feedback !== '/quit' && feedback !== '/save') {
      turnCount++;
      const prompt = buildRefinePrompt(latestContent, feedback);
      const result = await adapter.execute({
        prompt,
        cwd: projectDir,
        skillPaths: skills.map(s => s.path),
        sessionId,
        timeoutSec: 300,
        extraArgs: [],
      });
      if (result.success && result.content) {
        latestContent = result.content;
        sessionId = result.sessionId ?? sessionId;
      } else if (!result.success) {
        errorMessage = result.errorMessage ?? 'LLM refinement failed';
      }
    }
    if (feedback !== '/quit') {
      await saveContent(engine, stage, safeName, filename, latestContent);
      if (sessionId) {
        await saveSession(sessionManager, safeName, adapter.name, sessionId, session, projectDir);
      }
      if (options?.json) {
        process.stdout.write(jsonSuccess('refine', {
          article: safeName,
          stage,
          updated: latestContent !== currentContent,
          ...(errorMessage ? { error: errorMessage } : {}),
        }));
      }
    }
    return;
  }

  // Interactive TTY mode
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    while (true) {
      const feedback = await promptUser(rl, 'Feedback (/save, /quit, /status, /diff): ');
      const trimmed = feedback.trim();

      if (trimmed === '/quit') {
        console.log('Exiting without saving.');
        break;
      }

      if (trimmed === '/save') {
        await saveContent(engine, stage, safeName, filename, latestContent);
        console.log(chalk.green(`Draft saved to ${stage}/${filename}`));
        break;
      }

      if (trimmed === '/status') {
        printStatus(adapter.name, sessionId, turnCount, safeName);
        continue;
      }

      if (trimmed === '/diff') {
        printDiff(originalContent, latestContent);
        continue;
      }

      if (!trimmed) {
        console.log('Please enter feedback or a command.');
        continue;
      }

      // Send feedback to LLM
      turnCount++;
      console.log(chalk.dim(`Sending feedback to ${adapter.name}... (turn ${turnCount})`));

      const prompt = buildRefinePrompt(latestContent, trimmed);
      const result = await adapter.execute({
        prompt,
        cwd: projectDir,
        skillPaths: skills.map(s => s.path),
        sessionId,
        timeoutSec: 300,
        extraArgs: [],
      });

      if (!result.success) {
        console.error(chalk.red(`Error: ${result.errorMessage ?? 'Unknown error'}`));
        if (result.errorCode === 'auth_required') {
          console.error(`Run '${adapter.command} login' to authenticate.`);
          break;
        }
        if (result.errorCode === 'timeout') {
          console.error('Try again with a shorter prompt or increase REACHFORGE_LLM_TIMEOUT.');
        }
        continue;
      }

      sessionId = result.sessionId ?? sessionId;
      latestContent = result.content || latestContent;
      printContentPreview(latestContent);

      // Save session after each successful turn
      if (sessionId) {
        await saveSession(sessionManager, safeName, adapter.name, sessionId, session, projectDir);
      }

      if (result.usage.inputTokens > 0 || result.usage.outputTokens > 0) {
        console.log(chalk.dim(
          `  Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out` +
          (result.costUsd != null ? ` ($${result.costUsd.toFixed(4)})` : ''),
        ));
      }
    }
  } finally {
    rl.close();
  }
}

// --- Exported helpers (for testing) ---

export function buildRefinePrompt(currentContent: string, feedback: string): string {
  return (
    'You are helping refine a draft article. ' +
    'Apply the user\'s feedback to improve the draft. ' +
    'Output the COMPLETE revised article (not just the changed parts).\n\n' +
    `## Current Draft\n\n${currentContent}\n\n` +
    `## User Feedback\n\n${feedback}`
  );
}

export function printStatus(adapterName: string, sessionId: string | null, turnCount: number, article: string): void {
  console.log(`Adapter: ${adapterName}`);
  console.log(`Article: ${article}`);
  console.log(`Session: ${sessionId ?? '(none - new session)'}`);
  console.log(`Turns completed: ${turnCount}`);
}

export function printDiff(original: string, current: string): void {
  if (original === current) {
    console.log('No changes from original.');
    return;
  }
  const originalLines = original.split('\n');
  const currentLines = current.split('\n');
  const delta = current.length - original.length;
  console.log(`Original: ${originalLines.length} lines, ${original.length} chars`);
  console.log(`Current:  ${currentLines.length} lines, ${current.length} chars`);
  console.log(`Delta:    ${delta > 0 ? '+' : ''}${delta} chars`);
}

export function printContentPreview(content: string): void {
  const preview = content.length > 500 ? content.slice(0, 500) + '...' : content;
  console.log('\n--- Updated Draft Preview ---');
  console.log(preview);
  console.log(`--- (${content.length} characters total) ---\n`);
}

// --- Internal helpers ---

async function locateArticle(engine: PipelineEngine, safeName: string) {
  // Check 01_drafts first (base article)
  const draftPath = engine.getArticlePath('01_drafts', safeName);
  if (await fs.pathExists(draftPath)) {
    return { stage: '01_drafts' as PipelineStage, filename: `${safeName}.md`, filePath: draftPath };
  }

  // Check 02_adapted for platform-specific files (e.g., "article.devto")
  // Try as exact filename: 02_adapted/{safeName}.md
  const adaptedPath = engine.getArticlePath('02_adapted', safeName);
  if (await fs.pathExists(adaptedPath)) {
    return { stage: '02_adapted' as PipelineStage, filename: `${safeName}.md`, filePath: adaptedPath };
  }

  throw new Error(
    `Article '${safeName}' not found in 01_drafts or 02_adapted. `
    + 'For platform versions, use: reach refine <article>.<platform> (e.g., reach refine my-post.devto)',
  );
}

function promptUser(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

async function saveContent(
  engine: PipelineEngine,
  stage: PipelineStage,
  article: string,
  _filename: string,
  content: string,
): Promise<void> {
  await engine.writeArticleFile(stage, article, content);
  // Don't change status when refining in adapted stage (keep adapted/scheduled status)
  if (stage === '01_drafts') {
    await engine.metadata.writeArticleMeta(article, { status: 'drafted' });
  }
}

async function saveSession(
  sessionManager: SessionManager,
  article: string,
  adapterName: 'claude' | 'gemini' | 'codex',
  sessionId: string,
  existingSession: { createdAt: string } | null,
  projectDir: string,
): Promise<void> {
  try {
    await sessionManager.save(article, 'draft', {
      sessionId,
      adapter: adapterName,
      stage: 'draft',
      cwd: projectDir,
      createdAt: existingSession?.createdAt ?? new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
  } catch {
    console.warn('Warning: Failed to save session.');
  }
}
