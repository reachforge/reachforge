import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { sanitizePath, validateDate } from '../utils/path.js';
import { InvalidDateError } from '../types/index.js';

export async function scheduleCommand(
  engine: PipelineEngine,
  article: string,
  date: string,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);

  if (!validateDate(date)) {
    throw new InvalidDateError(date);
  }

  await engine.initPipeline();
  const targetName = `${date}-${safeName}`;

  if (options.dryRun) {
    console.log(chalk.yellow(`🔍 [DRY RUN] Would schedule: "${safeName}" → 05_scheduled/${targetName}`));
    return;
  }

  const result = await engine.moveProject(safeName, '04_adapted', '05_scheduled', targetName);
  console.log(chalk.magenta(`📅 Scheduled: "${safeName}" moved to 05_scheduled as "${result.project}"`));
}
