import chalk from 'chalk';
import fs from 'fs-extra';
import type { PipelineEngine } from '../core/pipeline.js';
import type { Receipt, ReceiptEntry, AphypeConfig } from '../types/index.js';
import { ProviderLoader } from '../providers/loader.js';
import { validateContent } from '../validators/runner.js';
import { PLATFORM_VERSIONS_DIR } from '../core/constants.js';

export async function publishCommand(
  engine: PipelineEngine,
  options: { dryRun?: boolean; config?: AphypeConfig } = {},
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

    // Publish to each platform via provider
    const results: ReceiptEntry[] = [];
    for (const [platform, content] of Object.entries(contentByPlatform)) {
      const provider = loader.getProviderOrMock(platform);

      if (provider.id === 'mock') {
        console.log(chalk.yellow(`  ⚠ [MOCK] ${platform} — no API key configured, using mock provider`));
      } else {
        console.log(chalk.dim(`  📤 Publishing ${platform} via ${provider.name}...`));
      }

      try {
        const result = await provider.publish(content, {});
        results.push({
          platform,
          status: result.status,
          url: result.url,
          error: result.error,
        });

        if (result.status === 'success') {
          console.log(chalk.green(`  ✔ ${platform}: ${result.url}`));
        } else {
          console.log(chalk.red(`  ✘ ${platform}: ${result.error}`));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ platform, status: 'failed', error: message });
        console.log(chalk.red(`  ✘ ${platform}: ${message}`));
      }
    }

    const receipt: Receipt = {
      published_at: new Date().toISOString(),
      items: results,
    };

    await engine.metadata.writeReceipt('05_scheduled', item, receipt);

    // Move to sent if at least one platform succeeded
    const anySuccess = results.some(r => r.status === 'success');
    if (anySuccess) {
      await engine.moveProject(item, '05_scheduled', '06_sent');
      console.log(chalk.green(`✅ Published and archived: ${item}`));
    } else {
      console.log(chalk.red(`❌ All platforms failed for "${item}" — remains in 05_scheduled`));
    }
  }
}
