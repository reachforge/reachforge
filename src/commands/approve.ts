import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import { sanitizePath } from '../utils/path.js';

export async function approveCommand(
  engine: PipelineEngine,
  article: string,
  options: { json?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);

  await engine.initPipeline();

  // Move flat file: 02_drafts/{article}.md → 03_master/{article}.md
  const result = await engine.moveArticle(safeName, '02_drafts', '03_master');

  if (options.json) {
    process.stdout.write(jsonSuccess('approve', {
      article: safeName,
      from: '02_drafts' as const,
      to: '03_master' as const,
    }));
    return;
  }

  console.log(chalk.green(`✅ Approved: "${safeName}" promoted to 03_master`));
}
