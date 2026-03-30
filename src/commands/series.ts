import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import type { ReachforgeConfig } from '../types/index.js';
import { ReachforgeError } from '../types/index.js';
import { SeriesManager } from '../core/series-manager.js';
import { AdapterFactory } from '../llm/factory.js';
import { jsonSuccess } from '../core/json-output.js';
import { draftCommand } from './draft.js';
import { adaptCommand } from './adapt.js';
import { scheduleCommand } from './schedule.js';

// ── Init ──────────────────────────────────────────────

export async function seriesInitCommand(
  projectDir: string,
  topic: string,
  options: { json?: boolean } = {},
): Promise<void> {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  const manager = new SeriesManager(projectDir);

  // Check if series already exists
  try {
    await manager.readSeries(slug);
    throw new ReachforgeError(
      `Series "${slug}" already exists`,
      `Edit series/${slug}.yaml directly, or choose a different topic`,
    );
  } catch (err) {
    if (err instanceof ReachforgeError && err.message.includes('already exists')) throw err;
    // Not found — good, proceed
  }

  const series = await manager.scaffoldSeries(slug, topic);

  if (options.json) {
    process.stdout.write(jsonSuccess('series.init', { name: slug, file: `series/${slug}.yaml` }));
    return;
  }

  console.log(chalk.green(`  ✅ Series created: series/${slug}.yaml`));
  console.log(chalk.dim(`  Next: edit the file, then run: reach series outline ${slug}`));
}

// ── Outline ───────────────────────────────────────────

export async function seriesOutlineCommand(
  engine: PipelineEngine,
  name: string,
  options: { json?: boolean } = {},
): Promise<void> {
  const manager = new SeriesManager(engine.projectDir);
  const series = await manager.readSeries(name);

  if (series.status !== 'planned') {
    throw new ReachforgeError(
      `Cannot generate outline — series "${name}" status is "${series.status}", expected "planned"`,
      series.status === 'outlined'
        ? `Outline already generated. Review it, then run: reach series approve ${name} --outline`
        : `Series has already passed the outline stage`,
    );
  }

  if (!options.json) console.log(chalk.cyan(`  Generating outline for series "${series.title}"...`));

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('draft', { projectDir });
  const skills = await resolver.resolve('draft');

  const prompt = [
    `You are planning a multi-article technical series.`,
    ``,
    `Series title: "${series.title}"`,
    series.description ? `Description: ${series.description}` : '',
    series.audience ? `Target audience: ${series.audience}` : '',
    series.tone ? `Tone: ${series.tone}` : '',
    ``,
    `Generate:`,
    `1. A master outline (2-3 paragraphs) summarizing what this series covers and what readers will learn.`,
    `2. A list of 4-6 articles with title and synopsis (1-2 sentences each).`,
    ``,
    `Format your response EXACTLY as:`,
    `OUTLINE:`,
    `[master outline text]`,
    ``,
    `ARTICLES:`,
    `1. [Title] | [Synopsis]`,
    `2. [Title] | [Synopsis]`,
    `...`,
  ].filter(Boolean).join('\n');

  const result = await adapter.execute({
    prompt,
    cwd: projectDir,
    skillPaths: skills.map(s => s.path),
    sessionId: null,
    timeoutSec: 300,
    extraArgs: [],
  });

  if (!result.success || !result.content) {
    throw new Error(result.errorMessage || 'Outline generation failed');
  }

  // Parse AI output
  const content = result.content;
  const outlineMatch = content.match(/OUTLINE:\s*([\s\S]*?)(?=ARTICLES:|$)/i);
  const articlesMatch = content.match(/ARTICLES:\s*([\s\S]*?)$/i);

  if (outlineMatch) {
    series.outline = outlineMatch[1].trim();
  }

  if (articlesMatch) {
    const lines = articlesMatch[1].trim().split('\n').filter(l => l.trim());
    series.articles = lines.map((line, i) => {
      const cleaned = line.replace(/^\d+\.\s*/, '');
      const [title, synopsis] = cleaned.split('|').map(s => s.trim());
      return {
        slug: (title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50),
        title: title || 'Untitled',
        synopsis: synopsis || '',
        order: i + 1,
      };
    });
  }

  if (!series.outline || series.articles.length === 0) {
    throw new ReachforgeError(
      'Failed to parse AI-generated outline',
      'The AI output did not match the expected format. Try running `reach series outline ' + name + '` again.',
    );
  }

  series.status = 'outlined';
  await manager.writeSeries(name, series);

  if (options.json) {
    process.stdout.write(jsonSuccess('series.outline', { name, articles: series.articles.length }));
    return;
  }

  console.log(chalk.green(`  ✅ Outline generated: ${series.articles.length} articles`));
  console.log(chalk.dim(`  Review series/${name}.yaml, then run: reach series approve ${name} --outline`));
}

