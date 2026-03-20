import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import type { Receipt, ReachforgeConfig } from '../types/index.js';
import { ProviderLoader } from '../providers/loader.js';
import { validateContent } from '../validators/runner.js';
import { PLATFORM_VERSIONS_DIR } from '../core/constants.js';
import { markdownToHtml } from '../utils/markdown.js';
import { AssetManager } from '../core/asset-manager.js';
import { MediaManager } from '../utils/media.js';

// Map platform names to their credential keys in ReachforgeConfig
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
  options: { dryRun?: boolean; draft?: boolean; config?: ReachforgeConfig } = {},
): Promise<void> {
  await engine.initPipeline();
  const dueItems = await engine.findDueProjects();

  if (dueItems.length === 0) {
    console.log(chalk.gray('📭 No content due for publishing today.'));
    return;
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`🔍 [DRY RUN] Would publish ${dueItems.length} item(s):`));
    dueItems.forEach(item => console.log(chalk.yellow(`  - ${item}`)));
    return;
  }

  const config = options.config || {};
  const loader = new ProviderLoader(config);
  const assetManager = new AssetManager(engine.projectDir);
  const mediaManager = new MediaManager(engine.projectDir);

  for (const item of dueItems) {
    // 1. Check if already locked (another process is publishing this item)
    if (await engine.metadata.isLocked('05_scheduled', item)) {
      console.log(chalk.yellow(`  ⏭ "${item}" is already being published by another process. Skipping.`));
      continue;
    }

    // 2. Check for a crashed previous publish (receipt exists with status=publishing, but no lock)
    const existingReceipt = await engine.metadata.readReceipt('05_scheduled', item);
    if (existingReceipt && existingReceipt.status === 'publishing') {
      console.log(chalk.yellow(`  🔄 Resuming interrupted publish for "${item}"...`));
    }

    const itemPath = engine.getProjectPath('05_scheduled', item);
    const platformsDir = `${itemPath}/${PLATFORM_VERSIONS_DIR}`;
    const platformFiles = await fs.pathExists(platformsDir) ? await fs.readdir(platformsDir) : [];

    if (platformFiles.length === 0) {
      console.log(chalk.yellow(`  ⏭ No platform versions found for "${item}", skipping`));
      continue;
    }

    // Read all platform content for validation
    const contentByPlatform: Record<string, string> = {};
    for (const pFile of platformFiles) {
      const platform = pFile.replace('.md', '');
      contentByPlatform[platform] = await fs.readFile(`${platformsDir}/${pFile}`, 'utf-8');
    }

    // Validate content before resolving asset references
    // (resolved absolute paths are longer and would inflate character counts for X validation)
    const validation = validateContent(contentByPlatform);
    if (!validation.allValid) {
      console.log(chalk.red(`  ❌ Validation failed for "${item}":`));
      for (const [platform, result] of Object.entries(validation.results)) {
        if (!result.valid) {
          result.errors.forEach(err => console.log(chalk.red(`     ${platform}: ${err}`)));
        }
      }
      console.log(chalk.yellow(`  ⏭ Skipping "${item}" — fix validation errors and retry`));
      continue;
    }

    // 3. Acquire lock
    const locked = await engine.metadata.lockProject('05_scheduled', item);
    if (!locked) {
      console.log(chalk.yellow(`  ⏭ "${item}" is already being published by another process. Skipping.`));
      continue;
    }

    try {
      // 4. Initialize progressive receipt (or resume from existing)
      const platforms = Object.keys(contentByPlatform);
      let receipt: Receipt;

      if (existingReceipt && existingReceipt.status === 'publishing') {
        // Resume: keep already-succeeded entries, retry pending/sending/failed
        receipt = existingReceipt;
      } else {
        // Fresh start: all platforms pending
        receipt = {
          status: 'publishing',
          published_at: new Date().toISOString(),
          items: platforms.map(p => ({ platform: p, status: 'pending' as const })),
        };
      }

      await engine.metadata.writeReceipt('05_scheduled', item, receipt);

      // 5. Resolve @assets/ references to absolute paths (after validation, before publishing)
      for (const platform of Object.keys(contentByPlatform)) {
        contentByPlatform[platform] = assetManager.resolveAssetReferences(contentByPlatform[platform]);
      }

      // 6. Load upload cache for media processing (reuse across platforms)
      let uploadCache = await engine.metadata.readUploadCache('05_scheduled', item);

      // 7. Publish each platform, updating receipt after each
      for (const [platform, content] of Object.entries(contentByPlatform)) {
        const entry = receipt.items.find(e => e.platform === platform);
        if (!entry) continue;

        // Skip already-succeeded platforms (resume scenario)
        if (entry.status === 'success') {
          console.log(chalk.dim(`  ⏩ ${platform}: already published, skipping`));
          continue;
        }

        const provider = loader.getProviderOrMock(platform);

        if (provider.id === 'mock') {
          console.log(chalk.yellow(`  ⚠ [MOCK] ${platform} — no API key configured, using mock provider`));
        } else {
          console.log(chalk.dim(`  📤 Publishing ${platform} via ${provider.name}...`));
        }

        // Mark as sending
        entry.status = 'sending';
        await engine.metadata.writeReceipt('05_scheduled', item, receipt);

        // Process media: upload local images to platform CDN and replace paths with URLs
        let publishContent = content;
        const credentials = getCredentialsForPlatform(platform, config);
        try {
          const mediaResult = await mediaManager.processMedia(
            publishContent, itemPath, platform, credentials, uploadCache,
          );
          publishContent = mediaResult.processedContent;
          uploadCache = mediaResult.updatedCache;
          if (mediaResult.uploads.length > 0) {
            console.log(chalk.dim(`  📎 Uploaded ${mediaResult.uploads.length} media file(s) for ${platform}`));
            await engine.metadata.writeUploadCache('05_scheduled', item, uploadCache);
          }
        } catch (mediaErr: unknown) {
          const msg = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
          console.warn(chalk.yellow(`  ⚠ Media processing warning for ${platform}: ${msg}`));
          // Continue with unprocessed content — media errors are non-fatal
        }

        // Convert content format if provider requires HTML (source is always Markdown)
        const formatted = provider.contentFormat === 'html'
          ? markdownToHtml(publishContent)
          : provider.formatContent(publishContent);

        try {
          const publishMeta = options.draft !== undefined ? { draft: options.draft } : {};
          const result = await provider.publish(formatted, publishMeta);
          entry.status = result.status;
          entry.url = result.url;
          entry.error = result.error;

          if (result.status === 'success') {
            console.log(chalk.green(`  ✔ ${platform}: ${result.url}`));
          } else {
            console.log(chalk.red(`  ✘ ${platform}: ${result.error}`));
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          entry.status = 'failed';
          entry.error = message;
          console.log(chalk.red(`  ✘ ${platform}: ${message}`));
        }

        // Update receipt after each platform
        await engine.metadata.writeReceipt('05_scheduled', item, receipt);
      }

      // 8. Determine final receipt status
      const anySuccess = receipt.items.some(r => r.status === 'success');
      const allSuccess = receipt.items.every(r => r.status === 'success');
      receipt.status = allSuccess ? 'completed' : 'partial';
      await engine.metadata.writeReceipt('05_scheduled', item, receipt);

      // 9. Release lock before move (prevents lock file leaking into 06_sent via fs.copy)
      await engine.metadata.unlockProject('05_scheduled', item);

      // 10. Move to sent if at least one platform succeeded
      if (anySuccess) {
        await engine.moveProject(item, '05_scheduled', '06_sent');
        console.log(chalk.green(`✅ Published and archived: ${item}`));
      } else {
        console.log(chalk.red(`❌ All platforms failed for "${item}" — remains in 05_scheduled`));
      }
    } catch (err) {
      // Release lock on unexpected errors
      await engine.metadata.unlockProject('05_scheduled', item);
      throw err;
    }
  }
}
