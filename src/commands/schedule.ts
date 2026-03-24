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
  const normalizedDate = normalizeScheduleDate(date);

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('schedule', {
        article: safeName,
        date: normalizedDate,
        stage: '05_scheduled' as const,
      }));
      return;
    }
    console.log(chalk.yellow(`[DRY RUN] Would schedule: "${safeName}" → 05_scheduled/ (${normalizedDate})`));
    return;
  }

  // Move platform files from 04_adapted to 05_scheduled (same filenames)
  await engine.moveArticle(safeName, '04_adapted', '05_scheduled');

  // Store schedule in meta.yaml (not in directory name)
  await engine.metadata.writeArticleMeta(safeName, {
    status: 'scheduled',
    schedule: normalizedDate,
  });

  if (options.json) {
    process.stdout.write(jsonSuccess('schedule', {
      article: safeName,
      date: normalizedDate,
      stage: '05_scheduled' as const,
    }));
    return;
  }

  console.log(chalk.magenta(`📅 Scheduled: "${safeName}" for ${normalizedDate}`));
}
