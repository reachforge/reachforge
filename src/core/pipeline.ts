import * as path from 'path';
import fs from 'fs-extra';
import type { PipelineStage, PipelineStatus, StageInfo, StageTransition } from '../types/index.js';
import { ProjectNotFoundError, ReachforgeError } from '../types/index.js';
import { STAGES, STAGE_STATUS_MAP } from './constants.js';
import { MetadataManager } from './metadata.js';
import { parseArticleFilename, buildArticleFilename } from './filename-parser.js';

export class PipelineEngine {
  public readonly metadata: MetadataManager;

  constructor(private readonly workingDir: string) {
    this.metadata = new MetadataManager(workingDir);
  }

  get projectDir(): string {
    return this.workingDir;
  }

  async initPipeline(): Promise<void> {
    await this.migrateLegacyPipeline();
    await Promise.all(
      STAGES.map(stage => fs.ensureDir(path.join(this.workingDir, stage)))
    );
  }

  /**
   * Migrate legacy 6-stage pipeline directories to 3-stage layout.
   * Idempotent: safe to call multiple times.
   */
  async migrateLegacyPipeline(): Promise<void> {
    const legacyDirs = ['01_inbox', '02_drafts', '03_master', '04_adapted', '05_scheduled', '06_sent'];
    const hasLegacy = await Promise.all(
      legacyDirs.map(d => fs.pathExists(path.join(this.workingDir, d)))
    );
    if (!hasLegacy.some(Boolean)) return;

    // Merge: 01_inbox + 02_drafts + 03_master → 01_drafts
    await fs.ensureDir(path.join(this.workingDir, '01_drafts'));
    for (const dir of ['01_inbox', '02_drafts', '03_master']) {
      const dirPath = path.join(this.workingDir, dir);
      if (!await fs.pathExists(dirPath)) continue;
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const src = path.join(dirPath, file);
        const dst = path.join(this.workingDir, '01_drafts', file);
        if (!await fs.pathExists(dst)) {
          await fs.move(src, dst);
        } else {
          console.warn(`  Migration: skipped ${dir}/${file} (already exists in 01_drafts)`);
        }
      }
      const remaining = await fs.readdir(dirPath);
      if (remaining.filter(f => !f.startsWith('.')).length === 0) {
        await fs.remove(dirPath);
      }
    }

