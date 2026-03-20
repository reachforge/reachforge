import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import type { ProjectMeta, Receipt, LockInfo } from '../types/index.js';
import { ProjectMetaSchema, ReceiptSchema } from '../types/index.js';
import { MetadataParseError } from '../types/index.js';
import type { UploadCache } from '../utils/media.js';
import { META_FILENAME, RECEIPT_FILENAME, LOCK_FILENAME, UPLOAD_CACHE_FILENAME } from './constants.js';

export class MetadataManager {
  constructor(private readonly workingDir: string) {}

  async readMeta(stage: string, project: string): Promise<ProjectMeta | null> {
    const filePath = path.join(this.workingDir, stage, project, META_FILENAME);
    if (!await fs.pathExists(filePath)) return null;

    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(raw);
    const result = ProjectMetaSchema.safeParse(parsed);

    if (!result.success) {
      throw new MetadataParseError(filePath, result.error.issues.map(i => i.message).join(', '));
    }
    return result.data as ProjectMeta;
  }

  async writeMeta(stage: string, project: string, meta: Partial<ProjectMeta>): Promise<void> {
    const filePath = path.join(this.workingDir, stage, project, META_FILENAME);
    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);

    let existing: Record<string, unknown> = {};
    if (await fs.pathExists(filePath)) {
      const raw = await fs.readFile(filePath, 'utf-8');
      existing = (yaml.load(raw) as Record<string, unknown>) || {};
    }

    const merged = {
      ...existing,
      ...meta,
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(filePath, yaml.dump(merged, { lineWidth: -1 }));
  }

  async readReceipt(stage: string, project: string): Promise<Receipt | null> {
    const filePath = path.join(this.workingDir, stage, project, RECEIPT_FILENAME);
    if (!await fs.pathExists(filePath)) return null;

    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(raw);
    const result = ReceiptSchema.safeParse(parsed);

    if (!result.success) {
      throw new MetadataParseError(filePath, result.error.issues.map(i => i.message).join(', '));
    }
    return result.data as Receipt;
  }

  async writeReceipt(stage: string, project: string, receipt: Receipt): Promise<void> {
    const filePath = path.join(this.workingDir, stage, project, RECEIPT_FILENAME);
    await fs.writeFile(filePath, yaml.dump(receipt, { lineWidth: -1 }));
  }

  async lockProject(stage: string, project: string): Promise<boolean> {
    const lockPath = path.join(this.workingDir, stage, project, LOCK_FILENAME);
    const lockInfo: LockInfo = {
      pid: process.pid,
      started_at: new Date().toISOString(),
      hostname: os.hostname(),
    };

    // Check for stale lock (process no longer running)
    if (await fs.pathExists(lockPath)) {
      try {
        const raw = await fs.readFile(lockPath, 'utf-8');
        const existing = yaml.load(raw) as LockInfo;
        if (existing?.pid && this.isProcessAlive(existing.pid)) {
          return false; // Lock is held by a running process
        }
        // Stale lock — process is dead, reclaim it
      } catch {
        // Corrupted lock file — reclaim it
      }
    }

    await fs.writeFile(lockPath, yaml.dump(lockInfo, { lineWidth: -1 }));
    return true;
  }

  async unlockProject(stage: string, project: string): Promise<void> {
    const lockPath = path.join(this.workingDir, stage, project, LOCK_FILENAME);
    await fs.remove(lockPath);
  }

  async isLocked(stage: string, project: string): Promise<boolean> {
    const lockPath = path.join(this.workingDir, stage, project, LOCK_FILENAME);
    if (!await fs.pathExists(lockPath)) return false;

    try {
      const raw = await fs.readFile(lockPath, 'utf-8');
      const info = yaml.load(raw) as LockInfo;
      return info?.pid ? this.isProcessAlive(info.pid) : false;
    } catch {
      return false;
    }
  }

  async readLock(stage: string, project: string): Promise<LockInfo | null> {
    const lockPath = path.join(this.workingDir, stage, project, LOCK_FILENAME);
    if (!await fs.pathExists(lockPath)) return null;
    try {
      const raw = await fs.readFile(lockPath, 'utf-8');
      return yaml.load(raw) as LockInfo;
    } catch {
      return null;
    }
  }

  async readUploadCache(stage: string, project: string): Promise<UploadCache | null> {
    const filePath = path.join(this.workingDir, stage, project, UPLOAD_CACHE_FILENAME);
    if (!await fs.pathExists(filePath)) return null;
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(raw) as UploadCache;
      return parsed && parsed.uploads ? parsed : null;
    } catch {
      return null;
    }
  }

  async writeUploadCache(stage: string, project: string, cache: UploadCache): Promise<void> {
    const filePath = path.join(this.workingDir, stage, project, UPLOAD_CACHE_FILENAME);
    await fs.writeFile(filePath, yaml.dump(cache, { lineWidth: -1 }));
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
