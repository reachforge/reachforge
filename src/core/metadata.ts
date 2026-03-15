import * as path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import type { ProjectMeta, Receipt } from '../types/index.js';
import { ProjectMetaSchema, ReceiptSchema } from '../types/index.js';
import { MetadataParseError } from '../types/index.js';
import { META_FILENAME, RECEIPT_FILENAME } from './constants.js';

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
}
