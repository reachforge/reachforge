import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import type { ReachforgeConfig } from '../types/index.js';
import { validateScheduleDate } from '../utils/path.js';
import { InvalidDateError } from '../types/index.js';
import { jsonSuccess } from '../core/json-output.js';
import { validateArticleName } from '../core/filename-parser.js';
import { draftCommand } from './draft.js';
import { approveCommand } from './approve.js';
import { adaptCommand } from './adapt.js';
import { scheduleCommand } from './schedule.js';
import { publishCommand } from './publish.js';

/**
 * Derive a filesystem-safe slug from a free-text prompt.
 * Keeps ASCII alphanumeric words; for non-ASCII input (e.g. CJK)
 * falls back to a timestamp-based slug with a "go-" prefix.
 */
export function slugify(prompt: string): string {
  const ascii = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();

  if (ascii.length > 0) {
    return ascii.split(/\s+/).slice(0, 5).join('-');
  }

  // Non-ASCII fallback: hash first 20 chars into a short hex string
  let hash = 0;
  const src = prompt.slice(0, 20);
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
  }
  return `go-${(hash >>> 0).toString(36)}`;
}

export interface GoOptions {
  name?: string;
  schedule?: string;
  dryRun?: boolean;
  draft?: boolean;
  json?: boolean;
  config?: ReachforgeConfig;
}

const STEPS = [
  'Creating inbox item',
  'Generating AI draft',
  'Approving draft',
  'Adapting for platforms',
  'Scheduling',
  'Publishing',
] as const;

export async function goCommand(
  engine: PipelineEngine,
  prompt: string,
  options: GoOptions = {},
): Promise<void> {
  let slug = options.name ?? slugify(prompt);
  validateArticleName(slug);

  const scheduleDate = options.schedule || new Date().toISOString().split('T')[0];

  if (options.schedule && !validateScheduleDate(options.schedule)) {
    throw new InvalidDateError(options.schedule);
  }

  await engine.initPipeline();

  // Resolve slug collision: append -2, -3, etc. if article already exists
  if (!options.name) {
    const existing = await engine.metadata.readArticleMeta(slug);
    if (existing) {
      let suffix = 2;
      while (await engine.metadata.readArticleMeta(`${slug}-${suffix}`)) {
        suffix++;
      }
      slug = `${slug}-${suffix}`;
    }
  }

  const log = (msg: string) => { if (!options.json) console.log(msg); };
  let currentStep = 0;

  const step = (i: number) => {
    currentStep = i;
    log(chalk.dim(`  [${i + 1}/6] ${STEPS[i]}...`));
  };

  log(chalk.bold(`\n  reach go: "${prompt}"\n`));

  try {
    // Step 1: Create inbox item as flat .md file
    step(0);
    await engine.writeArticleFile('01_inbox', slug, prompt);

    // Step 2: Draft
    step(1);
    await draftCommand(engine, slug);

    // Step 3: Approve
    step(2);
    await approveCommand(engine, slug);

    // Step 4: Adapt
    step(3);
    await adaptCommand(engine, slug);

    // Step 5: Schedule
    step(4);
    await scheduleCommand(engine, slug, scheduleDate);

    // Step 6: Publish (only if no --schedule flag, i.e. immediate mode)
    step(5);
    if (!options.schedule) {
      await publishCommand(engine, {
        dryRun: options.dryRun,
        draft: options.draft,
        config: options.config,
      });
    } else {
      log(chalk.dim(`    Skipped — scheduled for ${scheduleDate}, will publish when due.`));
    }
  } catch (err) {
    const stepName = STEPS[currentStep];
    log(chalk.red(`\n  Failed at step ${currentStep + 1}/6: ${stepName}`));
    log(chalk.yellow(`  Article "${slug}" is partially created. Resume manually from this stage.`));
    throw err;
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('go', {
      slug,
      prompt,
      scheduleDate,
      published: !options.schedule,
    }));
    return;
  }

  log('');
  if (options.schedule) {
    log(chalk.green(`  Done! "${slug}" scheduled for ${scheduleDate}. Run \`reach publish\` when due.`));
  } else {
    log(chalk.green(`  Done! "${slug}" published.`));
  }
}
