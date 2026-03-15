import chalk from 'chalk';
import fs from 'fs-extra';
import * as path from 'path';
import type { PipelineEngine } from '../core/pipeline.js';
import type { LLMProvider } from '../llm/types.js';
import { sanitizePath } from '../utils/path.js';
import { DRAFT_FILENAME, META_FILENAME } from '../core/constants.js';

export async function draftCommand(engine: PipelineEngine, llm: LLMProvider, source: string): Promise<void> {
  const safeName = sanitizePath(source);
  console.log(chalk.cyan(`✍️ Generating AI draft for "${safeName}"...`));

  await engine.initPipeline();

  const sourcePath = engine.getProjectPath('01_inbox', safeName);
  if (!await fs.pathExists(sourcePath)) {
    throw new Error(`Source "${safeName}" not found in 01_inbox`);
  }

  const stats = await fs.stat(sourcePath);
  let content = '';
  if (stats.isDirectory()) {
    const files = await fs.readdir(sourcePath);
    // Deterministic file selection: prefer main.md > index.md > first .md > first .txt
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
      content = await fs.readFile(path.join(sourcePath, sorted[0]), 'utf-8');
    }
  } else {
    content = await fs.readFile(sourcePath, 'utf-8');
  }
  if (!content) content = safeName;

  const result = await llm.generate(content);

  const draftName = safeName.replace(/\.[^/.]+$/, '');
  await engine.writeProjectFile('02_drafts', draftName, DRAFT_FILENAME, result.content);
  await engine.metadata.writeMeta('02_drafts', draftName, { article: safeName, status: 'drafted' });

  console.log(chalk.green(`✅ Draft generated! Please check 02_drafts/${draftName}`));
}
