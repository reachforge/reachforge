import * as path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import type { ReachforgeConfig } from '../types/index.js';
import { ReachforgeError } from '../types/index.js';
import { ProviderLoader } from '../providers/loader.js';
import { validateContent } from '../validators/runner.js';
import { markdownToHtml } from '../utils/markdown.js';
import { AssetManager } from '../core/asset-manager.js';
import { MediaManager } from '../utils/media.js';
import { jsonSuccess } from '../core/json-output.js';
import { parseArticleFilename, buildArticleFilename } from '../core/filename-parser.js';
import { readProjectConfig } from '../core/project-config.js';
import type { PlatformPublishStatus } from '../types/schemas.js';

export interface PublishOptions {
  article?: string;
  platforms?: string;
  track?: boolean;
  dryRun?: boolean;
  draft?: boolean;
  json?: boolean;
  config?: ReachforgeConfig;
}

function getCredentialsForPlatform(platform: string, config: ReachforgeConfig): Record<string, string> {
  const creds: Record<string, string> = {};
  if (platform === 'devto' && config.devtoApiKey) {
    creds['api_key'] = config.devtoApiKey;
  } else if (platform === 'hashnode' && config.hashnodeApiKey) {
    creds['api_key'] = config.hashnodeApiKey;
  } else if (platform === 'github') {
    if (config.githubToken) creds['token'] = config.githubToken;
    if (config.githubOwner) creds['github_owner'] = config.githubOwner;
    if (config.githubRepo) creds['github_repo'] = config.githubRepo;
  }
  return creds;
}

export function parsePlatformFilter(platforms?: string): string[] | null {
  if (!platforms) return null;
  return platforms.split(',').map(p => p.trim()).filter(Boolean);
}

/**
 * Detect whether the article argument is an external file path or a pipeline article name.
 * External file: contains a directory separator (absolute or relative path).
 * Plain names like "my-article" are always treated as pipeline article names.
 */
export function isExternalFile(article: string): boolean {
  return path.isAbsolute(article) || article.includes('/') || article.includes('\\');
}

/**
 * Publish content from a single platform map through providers.
 * Shared core logic used by all three publish modes.
 *
 * Supports resume: pass `existingStatuses` to skip already-succeeded platforms.
 */
