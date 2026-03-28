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
import type { PlatformPublishStatus, ArticleMeta } from '../types/schemas.js';

export interface PublishOptions {
  article?: string;
  platforms?: string;
  track?: boolean;
  force?: boolean;
  dryRun?: boolean;
  draft?: boolean;
  cover?: string;
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
 * External file: contains a directory separator, or ends with a known document extension.
 * Plain names like "my-article" or dotted names like "v2.0-release" are pipeline article names.
 */
const EXTERNAL_FILE_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.html', '.htm']);

export function isExternalFile(article: string): boolean {
  return path.isAbsolute(article) || article.includes('/') || article.includes('\\')
    || EXTERNAL_FILE_EXTENSIONS.has(path.extname(article).toLowerCase());
}

/**
 * Extract the title from markdown content (first H1 heading).
 */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

/**
 * Check whether content already has a YAML frontmatter block.
 */
function hasFrontmatter(content: string): boolean {
  return /^---\n[\s\S]*?\n---/.test(content);
}

export interface FrontmatterResult {
  content: string;
  injected: boolean;
  fields?: Record<string, string>;
}

/**
 * Per-platform frontmatter injectors.
 * Each returns the frontmatter fields to inject, or null if none needed.
 */
const FRONTMATTER_INJECTORS: Record<string, (content: string, options: PublishOptions) => Record<string, string> | null> = {
  devto: (content, options) => ({
    title: `"${extractTitle(content).replace(/"/g, '\\"')}"`,
    published: options.draft ? 'false' : 'true',
  }),
  hashnode: (content) => ({
    title: `"${extractTitle(content).replace(/"/g, '\\"')}"`,
  }),
};

/**
 * Ensure content has the required frontmatter for a given platform.
 * For external files that lack frontmatter, auto-inject minimal required fields
 * extracted from the content itself.
 */
export function ensurePlatformFrontmatter(content: string, platform: string, options: PublishOptions = {}): FrontmatterResult {
  if (hasFrontmatter(content)) {
    return { content, injected: false };
  }

  const injector = FRONTMATTER_INJECTORS[platform];
  if (!injector) {
    return { content, injected: false };
  }

  const fields = injector(content, options);
  if (!fields) {
    return { content, injected: false };
  }

  const fmLines = ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '---', ''];
  return {
    content: fmLines.join('\n') + content,
    injected: true,
    fields,
  };
}

/**
 * Extract cover_image from frontmatter if present.
 */
