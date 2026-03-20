import * as path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import type { AssetEntry, AssetRegistry, AssetSource, AssetSubdir } from '../types/index.js';
import { AssetRegistrySchema } from '../types/index.js';
import { ASSETS_DIR, ASSET_SUBDIRS, ASSET_REGISTRY_FILENAME, ASSET_PREFIX } from './constants.js';
import { guessMimeType } from '../utils/media.js';

const EXT_TO_SUBDIR: Record<string, AssetSubdir> = {
  '.png': 'images', '.jpg': 'images', '.jpeg': 'images',
  '.gif': 'images', '.webp': 'images', '.svg': 'images',
  '.mp4': 'videos', '.webm': 'videos', '.mov': 'videos',
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio',
};

export class AssetManager {
  public readonly assetsDir: string;
  private readonly registryPath: string;

  constructor(private readonly projectDir: string) {
    this.assetsDir = path.join(projectDir, ASSETS_DIR);
    this.registryPath = path.join(this.assetsDir, ASSET_REGISTRY_FILENAME);
  }

  async initAssets(): Promise<void> {
    for (const sub of ASSET_SUBDIRS) {
      await fs.ensureDir(path.join(this.assetsDir, sub));
    }
    if (!await fs.pathExists(this.registryPath)) {
      await this.writeRegistry({ assets: [] });
    }
  }

  async readRegistry(): Promise<AssetRegistry> {
    if (!await fs.pathExists(this.registryPath)) {
      return { assets: [] };
    }
    const raw = await fs.readFile(this.registryPath, 'utf-8');
    const parsed = yaml.load(raw);
    const result = AssetRegistrySchema.safeParse(parsed);
    if (!result.success) {
      return { assets: [] };
    }
    return result.data;
  }

  async writeRegistry(registry: AssetRegistry): Promise<void> {
    await fs.ensureDir(this.assetsDir);
    await fs.writeFile(this.registryPath, yaml.dump(registry, { lineWidth: -1 }));
  }

  inferSubdir(filePath: string): AssetSubdir | null {
    const ext = path.extname(filePath).toLowerCase();
    return EXT_TO_SUBDIR[ext] ?? null;
  }

  async register(
    filePath: string,
    subdir?: AssetSubdir,
    source: AssetSource = 'manual',
  ): Promise<AssetEntry> {
    const absSource = path.resolve(filePath);
    if (!await fs.pathExists(absSource)) {
      throw new Error(`File not found: ${absSource}`);
    }

    const resolvedSubdir = subdir ?? this.inferSubdir(absSource);
    if (!resolvedSubdir) {
      throw new Error(
        `Cannot determine asset type for "${path.basename(absSource)}". Use --subdir to specify (images, videos, audio).`,
      );
    }

    const filename = path.basename(absSource);
    const targetPath = path.join(this.assetsDir, resolvedSubdir, filename);

    await fs.ensureDir(path.join(this.assetsDir, resolvedSubdir));
    await fs.copy(absSource, targetPath);

    const stat = await fs.stat(targetPath);
    const entry: AssetEntry = {
      filename,
      subdir: resolvedSubdir,
      mime: guessMimeType(filename),
      size_bytes: stat.size,
      source,
      created_at: new Date().toISOString(),
    };

    const registry = await this.readRegistry();
    // Replace existing entry with same filename+subdir, or append
    const idx = registry.assets.findIndex(
      a => a.filename === filename && a.subdir === resolvedSubdir,
    );
    if (idx >= 0) {
      registry.assets[idx] = entry;
    } else {
      registry.assets.push(entry);
    }
    await this.writeRegistry(registry);

    return entry;
  }

  async listAssets(subdir?: AssetSubdir): Promise<AssetEntry[]> {
    const registry = await this.readRegistry();
    if (!subdir) return registry.assets;
    return registry.assets.filter(a => a.subdir === subdir);
  }

  resolveAssetReferences(content: string): string {
    const prefix = ASSET_PREFIX;
    const replacement = this.assetsDir + '/';
    return content.replace(
      new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\s)]+', 'g'),
      (match) => match.replace(prefix, replacement),
    );
  }

  getAssetPath(relativePath: string): string {
    return path.join(this.assetsDir, relativePath);
  }

  getAssetRef(subdir: AssetSubdir, filename: string): string {
    return `${ASSET_PREFIX}${subdir}/${filename}`;
  }
}