// ── Approve ───────────────────────────────────────────

export async function seriesApproveCommand(
  engine: PipelineEngine,
  name: string,
  options: { outline?: boolean; detail?: boolean; json?: boolean } = {},
): Promise<void> {
  const manager = new SeriesManager(engine.projectDir);

  if (options.outline) {
    const series = await manager.transitionStatus(name, 'outline_approved');
    series.outline_approved_at = new Date().toISOString();
    await manager.writeSeries(name, series);

    if (options.json) {
      process.stdout.write(jsonSuccess('series.approve', { name, stage: 'outline' }));
      return;
    }
    console.log(chalk.green(`  ✅ Outline approved for "${name}"`));
    console.log(chalk.dim(`  Next: reach series detail ${name}`));
  } else if (options.detail) {
    const series = await manager.transitionStatus(name, 'detail_approved');
    series.detail_approved_at = new Date().toISOString();
    await manager.writeSeries(name, series);

    if (options.json) {
      process.stdout.write(jsonSuccess('series.approve', { name, stage: 'detail' }));
      return;
    }
    console.log(chalk.green(`  ✅ Detail outlines approved for "${name}"`));
    console.log(chalk.dim(`  Next: reach series draft ${name}`));
  } else {
    throw new ReachforgeError(
      'Specify what to approve: --outline or --detail',
      `reach series approve ${name} --outline  OR  reach series approve ${name} --detail`,
    );
  }
}

// ── Detail ────────────────────────────────────────────

export async function seriesDetailCommand(
  engine: PipelineEngine,
  name: string,
  options: { json?: boolean } = {},
): Promise<void> {
  const manager = new SeriesManager(engine.projectDir);
  const series = await manager.readSeries(name);

  if (series.status !== 'outline_approved') {
    throw new ReachforgeError(
      `Cannot generate detail outlines — series "${name}" status is "${series.status}", expected "outline_approved"`,
      series.status === 'outlined'
        ? `Approve the outline first: reach series approve ${name} --outline`
        : `Series is not in the correct state for this operation`,
    );
  }

  if (!options.json) console.log(chalk.cyan(`  Generating detailed outlines for ${series.articles.length} articles...`));

  const projectDir = engine.projectDir;
  const { adapter, resolver } = AdapterFactory.create('draft', { projectDir });
  const skills = await resolver.resolve('draft');

  const failed: string[] = [];

  for (const article of series.articles) {
    if (!options.json) console.log(chalk.dim(`  ${article.order}. ${article.title}...`));

    const prompt = [
      `You are creating a detailed outline for one article in a series.`,
      ``,
      `Series: "${series.title}"`,
      `Master outline: ${series.outline}`,
      ``,
      `Article ${article.order} of ${series.articles.length}: "${article.title}"`,
      `Synopsis: ${article.synopsis}`,
      ``,
      `Other articles in the series:`,
      ...series.articles
        .filter(a => a.slug !== article.slug)
        .map(a => `- ${a.order}. ${a.title}: ${a.synopsis}`),
      ``,
      `Generate a detailed outline with 4-8 bullet points for this article.`,
      `Each bullet should describe a section/topic to cover.`,
      `Format: one bullet per line, starting with "- "`,
    ].join('\n');

    const result = await adapter.execute({
      prompt,
      cwd: projectDir,
      skillPaths: skills.map(s => s.path),
      sessionId: null,
      timeoutSec: 300,
      extraArgs: [],
    });

    if (result.success && result.content) {
      article.outline = result.content.trim();
    } else {
      failed.push(article.slug);
      if (!options.json) console.log(chalk.red(`    ✘ Failed to generate outline for ${article.slug}`));
    }
  }

  if (failed.length > 0) {
    // Save partial progress but don't transition status
    await manager.writeSeries(name, series);
    throw new ReachforgeError(
      `${failed.length} article outline(s) failed: ${failed.join(', ')}`,
      `Fix the issue and run: reach series detail ${name}`,
    );
  }

  series.status = 'detailed';
  await manager.writeSeries(name, series);

  if (options.json) {
    process.stdout.write(jsonSuccess('series.detail', { name, articles: series.articles.length }));
    return;
  }

  console.log(chalk.green(`  ✅ Detail outlines generated for ${series.articles.length} articles`));
  console.log(chalk.dim(`  Review each article's outline in series/${name}.yaml`));
  console.log(chalk.dim(`  Then run: reach series approve ${name} --detail`));
}

