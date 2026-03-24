import chalk from 'chalk';
import fs from 'fs-extra';
import * as path from 'path';
import type { PipelineEngine } from '../core/pipeline.js';
import { AdapterFactory } from '../llm/factory.js';
import { sanitizePath } from '../utils/path.js';
import { TemplateResolver } from '../core/templates.js';
import { jsonSuccess } from '../core/json-output.js';

export async function draftCommand(engine: PipelineEngine, source: string, options: { json?: boolean } = {}): Promise<void> {
  const safeName = sanitizePath(source);
  if (!options.json) console.log(chalk.cyan(`✍️ Generating AI draft for "${safeName}"...`));

  await engine.initPipeline();

  // Check for source: first try {article}.md flat file, then {article}/ directory (inbox compat)
  const flatPath = engine.getArticlePath('01_inbox', safeName);
  const dirPath = path.join(engine.projectDir, '01_inbox', safeName);

  let content = '';
  if (await fs.pathExists(flatPath)) {
    content = await fs.readFile(flatPath, 'utf-8');
  } else if (await fs.pathExists(dirPath)) {
    const stats = await fs.stat(dirPath);
    if (stats.isDirectory()) {
      const files = await fs.readdir(dirPath);
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
        content = await fs.readFile(path.join(dirPath, sorted[0]), 'utf-8');
      }
    }
  } else {
    throw new Error(`Source "${safeName}" not found in 01_inbox`);
  }

  if (!content) content = safeName;

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('draft', { projectDir });
  const skills = await resolver.resolve('draft');

  const meta = await engine.metadata.readArticleMeta(safeName.replace(/\.[^/.]+$/, '')).catch(() => null);
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

  const draftName = safeName.replace(/\.[^/.]+$/, '');
  // Write flat file: 02_drafts/{article}.md
  await engine.writeArticleFile('02_drafts', draftName, result.content);
  await engine.metadata.writeArticleMeta(draftName, { status: 'drafted' });

  if (options.json) {
    process.stdout.write(jsonSuccess('draft', {
      source: safeName,
      draft: draftName,
      stage: '02_drafts' as const,
    }));
    return;
  }

  console.log(chalk.green(`✅ Draft generated! Please check 02_drafts/${draftName}.md`));
}
