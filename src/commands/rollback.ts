import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import { sanitizePath } from '../utils/path.js';

export async function rollbackCommand(engine: PipelineEngine, article: string, options: { json?: boolean } = {}): Promise<void> {
  const safeName = sanitizePath(article);
  await engine.initPipeline();

  const result = await engine.rollbackArticle(safeName);

  if (options.json) {
    process.stdout.write(jsonSuccess('rollback', {
      article: result.article ?? result.project,
      from: result.from,
      to: result.to,
      timestamp: result.timestamp,
    }));
    return;
  }

  console.log(chalk.magenta(`↩️ Rolled back "${result.article ?? result.project}" from ${result.from} to ${result.to}`));
}