async function publishContentToPlatforms(
  contentByPlatform: Record<string, string>,
  articleLabel: string,
  projectDir: string | null,
  options: PublishOptions,
  jsonPublished: Array<{ article: string; platform: string; status: 'success'; url?: string }>,
  jsonFailed: Array<{ article: string; platform: string; status: 'failed'; error?: string }>,
  existingStatuses?: Record<string, PlatformPublishStatus>,
): Promise<Record<string, { status: 'pending' | 'success' | 'failed'; url?: string; error?: string; published_at?: string }>> {
  const config = options.config || {};
  const loader = new ProviderLoader(config);

  // Resolve @assets/ references (only when inside a project)
  const mediaManager = projectDir ? new MediaManager(projectDir) : null;
  if (projectDir) {
    const assetManager = new AssetManager(projectDir);
    for (const platform of Object.keys(contentByPlatform)) {
      contentByPlatform[platform] = assetManager.resolveAssetReferences(contentByPlatform[platform]);
    }
  }

  // Initialize platform statuses, preserving already-succeeded for resume
  const platformResults: Record<string, { status: 'pending' | 'success' | 'failed'; url?: string; error?: string; published_at?: string }> = {};
  for (const platform of Object.keys(contentByPlatform)) {
    const existing = existingStatuses?.[platform];
    platformResults[platform] = existing?.status === 'success'
      ? { ...existing }
      : { status: 'pending' };
  }

  let uploadCache = null;
  for (const [platform, content] of Object.entries(contentByPlatform)) {
    // Skip already-succeeded platforms (resume scenario)
    if (platformResults[platform].status === 'success') {
      if (!options.json) console.log(chalk.dim(`  \u23e9 ${platform}: already published, skipping`));
      continue;
    }

    const provider = loader.getProviderOrMock(platform);

    if (!options.json) {
      if (provider.id === 'mock') {
        console.log(chalk.yellow(`  \u26a0 [MOCK] ${platform} \u2014 no API key configured, using mock provider`));
      } else {
        console.log(chalk.dim(`  \ud83d\udce4 Publishing ${platform} via ${provider.name}...`));
      }
    }

    // Process media (only when inside a project with asset support)
    let publishContent = content;
    if (mediaManager && projectDir) {
      const credentials = getCredentialsForPlatform(platform, config);
      try {
        const mediaResult = await mediaManager.processMedia(
          publishContent, projectDir, platform, credentials, uploadCache,
        );
        publishContent = mediaResult.processedContent;
        uploadCache = mediaResult.updatedCache;
      } catch (mediaErr: unknown) {
        const msg = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
        if (!options.json) console.warn(chalk.yellow(`  \u26a0 Media processing warning for ${platform}: ${msg}`));
      }
    }

    // Convert format
    const formatted = provider.contentFormat === 'html'
      ? markdownToHtml(publishContent)
      : provider.formatContent(publishContent);

    try {
      const publishMeta = options.draft !== undefined ? { draft: options.draft } : {};
      const result = await provider.publish(formatted, publishMeta);

      if (result.status === 'success') {
        platformResults[platform] = { status: 'success', url: result.url, published_at: new Date().toISOString() };
        jsonPublished.push({ article: articleLabel, platform, status: 'success', url: result.url });
        if (!options.json) console.log(chalk.green(`  \u2714 ${platform}: ${result.url}`));
      } else {
        platformResults[platform] = { status: 'failed', error: result.error };
        jsonFailed.push({ article: articleLabel, platform, status: 'failed', error: result.error });
        if (!options.json) console.log(chalk.red(`  \u2718 ${platform}: ${result.error}`));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      platformResults[platform] = { status: 'failed', error: message };
      jsonFailed.push({ article: articleLabel, platform, status: 'failed', error: message });
      if (!options.json) console.log(chalk.red(`  \u2718 ${platform}: ${message}`));
    }
  }

  return platformResults;
}

/**
 * Publish an external file directly to specified platforms.
 * By default, sends without pipeline tracking (no engine required).
 * With --track, copies to 06_sent and records in meta.yaml (requires engine/project).
 */
async function publishExternalFile(
  engine: PipelineEngine | null,
  filePath: string,
  options: PublishOptions,
): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  if (!await fs.pathExists(resolvedPath)) {
    throw new ReachforgeError(
      `File not found: ${resolvedPath}`,
      'Provide a valid file path',
    );
  }

  // Platform resolution: CLI --platforms > project.yaml platforms (if in project) > error
  let platformFilter = parsePlatformFilter(options.platforms);
  if (!platformFilter || platformFilter.length === 0) {
    const projectDir = engine?.projectDir;
    const projConfig = projectDir ? await readProjectConfig(projectDir) : null;
    if (projConfig?.platforms && projConfig.platforms.length > 0) {
      platformFilter = projConfig.platforms;
      if (!options.json) {
        console.log(chalk.dim(`  Platforms auto-detected from project.yaml: ${platformFilter.join(', ')}`));
      }
    } else {
      throw new ReachforgeError(
        'No platforms specified',
        'Use --platforms devto,hashnode' + (projectDir ? ' or set platforms in project.yaml' : ''),
      );
    }
  }

  if (options.track && !engine) {
    throw new ReachforgeError(
      '--track requires a project context',
      'Run from inside a project directory, or omit --track',
    );
  }

  const content = await fs.readFile(resolvedPath, 'utf-8');
  const basename = path.basename(resolvedPath, '.md');

  const jsonPublished: Array<{ article: string; platform: string; status: 'success'; url?: string }> = [];
  const jsonFailed: Array<{ article: string; platform: string; status: 'failed'; error?: string }> = [];

  if (!options.json) {
    console.log(chalk.cyan(`\ud83d\udcc4 Publishing external file: ${resolvedPath}`));
    console.log(chalk.dim(`  Platforms: ${platformFilter.join(', ')}${options.track ? ' (tracked)' : ''}`));
  }

  // Build content map: same content for all platforms
  const contentByPlatform: Record<string, string> = {};
  for (const platform of platformFilter) {
    contentByPlatform[platform] = content;
  }

  // Validate
  const validation = validateContent(contentByPlatform);
  if (!validation.allValid) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [basename] }));
      return;
    }
    console.log(chalk.red(`  \u274c Validation failed:`));
    for (const [platform, result] of Object.entries(validation.results)) {
      if (!result.valid) {
        result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
      }
    }
    return;
  }

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [basename] }));
      return;
    }
    console.log(chalk.yellow(`\ud83d\udd0d [DRY RUN] Would publish "${basename}" to: ${platformFilter.join(', ')}`));
    return;
  }

  const platformResults = await publishContentToPlatforms(
    contentByPlatform, basename, engine?.projectDir ?? null, options, jsonPublished, jsonFailed,
  );

  const anySuccess = Object.values(platformResults).some(p => p.status === 'success');

  // Track in pipeline only when --track is set (requires engine)
  if (options.track && engine && anySuccess) {
    await engine.initPipeline();

    // Copy platform files to 06_sent
    for (const platform of platformFilter) {
      const sentFilename = buildArticleFilename(basename, platform);
      const sentPath = path.join(engine.projectDir, '06_sent', sentFilename);
      await fs.writeFile(sentPath, content);
    }

    // Record in meta.yaml
    await engine.metadata.writeArticleMeta(basename, {
      status: 'published',
      platforms: platformResults as Record<string, PlatformPublishStatus>,
    });

    if (!options.json) console.log(chalk.green(`\u2705 Published and tracked: ${basename}`));
  } else if (anySuccess) {
    if (!options.json) console.log(chalk.green(`\u2705 Published: ${basename}`));
  } else {
    if (!options.json) console.log(chalk.red(`\u274c All platforms failed for "${basename}"`));
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('publish', {
      published: jsonPublished,
      failed: jsonFailed,
      skipped: [],
    }));
  }
}

