import chalk from 'chalk';
import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import type { PipelineEngine } from '../core/pipeline.js';
import { AdapterFactory } from '../llm/factory.js';
import { sanitizePath } from '../utils/path.js';
import { TemplateResolver } from '../core/templates.js';
import { jsonSuccess } from '../core/json-output.js';

/**
 * Resolve input: auto-detect prompt string, file path, or directory.
 * Returns { content, name } where name is the derived article slug.
 */
/**
 * Detect whether input looks like a file/directory path.
 * Matches: /, ./, ../, ~/, C:\, D:/, or has common file extensions.
 */
function looksLikePath(input: string): boolean {
  return /^[.~\/\\]|^[a-zA-Z]:[\/\\]/.test(input)
    || /\.(md|mdx|txt|html?)$/i.test(input);
}

/**
 * Generate a slug from a prompt string. For ASCII text, takes first 5 words.
 * For non-ASCII (CJK etc.), uses a hash-based slug.
 */
function promptToSlug(input: string): string {
  const ascii = input.slice(0, 60).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  if (ascii.length > 0) {
    return ascii.split('-').slice(0, 5).join('-');
  }
  // Non-ASCII fallback: hash-based slug
  let hash = 0;
  const src = input.slice(0, 20);
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
  }
  return `draft-${(hash >>> 0).toString(36)}`;
}

export async function resolveInput(
  input: string,
  nameOverride?: string,
): Promise<{ content: string; name: string }> {
  // Reject empty input
  if (!input || !input.trim()) {
    throw new Error('Input is required: provide a prompt string, file path, or directory');
  }

  // Check if it's a file/directory path
  const isPath = looksLikePath(input);
  if (isPath) {
    // Expand ~ to home directory
    const expanded = input.startsWith('~/') || input === '~'
      ? path.join(os.homedir(), input.slice(1))
      : input;
    const resolved = path.resolve(expanded);
    if (await fs.pathExists(resolved)) {
      const stats = await fs.stat(resolved);

      if (stats.isFile()) {
        const content = await fs.readFile(resolved, 'utf-8');
        const basename = path.basename(resolved, path.extname(resolved));
        return { content, name: nameOverride || sanitizePath(basename) };
      }

      if (stats.isDirectory()) {
        const files = await fs.readdir(resolved);
        const sorted = files
          .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
          .sort((a, b) => {
            const priority = (name: string) => {
              if (name === 'main.md') return 0;
              if (name === 'index.md') return 1;
              if (name.endsWith('.md')) return 2;
              return 3;
            };
            return priority(a) - priority(b);
          });
        if (sorted.length > 0) {
          const content = await fs.readFile(path.join(resolved, sorted[0]), 'utf-8');
          const dirname = path.basename(resolved);
          return { content, name: nameOverride || sanitizePath(dirname) };
        }
        throw new Error(`No .md or .txt files found in directory: ${input}`);
      }
    }
    // Path-like input but file/dir not found
    throw new Error(`File not found: ${input}`);
  }

  // Treat as prompt string
  const slug = nameOverride || promptToSlug(input);
  return { content: input, name: slug };
}

export async function draftCommand(
  engine: PipelineEngine,
  source: string,
  options: { name?: string; cover?: string; json?: boolean } = {},
): Promise<void> {
  await engine.initPipeline();

  const { content, name: draftName } = await resolveInput(source, options.name ? sanitizePath(options.name) : undefined);

  if (!options.json) console.log(chalk.cyan(`✍️ Generating AI draft for "${draftName}"...`));

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('draft', { projectDir });
  const skills = await resolver.resolve('draft');

  const meta = await engine.metadata.readArticleMeta(draftName).catch(() => null);
  const templateResolver = new TemplateResolver(projectDir);
  const resolved = await templateResolver.resolveDraftPrompt(meta?.template);
  const prompt = `${resolved.prompt}\n\n${content}`;
  const result = await adapter.execute({
    prompt,
    cwd: projectDir,
    skillPaths: skills.map(s => s.path),
    sessionId: null,
    timeoutSec: 300,
    extraArgs: [],
  });

  if (!result.success) {
    const details = [
      result.errorMessage,
      result.errorCode ? `code: ${result.errorCode}` : null,
      result.exitCode !== null && result.exitCode !== 0 ? `exit: ${result.exitCode}` : null,
      !result.content ? 'LLM returned empty content' : null,
    ].filter(Boolean).join('; ');
    throw new Error(details || 'Draft generation failed (unknown reason)');
  }

  await engine.writeArticleFile('01_drafts', draftName, result.content);
  await engine.metadata.writeArticleMeta(draftName, {
    status: 'drafted',
    ...(options.cover ? { cover_image: options.cover } : {}),
  });

  if (options.json) {
    process.stdout.write(jsonSuccess('draft', {
      source,
      draft: draftName,
      stage: '01_drafts' as const,
    }));
    return;
  }

  console.log(chalk.green(`✅ Draft generated! Please check 01_drafts/${draftName}.md`));
}
