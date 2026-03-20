import chalk from 'chalk';
import { AssetManager } from '../core/asset-manager.js';
import { ASSET_SUBDIRS } from '../core/constants.js';
import type { AssetSubdir } from '../types/index.js';

function parseSubdir(value?: string): AssetSubdir | undefined {
  if (!value) return undefined;
  if (!(ASSET_SUBDIRS as readonly string[]).includes(value)) {
    throw new Error(`Invalid subdir "${value}". Must be one of: ${ASSET_SUBDIRS.join(', ')}`);
  }
  return value as AssetSubdir;
}

export async function assetAddCommand(
  projectDir: string,
  filePath: string,
  options: { subdir?: string } = {},
): Promise<void> {
  const mgr = new AssetManager(projectDir);
  await mgr.initAssets();

  const subdir = parseSubdir(options.subdir);
  const entry = await mgr.register(filePath, subdir);
  const ref = mgr.getAssetRef(entry.subdir, entry.filename);

  console.log(chalk.green(`✅ Registered: ${entry.filename} → ${entry.subdir}/`));
  console.log(chalk.dim(`   Reference in markdown: ${ref}`));
  console.log(chalk.dim(`   MIME: ${entry.mime}  Size: ${entry.size_bytes} bytes`));
}

export async function assetListCommand(
  projectDir: string,
  options: { subdir?: string } = {},
): Promise<void> {
  const mgr = new AssetManager(projectDir);
  const subdir = parseSubdir(options.subdir);
  const assets = await mgr.listAssets(subdir);

  if (assets.length === 0) {
    console.log(chalk.gray('No assets registered.'));
    return;
  }

  console.log(chalk.cyan(`Assets (${assets.length}):\n`));
  for (const a of assets) {
    const ref = `@assets/${a.subdir}/${a.filename}`;
    const sourceTag = a.source === 'ai' ? chalk.magenta(' [AI]') : '';
    console.log(`  ${chalk.white(ref)}${sourceTag}`);
    console.log(chalk.dim(`    ${a.mime}  ${a.size_bytes} bytes  ${a.created_at}`));
  }
}