/**
 * Publish a specific pipeline article from 05_scheduled, with optional platform filter.
 */
async function publishPipelineArticle(
  engine: PipelineEngine,
  articleName: string,
  options: PublishOptions,
): Promise<void> {
  await engine.initPipeline();

  const jsonPublished: Array<{ article: string; platform: string; status: 'success'; url?: string }> = [];
  const jsonFailed: Array<{ article: string; platform: string; status: 'failed'; error?: string }> = [];

  const platformFilter = parsePlatformFilter(options.platforms);

  // Check article exists in 05_scheduled
  const articles = await engine.listArticles('05_scheduled');
  if (!articles.includes(articleName)) {
    throw new ReachforgeError(
      `Article "${articleName}" not found in 05_scheduled`,
      'Article must be in the scheduled stage. Use: reach status to check.',
    );
  }

  if (!options.json) console.log(chalk.cyan(`\ud83d\udce6 Publishing: ${articleName}`));

  // Check lock
  if (await engine.metadata.isArticleLocked(articleName)) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [articleName] }));
      return;
    }
    console.log(chalk.yellow(`  \u23ed "${articleName}" is already being published. Skipping.`));
    return;
  }

  // Get platform files
  const files = await engine.getArticleFiles(articleName, '05_scheduled');
  if (files.length === 0) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [articleName] }));
      return;
    }
    console.log(chalk.yellow(`  \u23ed No platform files for "${articleName}", skipping`));
    return;
  }

  // Read content per platform, applying filter
  const contentByPlatform: Record<string, string> = {};
  for (const file of files) {
    const parsed = parseArticleFilename(file, '05_scheduled');
    if (parsed.platform) {
      if (platformFilter && !platformFilter.includes(parsed.platform)) continue;
      contentByPlatform[parsed.platform] = await fs.readFile(
        engine.getArticlePath('05_scheduled', articleName, parsed.platform), 'utf-8'
      );
    }
  }

  if (Object.keys(contentByPlatform).length === 0) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [articleName] }));
      return;
    }
    const msg = platformFilter
      ? `No matching platform files for "${articleName}" (filter: ${platformFilter.join(', ')})`
      : `No platform versions for "${articleName}"`;
    console.log(chalk.yellow(`  \u23ed ${msg}, skipping`));
    return;
  }

  // Validate
  const validation = validateContent(contentByPlatform);
  if (!validation.allValid) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [articleName] }));
      return;
    }
    console.log(chalk.red(`  \u274c Validation failed for "${articleName}":`));
    for (const [platform, result] of Object.entries(validation.results)) {
      if (!result.valid) {
        result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
      }
    }
    console.log(chalk.yellow(`  \u23ed Skipping "${articleName}" \u2014 fix validation errors and retry`));
    return;
  }

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [articleName] }));
      return;
    }
    console.log(chalk.yellow(`\ud83d\udd0d [DRY RUN] Would publish "${articleName}" to: ${Object.keys(contentByPlatform).join(', ')}`));
    return;
  }

  // Acquire lock
  const locked = await engine.metadata.lockArticle(articleName);
  if (!locked) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [articleName] }));
      return;
    }
    console.log(chalk.yellow(`  \u23ed "${articleName}" is already being published. Skipping.`));
    return;
  }

  try {
    // Read existing meta for resume support
    const articleMeta = await engine.metadata.readArticleMeta(articleName);
    const platformResults = await publishContentToPlatforms(
      contentByPlatform, articleName, engine.projectDir, options, jsonPublished, jsonFailed,
      articleMeta?.platforms,
    );

    // Merge with existing platform statuses for resume (keep already-succeeded platforms)
    if (articleMeta?.platforms) {
      for (const [p, status] of Object.entries(articleMeta.platforms)) {
        if (status.status === 'success' && !(p in platformResults)) {
          platformResults[p] = { ...status };
        }
      }
    }

    const anySuccess = Object.values(platformResults).some(p => p.status === 'success');
    const finalStatus = anySuccess ? 'published' : 'failed';

    await engine.metadata.writeArticleMeta(articleName, {
      status: finalStatus,
      platforms: platformResults as Record<string, PlatformPublishStatus>,
    });

    await engine.metadata.unlockArticle(articleName);

    // Only move to 06_sent if ALL adapted platforms are done (not partial publish)
    // When a platform filter is used, check if all platforms are now complete
    const allFiles = await engine.getArticleFiles(articleName, '05_scheduled');
    const allPlatforms = allFiles
      .map(f => parseArticleFilename(f, '05_scheduled').platform)
      .filter(Boolean) as string[];
    const allPlatformsDone = allPlatforms.every(p => {
      const r = platformResults[p];
      return r && r.status === 'success';
    });

    if (allPlatformsDone) {
      await engine.moveArticle(articleName, '05_scheduled', '06_sent');
      if (!options.json) console.log(chalk.green(`\u2705 Published and archived: ${articleName}`));
    } else if (anySuccess) {
      if (!options.json) {
        const done = Object.entries(platformResults).filter(([, r]) => r.status === 'success').map(([p]) => p);
        const remaining = allPlatforms.filter(p => !done.includes(p));
        console.log(chalk.green(`\u2705 Partial publish: ${articleName}`));
        console.log(chalk.dim(`  Remaining: ${remaining.join(', ')}`));
      }
    } else {
      if (!options.json) console.log(chalk.red(`\u274c All platforms failed for "${articleName}" \u2014 remains in 05_scheduled`));
    }
  } catch (err) {
    await engine.metadata.unlockArticle(articleName);
    throw err;
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('publish', {
      published: jsonPublished,
      failed: jsonFailed,
      skipped: [],
    }));
  }
}

