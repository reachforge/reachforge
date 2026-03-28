import * as path from 'path';
import chalk from 'chalk';
import type { PipelineEngine } from '../core/pipeline.js';
import type { ReachforgeConfig } from '../types/index.js';
import { validateScheduleDate } from '../utils/path.js';
import { InvalidDateError } from '../types/index.js';
import { jsonSuccess } from '../core/json-output.js';
import { validateArticleName } from '../core/filename-parser.js';
import { draftCommand } from './draft.js';
import { adaptCommand } from './adapt.js';
import { scheduleCommand } from './schedule.js';
import { publishCommand } from './publish.js';

/**
 * Derive a filesystem-safe slug from a free-text prompt.
 * Keeps ASCII alphanumeric words; for non-ASCII input (e.g. CJK)
 * falls back to a timestamp-based slug with a "go-" prefix.
 */
export function slugify(prompt: string): string {
  // If input looks like a file path, derive slug from filename
  if (/^[.~\/\\]|^[a-zA-Z]:[\/\\]/.test(prompt) || /\.(md|mdx|txt|html?)$/i.test(prompt)) {
    const basename = path.basename(prompt, path.extname(prompt));
    const cleaned = basename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (cleaned.length > 0) return cleaned;
  }

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
  cover?: string;
  json?: boolean;
  config?: ReachforgeConfig;
}

const STEPS = [
  'Generating AI draft',
  'Adapting for platforms',
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
  const originalSlug = slug;
  const existing = await engine.metadata.readArticleMeta(slug);
  if (existing) {
    let suffix = 2;
    while (await engine.metadata.readArticleMeta(`${slug}-${suffix}`)) {
      suffix++;
    }
    slug = `${slug}-${suffix}`;
    if (!options.json) {
      console.log(chalk.yellow(`  \u26a0 "${originalSlug}" already exists, using "${slug}" instead`));
    }
  }

  const log = (msg: string) => { if (!options.json) console.log(msg); };
  let currentStep = 0;

  const step = (i: number) => {
    currentStep = i;
    log(chalk.dim(`  [${i + 1}/3] ${STEPS[i]}...`));
  };

  log(chalk.bold(`\n  reach go: "${prompt}"\n`));

  try {
    // Step 1: Draft (accepts prompt directly)
    step(0);
    await draftCommand(engine, prompt, { name: slug, cover: options.cover });

    // Step 2: Adapt
    step(1);
    await adaptCommand(engine, slug, { config: options.config });

    // Step 3: Schedule or Publish
    step(2);
    if (options.schedule) {
      await scheduleCommand(engine, slug, scheduleDate);
      log(chalk.dim(`    Scheduled for ${scheduleDate}, will publish when due.`));
    } else {
      await publishCommand(engine, {
        article: slug,
        dryRun: options.dryRun,
        draft: options.draft,
        cover: options.cover,
        config: options.config,
      });
    }
  } catch (err) {
    const stepName = STEPS[currentStep];
    log(chalk.red(`\n  Failed at step ${currentStep + 1}/3: ${stepName}`));
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
