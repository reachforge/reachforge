import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import { jsonSuccess } from '../core/json-output.js';
import { sanitizePath, validateScheduleDate, normalizeScheduleDate } from '../utils/path.js';
import { InvalidDateError, ReachforgeError } from '../types/index.js';

export async function scheduleCommand(
  engine: PipelineEngine,
  article: string,
  date: string,
  options: { clear?: boolean; dryRun?: boolean; json?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);

  await engine.initPipeline();

  // --clear: unschedule (metadata-only, no filesystem check needed)
  if (options.clear) {
    if (options.dryRun) {
      if (options.json) {
        process.stdout.write(jsonSuccess('schedule', { article: safeName, cleared: true }));
        return;
      }
      console.log(chalk.yellow(`[DRY RUN] Would unschedule: "${safeName}"`));
      return;
    }

    await engine.metadata.writeArticleMeta(safeName, {
      status: 'adapted',
      schedule: undefined,
    });

    if (options.json) {
      process.stdout.write(jsonSuccess('schedule', { article: safeName, cleared: true }));
      return;
    }
    console.log(chalk.magenta(`📅 Unscheduled: "${safeName}" (status reverted to adapted)`));
    return;
  }

  // Verify article exists in 02_adapted (only for scheduling, not --clear)
  const articles = await engine.listArticles('02_adapted');
  if (!articles.includes(safeName)) {
    throw new ReachforgeError(
      `Article "${safeName}" not found in 02_adapted`,
      'Article must be adapted before scheduling. Use: reach adapt <article>',
    );
  }

  if (!validateScheduleDate(date)) {
    throw new InvalidDateError(date);
  }

  const normalizedDate = normalizeScheduleDate(date);

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('schedule', {
        article: safeName,
        date: normalizedDate,
        stage: '02_adapted' as const,
      }));
      return;
    }
    console.log(chalk.yellow(`[DRY RUN] Would schedule: "${safeName}" for ${normalizedDate}`));
    return;
  }

  // Metadata-only: no file move, just set schedule and status
  await engine.metadata.writeArticleMeta(safeName, {
    status: 'scheduled',
    schedule: normalizedDate,
  });

  if (options.json) {
    process.stdout.write(jsonSuccess('schedule', {
      article: safeName,
      date: normalizedDate,
      stage: '02_adapted' as const,
    }));
    return;
  }

  console.log(chalk.magenta(`📅 Scheduled: "${safeName}" for ${normalizedDate}`));
}
