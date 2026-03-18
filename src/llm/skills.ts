import * as fs from 'fs/promises';
import * as path from 'path';
import type { ResolvedSkill } from './types.js';

const MAX_SKILL_CHARS = 100_000;

export class SkillResolver {
  private readonly builtInDir: string;
  private readonly workspaceSkillsDir: string;
  private readonly projectSkillsDir: string;

  constructor(builtInDir: string, workspaceDir: string, projectDir: string) {
    this.builtInDir = builtInDir;
    this.workspaceSkillsDir = workspaceDir ? path.join(workspaceDir, 'skills') : '';
    this.projectSkillsDir = projectDir ? path.join(projectDir, 'skills') : '';
  }

  async resolve(stage: string, platform?: string): Promise<ResolvedSkill[]> {
    const relativePaths: string[] = [];

    if (stage === 'draft') {
      relativePaths.push('stages/draft.md');
    } else if (stage === 'adapt') {
      relativePaths.push('stages/adapt.md');
      if (platform) {
        relativePaths.push(`platforms/${platform}.md`);
      }
    } else {
      return [];
    }

    const results: ResolvedSkill[] = [];
    for (const rel of relativePaths) {
      const skill = await this.resolveOne(rel);
      if (skill) results.push(skill);
    }
    return results;
  }

  async listAll(): Promise<ResolvedSkill[]> {
    const results: ResolvedSkill[] = [];

    // Project first (highest priority)
    if (this.projectSkillsDir) {
      await this.scanDir(this.projectSkillsDir, this.projectSkillsDir, 'project', results);
    }
    // Workspace second
    if (this.workspaceSkillsDir) {
      await this.scanDir(this.workspaceSkillsDir, this.workspaceSkillsDir, 'workspace', results);
    }
    // Built-in last
    if (this.builtInDir) {
      await this.scanDir(this.builtInDir, this.builtInDir, 'built-in', results);
    }

    return results;
  }

  async readSkillContent(skill: ResolvedSkill): Promise<string> {
    try {
      let content = await fs.readFile(skill.path, 'utf-8');
      if (content.length > MAX_SKILL_CHARS) {
        console.warn(`Warning: Skill file ${skill.path} exceeds ${MAX_SKILL_CHARS} chars, truncating.`);
        content = content.slice(0, MAX_SKILL_CHARS);
      }
      return content;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Could not read skill file ${skill.path}: ${msg}`);
      return '';
    }
  }

  private async resolveOne(relativePath: string): Promise<ResolvedSkill | null> {
    // Layer 3 (highest): project
    if (this.projectSkillsDir) {
      const candidate = path.join(this.projectSkillsDir, relativePath);
      if (await fileExists(candidate)) {
        return { name: relativePath, path: candidate, source: 'project' };
      }
    }

    // Layer 2: workspace
    if (this.workspaceSkillsDir) {
      const candidate = path.join(this.workspaceSkillsDir, relativePath);
      if (await fileExists(candidate)) {
        return { name: relativePath, path: candidate, source: 'workspace' };
      }
    }

    // Layer 1 (lowest): built-in
    if (this.builtInDir) {
      const candidate = path.join(this.builtInDir, relativePath);
      if (await fileExists(candidate)) {
        return { name: relativePath, path: candidate, source: 'built-in' };
      }
    }

    return null;
  }

  private async scanDir(
    dir: string,
    baseDir: string,
    source: ResolvedSkill['source'],
    results: ResolvedSkill[],
  ): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await this.scanDir(fullPath, baseDir, source, results);
        } else if (stat.isFile() && entry.endsWith('.md')) {
          const relativePath = path.relative(baseDir, fullPath);
          results.push({ name: relativePath, path: fullPath, source });
        }
      } catch {
        // skip unreadable entries
      }
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
