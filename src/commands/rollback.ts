import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import { sanitizePath } from '../utils/path.js';

export async function rollbackCommand(engine: PipelineEngine, project: string, options: { json?: boolean } = {}): Promise<void> {
  const safeName = sanitizePath(project);
  await engine.initPipeline();

  const result = await engine.rollbackProject(safeName);

  if (options.json) {
    process.stdout.write(jsonSuccess('rollback', {
      project: result.project,
      from: result.from,
      to: result.to,
      timestamp: result.timestamp,
    }));
    return;
  }

  console.log(chalk.magenta(`↩️ Rolled back "${result.project}" from ${result.from} to ${result.to}`));
}
