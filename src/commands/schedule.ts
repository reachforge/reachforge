import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import { sanitizePath, validateScheduleDate, normalizeScheduleDate } from '../utils/path.js';
import { InvalidDateError } from '../types/index.js';

export async function scheduleCommand(
  engine: PipelineEngine,
  article: string,
  date: string,
  options: { dryRun?: boolean; json?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);

  if (!validateScheduleDate(date)) {
    throw new InvalidDateError(date);
  }

  await engine.initPipeline();
  const dirDate = normalizeScheduleDate(date);
  const targetName = `${dirDate}-${safeName}`;

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('schedule', {
        article: safeName,
        date: dirDate,
        scheduledName: targetName,
        stage: '05_scheduled' as const,
      }));
      return;
    }
    console.log(chalk.yellow(`[DRY RUN] Would schedule: "${safeName}" → 05_scheduled/${targetName}`));
    return;
  }

  const result = await engine.moveProject(safeName, '04_adapted', '05_scheduled', targetName);

  if (options.json) {
    process.stdout.write(jsonSuccess('schedule', {
      article: safeName,
      date: dirDate,
      scheduledName: targetName,
      stage: '05_scheduled' as const,
    }));
    return;
  }

  console.log(chalk.magenta(`Scheduled: "${safeName}" moved to 05_scheduled as "${result.project}"`));
}