export function extractCoverFromContent(content: string): string | null {
  const match = content.match(/^---\n[\s\S]*?cover_image:\s*(.+?)\s*(?:\n|$)/m);
  return match?.[1]?.replace(/^["']|["']$/g, '').trim() ?? null;
}

/**
 * Resolve cover image source with priority: --cover flag > frontmatter > meta.yaml.
 */
export function resolveCoverImage(
  options: PublishOptions,
  content: string,
  articleMeta: ArticleMeta | null | undefined,
): string | null {
  if (options.cover) return options.cover;
  const fromContent = extractCoverFromContent(content);
  if (fromContent) return fromContent;
  return articleMeta?.cover_image ?? null;
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
  coverImagePath?: string | null,
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

    // Upload cover image if provided
    let coverImageUrl: string | undefined;
    if (coverImagePath) {
      if (coverImagePath.startsWith('http://') || coverImagePath.startsWith('https://')) {
        coverImageUrl = coverImagePath;
      } else if (mediaManager) {
        const credentials = getCredentialsForPlatform(platform, config);
        try {
          const coverResult = await mediaManager.uploadCoverImage(
            coverImagePath, platform, credentials, uploadCache,
          );
          if (coverResult) {
            coverImageUrl = coverResult.cdnUrl;
            uploadCache = coverResult.updatedCache;
          }
        } catch (coverErr: unknown) {
          const msg = coverErr instanceof Error ? coverErr.message : String(coverErr);
          if (!options.json) console.warn(chalk.yellow(`  \u26a0 Cover image upload warning for ${platform}: ${msg}`));
        }
      } else {
        if (!options.json) console.warn(chalk.yellow(`  \u26a0 Cannot upload local cover image without project context`));
      }
    }

    // Convert format
    const formatted = provider.contentFormat === 'html'
      ? markdownToHtml(publishContent)
      : provider.formatContent(publishContent);

    try {
      const publishMeta = {
        ...(options.draft !== undefined ? { draft: options.draft } : {}),
        ...(coverImageUrl ? { coverImage: coverImageUrl } : {}),
      };
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
 * Print a consolidated publish summary with URLs and errors.
 */
function printPublishSummary(
  platformResults: Record<string, { status: string; url?: string; error?: string }>,
  articleLabel: string,
  json: boolean,
): void {
  if (json) return;

  const succeeded = Object.entries(platformResults).filter(([, r]) => r.status === 'success');
  const failed = Object.entries(platformResults).filter(([, r]) => r.status === 'failed');

  if (succeeded.length === 0 && failed.length === 0) return;

  console.log('');
  if (succeeded.length > 0) {
    console.log(chalk.green(`  \u2705 "${articleLabel}" published to ${succeeded.length} platform(s):`));
    for (const [platform, r] of succeeded) {
      console.log(chalk.dim(`     ${platform}: `) + (r.url ?? ''));
    }
  }
  if (failed.length > 0) {
    console.log(chalk.red(`  \u274c ${failed.length} platform(s) failed:`));
    for (const [platform, r] of failed) {
      console.log(chalk.red(`     ${platform}: ${r.error ?? 'unknown error'}`));
    }
  }
}

/**
 * Publish an external file directly to specified platforms.
 * By default, sends without pipeline tracking (no engine required).
 * With --track, copies to 03_published and records in meta.yaml (requires engine/project).
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
      'Provide a valid file path (include the file extension, e.g. reach publish article.md)',
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

  // Build content map: inject platform-specific frontmatter when missing
  const contentByPlatform: Record<string, string> = {};
  for (const platform of platformFilter) {
    const result = ensurePlatformFrontmatter(content, platform, options);
    contentByPlatform[platform] = result.content;
  }

  // Validate
  const validation = validateContent(contentByPlatform);
  if (!validation.allValid) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [basename] }));
      return;
    }
    console.log(chalk.red(`  ❌ Validation failed:`));
    for (const [platform, result] of Object.entries(validation.results)) {
      if (!result.valid) {
        result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
      }
    }
    console.log(chalk.yellow(`\n  💡 For full platform adaptation, use the pipeline: reach draft → reach adapt → reach publish`));
    return;
  }

  // --track: import into pipeline first, then publish through normal pipeline flow
  if (options.track && engine) {
    await engine.initPipeline();

    // Write platform files to 02_adapted/{slug}.{platform}.md
    for (const [platform, platformContent] of Object.entries(contentByPlatform)) {
      await engine.writeArticleFile('02_adapted', basename, platformContent, platform);
    }

    // Record in meta.yaml as adapted (include cover if provided)
    const trackCover = resolveCoverImage(options, content, null);
    await engine.metadata.writeArticleMeta(basename, {
      status: 'adapted',
      adapted_platforms: platformFilter,
      ...(trackCover ? { cover_image: trackCover } : {}),
    });

    if (!options.json) console.log(chalk.dim(`  Imported to pipeline: 02_adapted/${basename}.*.md`));

    // Delegate to normal pipeline publish (handles lock, validate, publish, move to 03_published)
    return publishPipelineArticle(engine, basename, options);
  }

  // Resolve cover image: --cover flag > frontmatter cover_image
  const coverImagePath = resolveCoverImage(options, content, null);

  // Direct send (no pipeline tracking)
  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [basename] }));
      return;
    }
    console.log(chalk.yellow(`\ud83d\udd0d [DRY RUN] Would publish "${basename}" to: ${platformFilter.join(', ')}`));
    return;
  }

  const platformResults = await publishContentToPlatforms(
    contentByPlatform, basename, engine?.projectDir ?? path.dirname(resolvedPath), options, jsonPublished, jsonFailed,
    undefined, coverImagePath,
  );

  printPublishSummary(platformResults, basename, !!options.json);

  if (options.json) {
    process.stdout.write(jsonSuccess('publish', {
      published: jsonPublished,
      failed: jsonFailed,
      skipped: [],
    }));
  }
}

/**
 * Publish a specific pipeline article from 02_adapted, with optional platform filter.
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

  // Check article exists in 02_adapted
  const articles = await engine.listArticles('02_adapted');
  if (!articles.includes(articleName)) {
    throw new ReachforgeError(
      `Article "${articleName}" not found in 02_adapted`,
      'Article must be in the adapted stage. Use: reach status to check.',
    );
  }

  // Guard: if article is scheduled for the future, warn and abort unless --force
  const articleMeta = await engine.metadata.readArticleMeta(articleName);
  if (articleMeta?.status === 'scheduled' && articleMeta.schedule && !options.force) {
    const now = new Date().toISOString();
    if (articleMeta.schedule > now) {
      const msg = `Article "${articleName}" is scheduled for ${articleMeta.schedule} (future). Use --force to publish now.`;
      if (options.json) {
        process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: [articleName], warning: msg }));
        return;
      }
      console.log(chalk.yellow(`  ⚠ ${msg}`));
      return;
    }
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

  // Read content per platform, applying filter
  const contentByPlatform = await readAdaptedContent(engine, articleName, platformFilter);

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
    // Read existing meta for resume support and cover image
    const articleMeta = await engine.metadata.readArticleMeta(articleName);
    const sampleContent = Object.values(contentByPlatform)[0] ?? '';
    const coverImagePath = resolveCoverImage(options, sampleContent, articleMeta);

    const platformResults = await publishContentToPlatforms(
      contentByPlatform, articleName, engine.projectDir, options, jsonPublished, jsonFailed,
      articleMeta?.platforms, coverImagePath,
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

    // Only move to 03_published if ALL adapted platforms are done (not partial publish)
    // When a platform filter is used, check if all platforms are now complete
    const allFiles = await engine.getArticleFiles(articleName, '02_adapted');
    const allPlatforms = allFiles
      .map(f => parseArticleFilename(f, '02_adapted').platform)
      .filter(Boolean) as string[];
    const allPlatformsDone = allPlatforms.every(p => {
      const r = platformResults[p];
      return r && r.status === 'success';
    });

    if (allPlatformsDone) {
      await engine.moveArticle(articleName, '02_adapted', '03_published');
    }

    printPublishSummary(platformResults, articleName, !!options.json);
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
 * Read content per platform from adapted files, applying optional platform filter.
 */
async function readAdaptedContent(
  engine: PipelineEngine,
  article: string,
  platformFilter: string[] | null,
): Promise<Record<string, string>> {
  const files = await engine.getArticleFiles(article, '02_adapted');
  const contentByPlatform: Record<string, string> = {};

  for (const file of files) {
    const parsed = parseArticleFilename(file, '02_adapted');
    if (parsed.platform) {
      if (platformFilter && !platformFilter.includes(parsed.platform)) continue;
      contentByPlatform[parsed.platform] = await fs.readFile(
        engine.getArticlePath('02_adapted', article, parsed.platform), 'utf-8'
      );
    }
  }

  return contentByPlatform;
}

/**
 * Publish all due articles from 02_adapted (original batch behavior),
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
    const contentByPlatform = await readAdaptedContent(engine, article, platformFilter);

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
      // 5. Read existing meta for resume support and cover image
      const articleMeta = await engine.metadata.readArticleMeta(article);
      const sampleContent = Object.values(contentByPlatform)[0] ?? '';
      const coverImagePath = resolveCoverImage(options, sampleContent, articleMeta);

      // 6. Publish via shared helper (handles assets, media, format, resume)
      const platformResults = await publishContentToPlatforms(
        contentByPlatform, article, engine.projectDir, options, jsonPublished, jsonFailed,
        articleMeta?.platforms, coverImagePath,
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

      // 9. Move to 03_published only if ALL platforms succeeded
      const allFiles = await engine.getArticleFiles(article, '02_adapted');
      const allPlatforms = allFiles
        .map(f => parseArticleFilename(f, '02_adapted').platform)
        .filter(Boolean) as string[];
      const allPlatformsDone = allPlatforms.every(p => {
        const r = platformResults[p];
        return r && r.status === 'success';
      });

      if (allPlatformsDone) {
        await engine.moveArticle(article, '02_adapted', '03_published');
      }

      printPublishSummary(platformResults, article, !!options.json);
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
 *   1. `reach publish` — publish all due articles in 02_adapted
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
      `"${article}" is not a recognized file. Did you mean: reach publish ${article}.md?`,
      'For external files, include the extension: reach publish ./file.md --platforms devto',
    );
  }
  return publishPipelineArticle(engine, article, options);
}
