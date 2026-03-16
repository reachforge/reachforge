import * as path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { z } from 'zod';
import { PROJECT_CONFIG_FILE, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE } from './constants.js';

export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  platforms: z.array(z.string()).default([]),
  language: z.string().default('en'),
  tone: z.string().optional(),
  default_tags: z.array(z.string()).default([]),
  credentials: z.record(z.string(), z.string()).optional(),
  history: z.array(z.object({
    phase: z.string(),
    period: z.string().optional(),
    note: z.string().optional(),
  })).default([]),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const WorkspaceConfigSchema = z.object({
  default_workspace: z.string().optional(),
  credentials: z.record(z.string(), z.string()).optional(),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export async function readProjectConfig(projectDir: string): Promise<ProjectConfig | null> {
  const filePath = path.join(projectDir, PROJECT_CONFIG_FILE);
  if (!await fs.pathExists(filePath)) return null;

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(raw);
    const result = ProjectConfigSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeProjectConfig(projectDir: string, config: Partial<ProjectConfig> & { name: string }): Promise<void> {
  const filePath = path.join(projectDir, PROJECT_CONFIG_FILE);
  await fs.ensureDir(projectDir);
  const full = ProjectConfigSchema.parse(config);
  await fs.writeFile(filePath, yaml.dump(full, { lineWidth: -1 }));
}

export async function readWorkspaceConfig(workspaceRoot: string): Promise<WorkspaceConfig | null> {
  const filePath = path.join(workspaceRoot, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE);
  if (!await fs.pathExists(filePath)) return null;

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(raw);
    const result = WorkspaceConfigSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeWorkspaceConfig(workspaceRoot: string, config: WorkspaceConfig): Promise<void> {
  const configDir = path.join(workspaceRoot, WORKSPACE_CONFIG_DIR);
  await fs.ensureDir(configDir);
  await fs.writeFile(path.join(configDir, 'config.yaml'), yaml.dump(config, { lineWidth: -1 }));
}