// ── Draft ─────────────────────────────────────────────

export async function seriesDraftCommand(
  engine: PipelineEngine,
  name: string,
  options: { all?: boolean; json?: boolean } = {},
): Promise<void> {
  const manager = new SeriesManager(engine.projectDir);
  const series = await manager.readSeries(name);

  if (series.status !== 'detail_approved' && series.status !== 'drafting') {
    throw new ReachforgeError(
      `Cannot draft — series "${name}" status is "${series.status}", expected "detail_approved"`,
      series.status === 'detailed'
        ? `Approve detail outlines first: reach series approve ${name} --detail`
        : `Series is not ready for drafting`,
    );
  }

  await engine.initPipeline();

  // Find which articles are already drafted
  const draftedSlugs = new Set<string>();
  for (const article of series.articles) {
    const draftPath = engine.getArticlePath('01_drafts', article.slug);
    if (await fs.pathExists(draftPath)) {
      draftedSlugs.add(article.slug);
    }
  }

  const drafted: string[] = [];

  const draftOne = async (): Promise<boolean> => {
    const slug = manager.findNextUndraftedArticle(series, draftedSlugs);
    if (!slug) return false;

    const article = series.articles.find(a => a.slug === slug)!;
    if (!options.json) console.log(chalk.cyan(`  Drafting ${article.order}/${series.articles.length}: "${article.title}"...`));

    const context = await manager.assembleContext(series, slug, engine);
    await draftCommand(engine, context, { name: slug });

    draftedSlugs.add(slug);
    drafted.push(slug);
    return true;
  };

  if (options.all) {
    while (await draftOne()) { /* keep going */ }
  } else {
    const didDraft = await draftOne();
    if (!didDraft) {
      if (!options.json) console.log(chalk.gray('  All articles already drafted.'));
    }
  }

  // Update status
  const allDrafted = series.articles.every(a => draftedSlugs.has(a.slug));
  if (allDrafted) {
    series.status = 'completed';
  } else if (drafted.length > 0 && series.status === 'detail_approved') {
    series.status = 'drafting';
  }
  await manager.writeSeries(name, series);

  if (options.json) {
    process.stdout.write(jsonSuccess('series.draft', { name, drafted, remaining: series.articles.length - draftedSlugs.size }));
    return;
  }

  if (drafted.length > 0) {
    console.log(chalk.green(`  ✅ Drafted ${drafted.length} article(s): ${drafted.join(', ')}`));
    const remaining = series.articles.length - draftedSlugs.size;
    if (remaining > 0) {
      console.log(chalk.dim(`  ${remaining} remaining. Run again or use --all`));
    } else {
      console.log(chalk.dim(`  All articles drafted! Next: reach series adapt ${name}`));
    }
  }
}

// ── Adapt ─────────────────────────────────────────────

export async function seriesAdaptCommand(
  engine: PipelineEngine,
  name: string,
  options: { platforms?: string; json?: boolean; config?: ReachforgeConfig } = {},
): Promise<void> {
  const manager = new SeriesManager(engine.projectDir);
  const series = await manager.readSeries(name);

  await engine.initPipeline();

  const adapted: string[] = [];
  const skipped: string[] = [];

  for (const article of series.articles.sort((a, b) => a.order - b.order)) {
    const draftPath = engine.getArticlePath('01_drafts', article.slug);
    if (!await fs.pathExists(draftPath)) {
      skipped.push(article.slug);
      continue;
    }

    // Skip already-adapted articles only when no explicit platform list is given.
    // When platforms are specified, delegate to adaptCommand (which is additive) so
    // users can add new platforms to articles that were previously adapted.
    const meta = await engine.metadata.readArticleMeta(article.slug);
    if (!options.platforms && (meta?.status === 'adapted' || meta?.status === 'scheduled' || meta?.status === 'published')) {
      skipped.push(article.slug);
      continue;
    }

    if (!options.json) console.log(chalk.dim(`  Adapting: ${article.slug}...`));

    const platforms = options.platforms ?? series.platforms?.join(',');
    await adaptCommand(engine, article.slug, { platforms, config: options.config });
    adapted.push(article.slug);
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('series.adapt', { name, adapted, skipped }));
    return;
  }

  if (adapted.length > 0) {
    console.log(chalk.green(`  ✅ Adapted ${adapted.length} article(s)`));
  }
  if (skipped.length > 0) {
    console.log(chalk.dim(`  Skipped ${skipped.length}: ${skipped.join(', ')}`));
  }
  if (adapted.length > 0) {
    console.log(chalk.dim(`  Next: reach series schedule ${name}`));
  }
}

