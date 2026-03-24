import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import type { ReachforgeConfig } from '../types/index.js';
import { ProviderLoader } from '../providers/loader.js';
import { validateContent } from '../validators/runner.js';
import { markdownToHtml } from '../utils/markdown.js';
import { AssetManager } from '../core/asset-manager.js';
import { MediaManager } from '../utils/media.js';
import { jsonSuccess } from '../core/json-output.js';
import { parseArticleFilename } from '../core/filename-parser.js';
import type { PlatformPublishStatus } from '../types/schemas.js';

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

export async function publishCommand(
  engine: PipelineEngine,
  options: { dryRun?: boolean; draft?: boolean; json?: boolean; config?: ReachforgeConfig } = {},
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
    console.log(chalk.gray('📭 No content due for publishing today.'));
    return;
  }

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('publish', { published: [], failed: [], skipped: dueArticles }));
      return;
    }
    console.log(chalk.yellow(`🔍 [DRY RUN] Would publish ${dueArticles.length} article(s):`));
    dueArticles.forEach(a => console.log(chalk.yellow(`  - ${a}`)));
    return;
  }

  const config = options.config || {};
  const loader = new ProviderLoader(config);
  const assetManager = new AssetManager(engine.projectDir);
  const mediaManager = new MediaManager(engine.projectDir);

  for (const article of dueArticles) {
    // 1. Check if locked
    if (await engine.metadata.isArticleLocked(article)) {
      jsonSkipped.push(article);
      if (!options.json) console.log(chalk.yellow(`  ⏭ "${article}" is already being published. Skipping.`));
      continue;
    }

    // 2. Get platform files for this article
    const files = await engine.getArticleFiles(article, '05_scheduled');
    if (files.length === 0) {
      jsonSkipped.push(article);
      if (!options.json) console.log(chalk.yellow(`  ⏭ No platform files for "${article}", skipping`));
      continue;
    }

    // 3. Read content per platform
    const contentByPlatform: Record<string, string> = {};
    for (const file of files) {
      const parsed = parseArticleFilename(file, '05_scheduled');
      if (parsed.platform) {
        contentByPlatform[parsed.platform] = await fs.readFile(
          engine.getArticlePath('05_scheduled', article, parsed.platform), 'utf-8'
        );
      }
    }

    if (Object.keys(contentByPlatform).length === 0) {
      jsonSkipped.push(article);
      if (!options.json) console.log(chalk.yellow(`  ⏭ No platform versions for "${article}", skipping`));
      continue;
    }

    // 4. Validate content
    const validation = validateContent(contentByPlatform);
    if (!validation.allValid) {
      jsonSkipped.push(article);
      if (!options.json) {
        console.log(chalk.red(`  ❌ Validation failed for "${article}":`));
        for (const [platform, result] of Object.entries(validation.results)) {
          if (!result.valid) {
            result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
          }
        }
        console.log(chalk.yellow(`  ⏭ Skipping "${article}" — fix validation errors and retry`));
      }
      continue;
    }

    // 5. Acquire lock
    const locked = await engine.metadata.lockArticle(article);
    if (!locked) {
      jsonSkipped.push(article);
      if (!options.json) console.log(chalk.yellow(`  ⏭ "${article}" is already being published. Skipping.`));
      continue;
    }

    try {
      // 6. Resolve @assets/ references
      for (const platform of Object.keys(contentByPlatform)) {
        contentByPlatform[platform] = assetManager.resolveAssetReferences(contentByPlatform[platform]);
      }

      // 7. Read article meta once for this article (avoid N+1 reads)
      const articleMeta = await engine.metadata.readArticleMeta(article);

      // 8. Initialize platform statuses and track results locally
      const platformResults: Record<string, { status: 'pending' | 'success' | 'failed'; url?: string; error?: string; published_at?: string }> = {};
      const platforms = Object.keys(contentByPlatform);

      for (const platform of platforms) {
        const existing = articleMeta?.platforms?.[platform];
        platformResults[platform] = existing?.status === 'success'
          ? { ...existing }
          : { status: 'pending' };
      }

      // 9. Publish each platform
      let uploadCache = null;
      for (const [platform, content] of Object.entries(contentByPlatform)) {
        // Skip already-succeeded platforms (resume scenario)
        if (platformResults[platform].status === 'success') {
          if (!options.json) console.log(chalk.dim(`  ⏩ ${platform}: already published, skipping`));
          continue;
        }

        const provider = loader.getProviderOrMock(platform);

        if (!options.json) {
          if (provider.id === 'mock') {
            console.log(chalk.yellow(`  ⚠ [MOCK] ${platform} — no API key configured, using mock provider`));
          } else {
            console.log(chalk.dim(`  📤 Publishing ${platform} via ${provider.name}...`));
          }
        }

        // Process media
        let publishContent = content;
        const credentials = getCredentialsForPlatform(platform, config);
        try {
          const mediaResult = await mediaManager.processMedia(
            publishContent, engine.projectDir, platform, credentials, uploadCache,
          );
          publishContent = mediaResult.processedContent;
          uploadCache = mediaResult.updatedCache;
        } catch (mediaErr: unknown) {
          const msg = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
          if (!options.json) console.warn(chalk.yellow(`  ⚠ Media processing warning for ${platform}: ${msg}`));
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
            jsonPublished.push({ article, platform, status: 'success', url: result.url });
            if (!options.json) console.log(chalk.green(`  ✔ ${platform}: ${result.url}`));
          } else {
            platformResults[platform] = { status: 'failed', error: result.error };
            jsonFailed.push({ article, platform, status: 'failed', error: result.error });
            if (!options.json) console.log(chalk.red(`  ✘ ${platform}: ${result.error}`));
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          platformResults[platform] = { status: 'failed', error: message };
          jsonFailed.push({ article, platform, status: 'failed', error: message });
          if (!options.json) console.log(chalk.red(`  ✘ ${platform}: ${message}`));
        }
      }

      // 10. Batch-write all platform results to meta.yaml in one pass
      const anySuccess = Object.values(platformResults).some(p => p.status === 'success');
      const finalStatus = anySuccess ? 'published' : 'failed';

      await engine.metadata.writeArticleMeta(article, {
        status: finalStatus,
        platforms: platformResults as Record<string, PlatformPublishStatus>,
      });

      // 11. Release lock
      await engine.metadata.unlockArticle(article);

      // 12. Move to sent if at least one platform succeeded
      if (anySuccess) {
        await engine.moveArticle(article, '05_scheduled', '06_sent');
        if (!options.json) console.log(chalk.green(`✅ Published and archived: ${article}`));
      } else {
        if (!options.json) console.log(chalk.red(`❌ All platforms failed for "${article}" — remains in 05_scheduled`));
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
