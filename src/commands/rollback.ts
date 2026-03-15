import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { sanitizePath } from '../utils/path.js';

export async function rollbackCommand(engine: PipelineEngine, project: string): Promise<void> {
  const safeName = sanitizePath(project);
  await engine.initPipeline();

  const result = await engine.rollbackProject(safeName);
  console.log(chalk.magenta(`↩️ Rolled back "${result.project}" from ${result.from} to ${result.to}`));
}