// ── Schedule ──────────────────────────────────────────

export async function seriesScheduleCommand(
  engine: PipelineEngine,
  name: string,
  options: { dryRun?: boolean; json?: boolean } = {},
): Promise<void> {
  const manager = new SeriesManager(engine.projectDir);
  const series = await manager.readSeries(name);

  const dates = manager.calculateSchedule(series);
  const scheduled: Array<{ slug: string; date: string }> = [];
  const skipped: string[] = [];

  for (const article of series.articles.sort((a, b) => a.order - b.order)) {
    const meta = await engine.metadata.readArticleMeta(article.slug);

    // Skip published or already scheduled
    if (meta?.status === 'published' || meta?.status === 'scheduled') {
      skipped.push(article.slug);
      continue;
    }

    // Only schedule adapted articles
    if (meta?.status !== 'adapted') {
      skipped.push(article.slug);
      continue;
    }

    const date = dates.get(article.slug)!;

    if (!options.dryRun) {
      await scheduleCommand(engine, article.slug, date);
    }

    scheduled.push({ slug: article.slug, date });
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('series.schedule', { name, scheduled, skipped }));
    return;
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`  [DRY RUN] Would schedule ${scheduled.length} article(s):`));
  } else if (scheduled.length > 0) {
    console.log(chalk.green(`  ✅ Scheduled ${scheduled.length} article(s):`));
  }

  for (const { slug, date } of scheduled) {
    console.log(chalk.dim(`    ${slug}: ${date}`));
  }

  if (skipped.length > 0) {
    console.log(chalk.dim(`  Skipped ${skipped.length}: ${skipped.join(', ')}`));
  }
}

// ── Status ────────────────────────────────────────────

export async function seriesStatusCommand(
  engine: PipelineEngine,
  name: string,
  options: { json?: boolean } = {},
): Promise<void> {
  const manager = new SeriesManager(engine.projectDir);
  const series = await manager.readSeries(name);

  const articleStatuses: Array<{
    slug: string;
    title: string;
    order: number;
    pipelineStatus: string;
    schedule?: string;
    platforms?: string[];
  }> = [];

  for (const article of series.articles.sort((a, b) => a.order - b.order)) {
    const meta = await engine.metadata.readArticleMeta(article.slug);
    let pipelineStatus = 'planned';

    if (meta) {
      pipelineStatus = meta.status;
    } else {
      // Check if file exists in any stage
      const draftPath = engine.getArticlePath('01_drafts', article.slug);
      if (await fs.pathExists(draftPath)) {
        pipelineStatus = 'drafted';
      }
    }

    const platforms = meta?.platforms
      ? Object.entries(meta.platforms).filter(([, s]) => s.status === 'success').map(([p]) => p)
      : undefined;

    articleStatuses.push({
      slug: article.slug,
      title: article.title,
      order: article.order,
      pipelineStatus,
      schedule: meta?.schedule,
      platforms: platforms?.length ? platforms : undefined,
    });
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('series.status', {
      name: series.name,
      title: series.title,
      status: series.status,
      articles: articleStatuses,
    }));
    return;
  }

  console.log('');
  console.log(chalk.bold(`  Series: ${series.title} (${series.articles.length} articles)`));
  console.log(chalk.dim(`  Status: ${series.status}`));
  console.log('');

  const statusColors: Record<string, (s: string) => string> = {
    published: chalk.green,
    scheduled: chalk.blue,
    adapted: chalk.cyan,
    drafted: chalk.yellow,
    planned: chalk.gray,
    failed: chalk.red,
  };

  for (const a of articleStatuses) {
    const colorFn = statusColors[a.pipelineStatus] ?? chalk.white;
    const statusTag = colorFn(`[${a.pipelineStatus}]`);
    const extra = a.schedule ? `  ${a.schedule}` : '';
    const platStr = a.platforms ? `  ${a.platforms.join(',')}` : '';
    console.log(`  ${a.order}. ${statusTag}  ${a.slug}${extra}${platStr}`);
  }

  // Summary
  const counts: Record<string, number> = {};
  for (const a of articleStatuses) {
    counts[a.pipelineStatus] = (counts[a.pipelineStatus] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([s, c]) => `${c} ${s}`);
  console.log('');
  console.log(chalk.dim(`  Progress: ${parts.join(', ')}`));
}