    // Merge: 04_adapted + 05_scheduled → 02_adapted
    await fs.ensureDir(path.join(this.workingDir, '02_adapted'));
    for (const dir of ['04_adapted', '05_scheduled']) {
      const dirPath = path.join(this.workingDir, dir);
      if (!await fs.pathExists(dirPath)) continue;
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const src = path.join(dirPath, file);
        const dst = path.join(this.workingDir, '02_adapted', file);
        if (!await fs.pathExists(dst)) {
          await fs.move(src, dst);
        } else {
          console.warn(`  Migration: skipped ${dir}/${file} (already exists in 02_adapted)`);
        }
      }
      const remaining = await fs.readdir(dirPath);
      if (remaining.filter(f => !f.startsWith('.')).length === 0) {
        await fs.remove(dirPath);
      }
    }

    // Rename: 06_sent → 03_published
    const sentPath = path.join(this.workingDir, '06_sent');
    const publishedPath = path.join(this.workingDir, '03_published');
    if (await fs.pathExists(sentPath) && !await fs.pathExists(publishedPath)) {
      await fs.move(sentPath, publishedPath);
    } else if (await fs.pathExists(sentPath)) {
      const files = await fs.readdir(sentPath);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const src = path.join(sentPath, file);
        const dst = path.join(publishedPath, file);
        if (!await fs.pathExists(dst)) {
          await fs.move(src, dst);
        } else {
          console.warn(`  Migration: skipped 06_sent/${file} (already exists in 03_published)`);
        }
      }
      const remaining = await fs.readdir(sentPath);
      if (remaining.filter(f => !f.startsWith('.')).length === 0) {
        await fs.remove(sentPath);
      }
    }

    // Migrate metadata status values
    try {
      const meta = await this.metadata.readProjectMeta();
      let changed = false;
      for (const [name, article] of Object.entries(meta.articles)) {
        const status = article.status as string;
        if (status === 'inbox' || status === 'master') {
          meta.articles[name] = { ...article, status: 'drafted' };
          changed = true;
        }
      }
      if (changed) {
        await this.metadata.writeProjectMeta(meta);
      }
    } catch {
      // No meta.yaml yet — nothing to migrate
    }
  }

  async getStatus(): Promise<PipelineStatus> {
    const stages = {} as Record<PipelineStage, StageInfo>;
    const allArticles = new Set<string>();

    for (const stage of STAGES) {
      const items = await this.listArticles(stage);
      stages[stage] = { count: items.length, items };
      items.forEach(item => allArticles.add(item));
    }

    const dueToday = await this.findDueArticles();
    return { stages, totalProjects: allArticles.size, dueToday };
  }

  async listArticles(stage: PipelineStage): Promise<string[]> {
    const dirPath = path.join(this.workingDir, stage);
    if (!await fs.pathExists(dirPath)) return [];
    const items = await fs.readdir(dirPath);
    const articles = new Set<string>();

    for (const item of items) {
      if (item.startsWith('.') || !item.endsWith('.md')) continue;
      const parsed = parseArticleFilename(item, stage);
      articles.add(parsed.article);
    }

    return [...articles].sort();
  }

  async getArticleFiles(article: string, stage: PipelineStage): Promise<string[]> {
    const dirPath = path.join(this.workingDir, stage);
    if (!await fs.pathExists(dirPath)) return [];
    const items = await fs.readdir(dirPath);
    const files: string[] = [];

    for (const item of items) {
      if (item.startsWith('.') || !item.endsWith('.md')) continue;
      const parsed = parseArticleFilename(item, stage);
      if (parsed.article === article) {
        files.push(item);
      }
    }

    return files.sort();
  }

  async moveArticle(
    article: string,
    fromStage: PipelineStage,
    toStage: PipelineStage,
  ): Promise<StageTransition> {
    const files = await this.getArticleFiles(article, fromStage);

    if (files.length === 0) {
      throw new ProjectNotFoundError(article, fromStage);
    }

    // Check all targets are free before moving anything
    for (const file of files) {
      const targetPath = path.join(this.workingDir, toStage, file);
      if (await fs.pathExists(targetPath)) {
        throw new ReachforgeError(
          `Article "${article}" already exists in ${toStage}.`,
          `File "${file}" already exists in target stage`,
          'Remove the existing file or choose a different name.',
        );
      }
    }

    // Copy then remove
    for (const file of files) {
      const sourcePath = path.join(this.workingDir, fromStage, file);
      const targetPath = path.join(this.workingDir, toStage, file);
      await fs.copy(sourcePath, targetPath);
      if (await fs.pathExists(targetPath)) {
        await fs.remove(sourcePath);
      } else {
        throw new ReachforgeError(
          `Failed to move article "${article}": copy verification failed.`,
          `File "${file}" copy did not complete`,
        );
      }
    }

    // Update metadata
    const newStatus = STAGE_STATUS_MAP[toStage] || 'drafted';
    const metaUpdate: Record<string, unknown> = { status: newStatus };
    // Clear stale publish results when rolling back from published
    if (fromStage === '03_published') {
      metaUpdate.platforms = undefined;
    }
    // Clear adapted state when rolling back to drafts
    if (toStage === '01_drafts') {
      metaUpdate.schedule = undefined;
      metaUpdate.adapted_platforms = undefined;
    }
    await this.metadata.writeArticleMeta(article, metaUpdate);

    return {
      from: fromStage,
      to: toStage,
      project: article,
      article,
      timestamp: new Date().toISOString(),
    };
  }

  async findDueArticles(): Promise<string[]> {
    const articles = await this.listArticles('02_adapted');
    if (articles.length === 0) return [];

    // Read meta once for all articles (avoid N+1)
    const meta = await this.metadata.readProjectMeta();
    const now = new Date();
    const nowIso = now.toISOString();
    const due: string[] = [];

    for (const article of articles) {
      const articleMeta = meta.articles[article];
      // Only consider articles explicitly scheduled (not all adapted articles)
      if (articleMeta?.status !== 'scheduled') continue;
      if (!articleMeta.schedule || articleMeta.schedule <= nowIso) {
        due.push(article);
      }
    }

    return due;
  }

  async rollbackArticle(article: string): Promise<StageTransition> {
    for (let i = STAGES.length - 1; i >= 0; i--) {
      const stage = STAGES[i];
      const articles = await this.listArticles(stage);

      if (articles.includes(article)) {
        if (i === 0) {
          throw new ReachforgeError(
            'Cannot rollback: article is already in the first stage.',
            `Article "${article}" is in ${stage}`,
          );
        }

        const prevStage = STAGES[i - 1];

        // Special handling: rolling back from adapted to drafts
        // Only move the base article.md, delete platform-specific files
        if (stage === '02_adapted' && prevStage === '01_drafts') {
          const baseFile = `${article}.md`;
          const baseSrc = path.join(this.workingDir, stage, baseFile);
          const baseDst = path.join(this.workingDir, prevStage, baseFile);

          // Move base file if it exists
          if (await fs.pathExists(baseSrc)) {
            if (await fs.pathExists(baseDst)) {
              throw new ReachforgeError(
                `Article "${article}" already exists in ${prevStage}.`,
                `File "${baseFile}" already exists in target stage`,
              );
            }
            await fs.copy(baseSrc, baseDst);
            await fs.remove(baseSrc);
          }

          // Remove platform-specific files from 02_adapted
          const allFiles = await this.getArticleFiles(article, stage);
          for (const file of allFiles) {
            await fs.remove(path.join(this.workingDir, stage, file));
          }

          // Update metadata
          await this.metadata.writeArticleMeta(article, {
            status: 'drafted',
            schedule: undefined,
            adapted_platforms: undefined,
          } as Record<string, unknown>);

          return {
            from: stage,
            to: prevStage,
            project: article,
            article,
            timestamp: new Date().toISOString(),
          };
        }

        return this.moveArticle(article, stage, prevStage);
      }
    }

    throw new ProjectNotFoundError(article, 'any stage');
  }

  async readArticleContent(stage: PipelineStage, article: string, platform?: string): Promise<string> {
    const filename = buildArticleFilename(article, platform ?? null);
    const filePath = path.join(this.workingDir, stage, filename);
    if (!await fs.pathExists(filePath)) {
      throw new ProjectNotFoundError(article, stage);
    }
    return fs.readFile(filePath, 'utf-8');
  }

  async writeArticleFile(stage: PipelineStage, article: string, content: string, platform?: string): Promise<void> {
    const filename = buildArticleFilename(article, platform ?? null);
    const filePath = path.join(this.workingDir, stage, filename);
    await fs.writeFile(filePath, content);
  }

  getArticlePath(stage: PipelineStage, article: string, platform?: string): string {
    const filename = buildArticleFilename(article, platform ?? null);
    return path.join(this.workingDir, stage, filename);
  }
}
