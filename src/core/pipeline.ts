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
    await Promise.all(
      STAGES.map(stage => fs.ensureDir(path.join(this.workingDir, stage)))
    );
  }

  async getStatus(): Promise<PipelineStatus> {
    const stages = {} as Record<PipelineStage, StageInfo>;
    let totalProjects = 0;

    for (const stage of STAGES) {
      const items = await this.listArticles(stage);
      stages[stage] = { count: items.length, items };
      totalProjects += items.length;
    }

    const dueToday = await this.findDueArticles();
    return { stages, totalProjects, dueToday };
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
    const newStatus = STAGE_STATUS_MAP[toStage] || 'inbox';
    await this.metadata.writeArticleMeta(article, { status: newStatus });

    return {
      from: fromStage,
      to: toStage,
      project: article,
      article,
      timestamp: new Date().toISOString(),
    };
  }

  async findDueArticles(): Promise<string[]> {
    const articles = await this.listArticles('05_scheduled');
    if (articles.length === 0) return [];

    // Read meta once for all articles (avoid N+1)
    const meta = await this.metadata.readProjectMeta();
    const now = new Date();
    const nowIso = now.toISOString();
    const due: string[] = [];

    for (const article of articles) {
      const articleMeta = meta.articles[article];
      if (!articleMeta?.schedule) {
        due.push(article);
      } else if (articleMeta.schedule <= nowIso) {
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