/**
 * Read content per platform from scheduled files, applying optional platform filter.
 */
async function readScheduledContent(
  engine: PipelineEngine,
  article: string,
  platformFilter: string[] | null,
): Promise<Record<string, string>> {
  const files = await engine.getArticleFiles(article, '05_scheduled');
  const contentByPlatform: Record<string, string> = {};

  for (const file of files) {
    const parsed = parseArticleFilename(file, '05_scheduled');
    if (parsed.platform) {
      if (platformFilter && !platformFilter.includes(parsed.platform)) continue;
      contentByPlatform[parsed.platform] = await fs.readFile(
        engine.getArticlePath('05_scheduled', article, parsed.platform), 'utf-8'
      );
    }
  }

  return contentByPlatform;
}

/**
 * Publish all due articles from 05_scheduled (original batch behavior),
 * with optional --platforms filter.
 */
async function publishAllDue(
  engine: PipelineEngine,
  options: PublishOptions,
): Promise<void> {
  await engine.initPipeline();
  const dueArticles = await engine.findDueArticles();

  const jsonPublished: Array<{ article: string; platform: string; status: 'success'; url?: string }> = [];
  const jsonFailed: Array<{ article: string; platform: string; status: 'failed'; error?: string }> = [];
  const jsonSkipped: string[] = [];

  if (dueArticles.length === 0) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [] }));
      return;
    }
    console.log(chalk.gray('\ud83d\udced No content due for publishing today.'));
    return;
  }

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: dueArticles }));
      return;
    }
    console.log(chalk.yellow(`\ud83d\udd0d [DRY RUN] Would publish ${dueArticles.length} article(s):`));
    dueArticles.forEach(a => console.log(chalk.yellow(`  - ${a}`)));
    return;
  }

  const platformFilter = parsePlatformFilter(options.platforms);

  for (const article of dueArticles) {
    // 1. Check if locked
    if (await engine.metadata.isArticleLocked(article)) {
      jsonSkipped.push(article);
      if (!options.json) console.log(chalk.yellow(`  \u23ed "${article}" is already being published. Skipping.`));
      continue;
    }

    // 2. Read content per platform, applying filter
    const contentByPlatform = await readScheduledContent(engine, article, platformFilter);

    if (Object.keys(contentByPlatform).length === 0) {
      jsonSkipped.push(article);
      if (!options.json) console.log(chalk.yellow(`  \u23ed No platform versions for "${article}", skipping`));
      continue;
    }

    // 3. Validate content
    const validation = validateContent(contentByPlatform);
    if (!validation.allValid) {
      jsonSkipped.push(article);
      if (!options.json) {
        console.log(chalk.red(`  \u274c Validation failed for "${article}":`));
        for (const [platform, result] of Object.entries(validation.results)) {
          if (!result.valid) {
            result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
          }
        }
        console.log(chalk.yellow(`  \u23ed Skipping "${article}" \u2014 fix validation errors and retry`));
      }
      continue;
    }

    // 4. Acquire lock
    const locked = await engine.metadata.lockArticle(article);
    if (!locked) {
      jsonSkipped.push(article);
      if (!options.json) console.log(chalk.yellow(`  \u23ed "${article}" is already being published. Skipping.`));
      continue;
    }

    try {
      // 5. Read existing meta for resume support
      const articleMeta = await engine.metadata.readArticleMeta(article);

      // 6. Publish via shared helper (handles assets, media, format, resume)
      const platformResults = await publishContentToPlatforms(
        contentByPlatform, article, engine.projectDir, options, jsonPublished, jsonFailed,
        articleMeta?.platforms,
      );

      // 7. Batch-write all platform results to meta.yaml
      const anySuccess = Object.values(platformResults).some(p => p.status === 'success');
      const finalStatus = anySuccess ? 'published' : 'failed';

      await engine.metadata.writeArticleMeta(article, {
        status: finalStatus,
        platforms: platformResults as Record<string, PlatformPublishStatus>,
      });

      // 8. Release lock
      await engine.metadata.unlockArticle(article);

      // 9. Move to sent if at least one platform succeeded
      if (anySuccess) {
        await engine.moveArticle(article, '05_scheduled', '06_sent');
        if (!options.json) console.log(chalk.green(`\u2705 Published and archived: ${article}`));
      } else {
        if (!options.json) console.log(chalk.red(`\u274c All platforms failed for "${article}" \u2014 remains in 05_scheduled`));
      }
    } catch (err) {
      await engine.metadata.unlockArticle(article);
      throw err;
    }
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('publish', {
      published: jsonPublished,
      failed: jsonFailed,
      skipped: jsonSkipped,
    }));
  }
}

/**
 * Main publish entry point.
 *
 * Three modes:
 *   1. `reach publish` — publish all due articles in 05_scheduled
 *   2. `reach publish <article> [--platforms x,devto]` — publish a specific pipeline article
 *   3. `reach publish ./path/to/file.md --platforms devto [--track]` — publish an external file
 *
 * External file mode: engine is optional (null when no project context).
 * Default: send only. Use --track to record in pipeline (requires project).
 */
export async function publishCommand(
  engine: PipelineEngine | null,
  options: PublishOptions = {},
): Promise<void> {
  const { article } = options;

  if (!article) {
    if (!engine) {
      throw new ReachforgeError(
        'No project context for batch publish',
        'Specify an article or file: reach publish <article> or reach publish ./file.md --platforms devto',
      );
    }
    return publishAllDue(engine, options);
  }

  if (isExternalFile(article)) {
    return publishExternalFile(engine, article, options);
  }

  if (!engine) {
    throw new ReachforgeError(
      'No project context for pipeline publish',
      'Run from inside a project directory, or use a file path: reach publish ./file.md --platforms devto',
    );
  }
  return publishPipelineArticle(engine, article, options);
}
