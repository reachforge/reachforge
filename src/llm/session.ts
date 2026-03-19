import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import type { SessionData } from './types.js';
import { SessionValidationError } from '../types/index.js';

export const SessionDataSchema = z.object({
  sessionId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/),
  adapter: z.enum(['claude', 'gemini', 'codex']),
  stage: z.string().min(1).max(100).regex(/^(draft|adapt-[a-z0-9-]+)$/),
  cwd: z.string().min(1),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
});

const ARTICLE_RE = /^[a-zA-Z0-9_-]+$/;
const STAGE_RE = /^(draft|adapt-[a-z0-9-]+)$/;

export class SessionManager {
  private readonly sessionsDir: string;

  constructor(projectDir: string) {
    if (!path.isAbsolute(projectDir)) {
      throw new Error('projectDir must be an absolute path');
    }
    this.sessionsDir = path.join(projectDir, '.reachforge', 'sessions');
  }

  getSessionPath(article: string, stage: string): string {
    return path.join(this.sessionsDir, article, `${stage}.json`);
  }

  async load(article: string, stage: string): Promise<SessionData | null> {
    if (!this.validArticle(article) || !this.validStage(stage)) return null;

    const filePath = this.getSessionPath(article, stage);

    try {
      await fs.access(filePath);
    } catch {
      return null;
    }

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Cannot read session file ${filePath}: ${msg}`);
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`Warning: Session file corrupted (invalid JSON): ${filePath}`);
      return null;
    }

    const result = SessionDataSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(`Warning: Session file corrupted (schema validation failed): ${filePath}`);
      return null;
    }

    return result.data;
  }

  async save(article: string, stage: string, data: SessionData): Promise<void> {
    if (!this.validArticle(article) || !this.validStage(stage)) {
      throw new SessionValidationError('Invalid article or stage name');
    }

    const result = SessionDataSchema.safeParse(data);
    if (!result.success) {
      throw new SessionValidationError(`Invalid session data: ${result.error.message}`);
    }

    const filePath = this.getSessionPath(article, stage);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const json = JSON.stringify(result.data, null, 2) + '\n';
    const tmpPath = filePath + '.tmp';

    await fs.writeFile(tmpPath, json, 'utf-8');
    try {
      await fs.rename(tmpPath, filePath);
    } catch {
      // Cross-device fallback
      await fs.writeFile(filePath, json, 'utf-8');
      await fs.unlink(tmpPath).catch(() => {});
    }
  }

  async delete(article: string, stage: string): Promise<void> {
    if (!this.validArticle(article) || !this.validStage(stage)) return;

    const filePath = this.getSessionPath(article, stage);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    // Try to clean up empty parent directory
    try {
      await fs.rmdir(path.dirname(filePath));
    } catch {
      // ENOTEMPTY or ENOENT — fine
    }
  }

  async deleteAll(article: string): Promise<void> {
    if (!this.validArticle(article)) return;

    const articleDir = path.join(this.sessionsDir, article);
    await fs.rm(articleDir, { recursive: true, force: true });
  }

  async list(article: string): Promise<Array<{ stage: string; data: SessionData }>> {
    if (!this.validArticle(article)) return [];

    const articleDir = path.join(this.sessionsDir, article);

    let entries: string[];
    try {
      entries = await fs.readdir(articleDir);
    } catch {
      return [];
    }

    const results: Array<{ stage: string; data: SessionData }> = [];

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const stage = entry.replace(/\.json$/, '');
      const data = await this.load(article, stage);
      if (data) results.push({ stage, data });
    }

    return results.sort((a, b) => b.data.lastUsedAt.localeCompare(a.data.lastUsedAt));
  }

  private validArticle(article: string): boolean {
    return article.length > 0 && article.length <= 200 && ARTICLE_RE.test(article);
  }

  private validStage(stage: string): boolean {
    return stage.length > 0 && STAGE_RE.test(stage);
  }
}
