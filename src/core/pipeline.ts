import * as path from 'path';
import fs from 'fs-extra';
import type { PipelineStage, PipelineStatus, StageInfo, StageTransition } from '../types/index.js';
import { ProjectNotFoundError, AphypeError } from '../types/index.js';
import { STAGES, STAGE_STATUS_MAP, SCHEDULED_DIR_REGEX } from './constants.js';
import { MetadataManager } from './metadata.js';
import { sanitizePath } from '../utils/path.js';

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

  async listProjects(stage: PipelineStage): Promise<string[]> {
    const dirPath = path.join(this.workingDir, stage);
    if (!await fs.pathExists(dirPath)) return [];
    const items = await fs.readdir(dirPath);
    return items
      .filter(item => !item.startsWith('.') && !item.endsWith('.yaml'))
      .sort();
  }

  async getStatus(): Promise<PipelineStatus> {
    await this.initPipeline();

    const stages = {} as Record<PipelineStage, StageInfo>;
    let totalProjects = 0;

    for (const stage of STAGES) {
      const items = await this.listProjects(stage);
      stages[stage] = { count: items.length, items };
      totalProjects += items.length;
    }

    const dueToday = await this.findDueProjects();
    return { stages, totalProjects, dueToday };
  }

  async moveProject(
    project: string,
    fromStage: PipelineStage,
    toStage: PipelineStage,
    newName?: string,
  ): Promise<StageTransition> {
    const sourcePath = path.join(this.workingDir, fromStage, project);
    const targetName = newName ?? project;
    const targetPath = path.join(this.workingDir, toStage, targetName);

    if (!await fs.pathExists(sourcePath)) {
      throw new ProjectNotFoundError(project, fromStage);
    }

    if (await fs.pathExists(targetPath)) {
      throw new AphypeError(
        `Project "${targetName}" already exists in ${toStage}.`,
        'Target directory already exists',
        'Choose a different name or remove the existing project.',
      );
    }

    // Safe move: copy then remove (handles cross-device and interrupted moves)
    await fs.copy(sourcePath, targetPath);
    // Verify copy succeeded before removing source
    if (await fs.pathExists(targetPath)) {
      await fs.remove(sourcePath);
    } else {
      throw new AphypeError(
        `Failed to move project "${project}": copy verification failed.`,
        'File copy to target did not complete',
      );
    }

    // Update metadata
    const newStatus = STAGE_STATUS_MAP[toStage] || 'inbox';
    const metaUpdate: Partial<import('../types/index.js').ProjectMeta> = { status: newStatus };

    // Extract publish_date from scheduled directory name
    if (toStage === '05_scheduled') {
      const match = targetName.match(SCHEDULED_DIR_REGEX);
      if (match) {
        metaUpdate.publish_date = match[1];
      }
    }

    await this.metadata.writeMeta(toStage, targetName, metaUpdate);

    return {
      from: fromStage,
      to: toStage,
      project: targetName,
      timestamp: new Date().toISOString(),
    };
  }

  async rollbackProject(project: string): Promise<StageTransition> {
    // Find the project across stages (search from last to first)
    for (let i = STAGES.length - 1; i >= 0; i--) {
      const stage = STAGES[i];
      const items = await this.listProjects(stage);
      const found = items.find(item => item === project || item.endsWith(`-${project}`));

      if (found) {
        if (i === 0) {
          throw new AphypeError(
            'Cannot rollback: project is already in the first stage.',
            `Project "${found}" is in ${stage}`,
          );
        }

        const prevStage = STAGES[i - 1];
        // Strip date prefix if rolling back from scheduled
        let targetName = found;
        if (stage === '05_scheduled') {
          const match = found.match(SCHEDULED_DIR_REGEX);
          if (match) targetName = match[2];
        }

        return this.moveProject(found, stage, prevStage, targetName);
      }
    }

    throw new ProjectNotFoundError(project, 'any stage');
  }

  async findDueProjects(): Promise<string[]> {
    const today = new Date().toISOString().split('T')[0];
    const items = await this.listProjects('05_scheduled');
    return items.filter(item => {
      const match = item.match(SCHEDULED_DIR_REGEX);
      return match && match[1] <= today;
    });
  }

  async readProjectContent(stage: PipelineStage, project: string, filename: string): Promise<string> {
    const safe = sanitizePath(filename);
    const filePath = path.join(this.workingDir, stage, project, safe);
    if (!await fs.pathExists(filePath)) {
      throw new ProjectNotFoundError(`${project}/${safe}`, stage);
    }
    return fs.readFile(filePath, 'utf-8');
  }

  async writeProjectFile(stage: PipelineStage, project: string, filename: string, content: string): Promise<void> {
    const safe = sanitizePath(filename);
    const filePath = path.join(this.workingDir, stage, project, safe);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
  }

  getProjectPath(stage: PipelineStage, project: string): string {
    return path.join(this.workingDir, stage, project);
  }
}
