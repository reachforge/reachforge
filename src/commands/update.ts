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
import { parsePlatformFilter, resolveCoverImage, getCredentialsForPlatform } from './publish.js';
import type { PublishMeta } from '../providers/types.js';

export interface UpdateOptions {
  article: string;
  platforms?: string;
  dryRun?: boolean;
  force?: boolean;
  cover?: string;
  json?: boolean;
  config?: ReachforgeConfig;
}

async function readContentForUpdate(
  engine: PipelineEngine,
  article: string,
  platform: string,
): Promise<string | null> {
  // Priority 1: 02_adapted (user has edited post-publish)
  const adaptedPath = engine.getArticlePath('02_adapted', article, platform);
  if (await fs.pathExists(adaptedPath)) {
    return fs.readFile(adaptedPath, 'utf-8');
  }

  // Priority 2: 03_published (original published version)
  const publishedPath = engine.getArticlePath('03_published', article, platform);
  if (await fs.pathExists(publishedPath)) {
    return fs.readFile(publishedPath, 'utf-8');
  }

  return null;
}

export async function updateCommand(
  engine: PipelineEngine,
  options: UpdateOptions,
): Promise<void> {
  const { article } = options;
  await engine.initPipeline();

  // Step 1: Resolve article metadata
  const articleMeta = await engine.metadata.readArticleMeta(article);
  if (!articleMeta) {
    throw new ReachforgeError(
      `Article "${article}" not found in meta.yaml`,
      'Check the article name with: reach status',
    );
  }

  if (articleMeta.status !== 'published') {
    throw new ReachforgeError(
      `Article "${article}" has not been published yet (status: ${articleMeta.status})`,
      `Publish first with: reach publish ${article}`,
    );
  }

  // Step 2: Determine updatable platforms
  const allPlatforms = articleMeta.platforms ?? {};
  const platformFilter = parsePlatformFilter(options.platforms);

  const updatable: Array<{ platform: string; articleId: string }> = [];
  const missingId: string[] = [];

  for (const [platform, status] of Object.entries(allPlatforms)) {
    if (platformFilter && !platformFilter.includes(platform)) continue;
    if (status.status !== 'success') continue;

    if (!status.article_id) {
      missingId.push(platform);
      continue;
    }

    updatable.push({ platform, articleId: status.article_id });
  }

  if (missingId.length > 0 && !options.force) {
    throw new ReachforgeError(
      `${missingId.length} platform(s) lack article_id: ${missingId.join(', ')}`,
      'These were published before ID capture was added. Use --force to skip them, or manually add article_id to meta.yaml.',
    );
  }

  if (updatable.length === 0) {
    throw new ReachforgeError(
      `No updatable platforms for "${article}"`,
      missingId.length > 0
        ? `${missingId.join(', ')} lack article_id. Use --force to skip.`
        : 'Article has no successfully published platforms with article_id',
    );
  }

  // Step 3: Read content
  const contentByPlatform: Record<string, string> = {};
  for (const { platform } of updatable) {
    const content = await readContentForUpdate(engine, article, platform);
    if (!content) {
      throw new ReachforgeError(
        `No content found for "${article}" on platform "${platform}"`,
        `Expected file: ${article}.${platform}.md in 02_adapted/ or 03_published/. Run 'reach adapt ${article}' first.`,
      );
    }
    contentByPlatform[platform] = content;
  }

  // Step 4: Validate
  const validation = validateContent(contentByPlatform);
  if (!validation.allValid) {
    if (options.json) {
      process.stdout.write(jsonSuccess('update', { updated: [], failed: [], skipped: [article] }));
      return;
    }
    console.log(chalk.red(`  Validation failed for "${article}":`));
    for (const [platform, result] of Object.entries(validation.results)) {
      if (!result.valid) {
        result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
      }
    }
    return;
  }

  // Step 5: Dry run
  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('update', { updated: [], failed: [], skipped: updatable.map(u => u.platform) }));
      return;
    }
    console.log(chalk.yellow(`[DRY RUN] Would update "${article}" on: ${updatable.map(u => u.platform).join(', ')}`));
    for (const { platform, articleId } of updatable) {
      console.log(chalk.dim(`  ${platform}: article_id=${articleId}`));
    }
    return;
  }

  // Step 6: Update each platform
  if (!options.json) console.log(chalk.cyan(`Updating: ${article}`));

  const config = options.config || {};
  const loader = new ProviderLoader(config);

  const jsonUpdated: Array<{ article: string; platform: string; status: 'success'; url?: string }> = [];
  const jsonFailed: Array<{ article: string; platform: string; status: 'failed'; error?: string }> = [];
  const jsonSkipped: string[] = [];

  const sampleContent = Object.values(contentByPlatform)[0] ?? '';
  const coverImagePath = resolveCoverImage(options, sampleContent, articleMeta);

  const projectDir = engine.projectDir;
  const assetManager = new AssetManager(projectDir);
  const mediaManager = new MediaManager(projectDir);
  let uploadCache = null;

  for (const { platform, articleId } of updatable) {
    const provider = loader.getProviderOrMock(platform);

    if (typeof provider.update !== 'function') {
      if (!options.json) console.log(chalk.yellow(`  Platform "${platform}" does not support updates. Skipping.`));
      jsonSkipped.push(platform);
      continue;
    }

    if (!options.json) {
      if (provider.id === 'mock') {
        console.log(chalk.yellow(`  [MOCK] ${platform} -- no API key, using mock provider`));
      } else {
        console.log(chalk.dim(`  Updating ${platform} via ${provider.name}...`));
      }
    }

    // Resolve @assets/ references and upload inline images
    let content = assetManager.resolveAssetReferences(contentByPlatform[platform]);
    const credentials = getCredentialsForPlatform(platform, config);
    try {
      const mediaResult = await mediaManager.processMedia(content, projectDir, platform, credentials, uploadCache);
      content = mediaResult.processedContent;
      uploadCache = mediaResult.updatedCache;
    } catch (mediaErr: unknown) {
      const msg = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
      if (!options.json) console.warn(chalk.yellow(`  ⚠ Media processing warning for ${platform}: ${msg}`));
    }

    // Upload cover image if provided
    let coverImageUrl: string | undefined;
    if (coverImagePath) {
      if (coverImagePath.startsWith('http://') || coverImagePath.startsWith('https://')) {
        coverImageUrl = coverImagePath;
      } else {
        try {
          const coverResult = await mediaManager.uploadCoverImage(coverImagePath, platform, credentials, uploadCache);
          if (coverResult) {
            coverImageUrl = coverResult.cdnUrl;
            uploadCache = coverResult.updatedCache;
          }
        } catch (coverErr: unknown) {
          const msg = coverErr instanceof Error ? coverErr.message : String(coverErr);
          if (!options.json) console.warn(chalk.yellow(`  ⚠ Cover image upload warning for ${platform}: ${msg}`));
        }
      }
    }

    const formatted = provider.contentFormat === 'html'
      ? markdownToHtml(content)
      : provider.formatContent(content);

    const publishMeta: PublishMeta = {
      ...(coverImageUrl ? { coverImage: coverImageUrl } : {}),
    };

    try {
      const result = await provider.update(articleId, formatted, publishMeta);

      if (result.status === 'success') {
        await engine.metadata.updatePlatformStatus(article, platform, {
          url: result.url,
          article_id: result.articleId ?? articleId,
          updated_at: new Date().toISOString(),
        });

        jsonUpdated.push({ article, platform, status: 'success', url: result.url });
        if (!options.json) console.log(chalk.green(`  ✔ ${platform}: ${result.url}`));
      } else {
        jsonFailed.push({ article, platform, status: 'failed', error: result.error });
        if (!options.json) console.log(chalk.red(`  ✘ ${platform}: ${result.error}`));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      jsonFailed.push({ article, platform, status: 'failed', error: message });
      if (!options.json) console.log(chalk.red(`  ✘ ${platform}: ${message}`));
    }
  }

  // Step 7: Summary
  if (missingId.length > 0 && options.force && !options.json) {
    console.log(chalk.yellow(`  Skipped (no article_id): ${missingId.join(', ')}`));
  }

  if (!options.json) {
    const succeeded = jsonUpdated.length;
    const failed = jsonFailed.length;
    if (succeeded > 0 || failed > 0) {
      console.log('');
      if (succeeded > 0) {
        console.log(chalk.green(`  ✅ "${article}" updated on ${succeeded} platform(s):`));
        for (const r of jsonUpdated) {
          console.log(chalk.dim(`     ${r.platform}: `) + (r.url ?? ''));
        }
      }
      if (failed > 0) {
        console.log(chalk.red(`  ❌ ${failed} platform(s) failed:`));
        for (const r of jsonFailed) {
          console.log(chalk.red(`     ${r.platform}: ${r.error ?? 'unknown error'}`));
        }
      }
    }
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('update', {
      updated: jsonUpdated,
      failed: jsonFailed,
      skipped: [...jsonSkipped, ...missingId],
    }));
  }
}
