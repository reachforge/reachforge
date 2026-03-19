import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import type { Receipt, ReachforgeConfig } from '../types/index.js';
import { ProviderLoader } from '../providers/loader.js';
import { validateContent } from '../validators/runner.js';
import { PLATFORM_VERSIONS_DIR } from '../core/constants.js';
import { markdownToHtml } from '../utils/markdown.js';

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

  const loader = new ProviderLoader(options.config || {});

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

    // Validate content before publishing
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

      // 5. Publish each platform, updating receipt after each
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

        // Convert content format if provider requires HTML (source is always Markdown)
        const formatted = provider.contentFormat === 'html'
          ? markdownToHtml(content)
          : provider.formatContent(content);

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

      // 6. Determine final receipt status
      const anySuccess = receipt.items.some(r => r.status === 'success');
      const allSuccess = receipt.items.every(r => r.status === 'success');
      receipt.status = allSuccess ? 'completed' : 'partial';
      await engine.metadata.writeReceipt('05_scheduled', item, receipt);

      // 7. Release lock before move (prevents lock file leaking into 06_sent via fs.copy)
      await engine.metadata.unlockProject('05_scheduled', item);

      // 8. Move to sent if at least one platform succeeded
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
