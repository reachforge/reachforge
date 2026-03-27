import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { MetadataParseError, ReachforgeError } from '../types/index.js';
import { META_FILENAME } from './constants.js';
import { MultiArticleProjectMetaSchema } from '../types/schemas.js';
import type { ArticleMeta, MultiArticleProjectMeta, PlatformPublishStatus } from '../types/schemas.js';

export class MetadataManager {
  constructor(private readonly workingDir: string) {}

  private get metaPath(): string {
    return path.join(this.workingDir, META_FILENAME);
  }

  async readProjectMeta(): Promise<MultiArticleProjectMeta> {
    if (!await fs.pathExists(this.metaPath)) {
      return { articles: {} };
    }

    const raw = await fs.readFile(this.metaPath, 'utf-8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { articles: {} };
    }

    const result = MultiArticleProjectMetaSchema.safeParse(parsed);
    if (!result.success) {
      throw new MetadataParseError(this.metaPath, result.error.issues.map(i => i.message).join(', '));
    }
    return result.data;
  }

  async writeProjectMeta(meta: MultiArticleProjectMeta): Promise<void> {
    await fs.writeFile(this.metaPath, yaml.dump(meta, { lineWidth: -1 }));
  }

  async readArticleMeta(articleName: string): Promise<ArticleMeta | null> {
    const meta = await this.readProjectMeta();
    return meta.articles[articleName] ?? null;
  }

  async writeArticleMeta(articleName: string, data: Partial<ArticleMeta>): Promise<void> {
    const meta = await this.readProjectMeta();
    const existing = meta.articles[articleName] ?? {} as Partial<ArticleMeta>;
    const now = new Date().toISOString();

    meta.articles[articleName] = {
      ...existing,
      ...data,
      updated_at: now,
      created_at: existing.created_at ?? data.created_at ?? now,
    } as ArticleMeta;

    await this.writeProjectMeta(meta);
  }

  async listArticles(): Promise<Array<{ name: string; meta: ArticleMeta }>> {
    const meta = await this.readProjectMeta();
    return Object.entries(meta.articles).map(([name, m]) => ({ name, meta: m }));
  }

  async deleteArticleMeta(articleName: string): Promise<void> {
    const meta = await this.readProjectMeta();
    delete meta.articles[articleName];
    await this.writeProjectMeta(meta);
  }

  async updatePlatformStatus(
    articleName: string,
    platform: string,
    status: Partial<PlatformPublishStatus>,
  ): Promise<void> {
    const meta = await this.readProjectMeta();
    const article = meta.articles[articleName];
    if (!article) {
      throw new ReachforgeError(
        `Article "${articleName}" not found in meta.yaml`,
        'Cannot update platform status for unknown article',
      );
    }

    article.platforms = article.platforms ?? {};
    article.platforms[platform] = {
      ...(article.platforms[platform] ?? {}),
      ...status,
    } as PlatformPublishStatus;
    article.updated_at = new Date().toISOString();

    await this.writeProjectMeta(meta);
  }

  // --- Per-article locking via _locks map in meta.yaml ---
  // Note: lockArticle uses read-modify-write on meta.yaml which is not truly atomic.
  // For single-user CLI this is acceptable. For concurrent daemon instances,
  // a file-based lock (O_CREAT|O_EXCL) would be needed.

  async lockArticle(articleName: string): Promise<boolean> {
    const meta = await this.readProjectMeta();
    const locks = meta._locks ?? {};

    if (locks[articleName]) {
      if (this.isProcessAlive(locks[articleName].pid)) {
        return false;
      }
      // Stale lock — reclaim
    }

    locks[articleName] = {
      pid: process.pid,
      started_at: new Date().toISOString(),
      hostname: os.hostname(),
    };
    meta._locks = locks;
    await this.writeProjectMeta(meta);
    return true;
  }

  async unlockArticle(articleName: string): Promise<void> {
    const meta = await this.readProjectMeta();
    if (meta._locks) {
      delete meta._locks[articleName];
      await this.writeProjectMeta(meta);
    }
  }

  async isArticleLocked(articleName: string): Promise<boolean> {
    const meta = await this.readProjectMeta();
    const lock = meta._locks?.[articleName];
    if (!lock) return false;

    if (this.isProcessAlive(lock.pid)) return true;

    // Stale lock — clean up
    delete meta._locks![articleName];
    await this.writeProjectMeta(meta);
    return false;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
