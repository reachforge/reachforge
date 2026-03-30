import * as path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { z } from 'zod';
import { PROJECT_CONFIG_FILE, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE } from './constants.js';

export const ProjectConfigSchema = z.object({
  name: z.string().optional(),
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

  // Platform API keys
  devto_api_key: z.string().optional(),
  postiz_api_key: z.string().optional(),
  /**
   * Map of platform key → Postiz integration ID.
   * Example:
   *   postiz_integrations:
   *     x: abc-123
   *     x_company: def-456
   *     linkedin: ghi-789
   */
  postiz_integrations: z.record(z.string(), z.string()).optional(),
  postiz_base_url: z.string().url().optional(),
  postiz_who_can_reply: z.enum(['everyone', 'following', 'mentionedUsers', 'subscribers', 'verified']).optional(),
  hashnode_api_key: z.string().optional(),
  hashnode_publication_id: z.string().optional(),
  github_token: z.string().optional(),
  github_owner: z.string().optional(),
  github_repo: z.string().optional(),
  github_discussion_category: z.string().optional(),
  gemini_api_key: z.string().optional(),
  ghost_url: z.string().optional(),
  ghost_admin_api_key: z.string().optional(),
  wordpress_url: z.string().optional(),
  wordpress_username: z.string().optional(),
  wordpress_app_password: z.string().optional(),
  telegraph_access_token: z.string().optional(),
  writeas_access_token: z.string().optional(),
  writeas_url: z.string().optional(),
  reddit_client_id: z.string().optional(),
  reddit_client_secret: z.string().optional(),
  reddit_username: z.string().optional(),
  reddit_password: z.string().optional(),
  reddit_subreddit: z.string().optional(),

  // LLM settings
  llm_adapter: z.string().optional(),
  draft_adapter: z.string().optional(),
  adapt_adapter: z.string().optional(),
  llm_model: z.string().optional(),
  llm_timeout: z.coerce.number().optional(),
  claude_command: z.string().optional(),
  gemini_command: z.string().optional(),
  codex_command: z.string().optional(),

  // MCP
  mcp_auth_key: z.string().optional(),

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

export async function writeProjectConfig(projectDir: string, config: Partial<ProjectConfig>): Promise<void> {
  const filePath = path.join(projectDir, PROJECT_CONFIG_FILE);
  await fs.ensureDir(projectDir);
  const full = ProjectConfigSchema.parse(config);
  await fs.writeFile(filePath, yaml.dump(full, { lineWidth: -1 }));
}

/**
 * Read workspace config from {workspaceRoot}/.reach/config.yaml.
 * Use for workspace-level config where workspaceRoot is the workspace directory.
 */
export async function readWorkspaceConfig(workspaceRoot: string): Promise<WorkspaceConfig | null> {
  const filePath = path.join(workspaceRoot, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE);
  return readConfigFile(filePath);
}

/**
 * Read config from a directory that already IS the .reach dir (e.g. ~/.reach/).
 * Use for global config where the dir already contains config.yaml directly.
 */
export async function readConfigFromDir(configDir: string): Promise<WorkspaceConfig | null> {
  const filePath = path.join(configDir, WORKSPACE_CONFIG_FILE);
  return readConfigFile(filePath);
}

async function readConfigFile(filePath: string): Promise<WorkspaceConfig | null> {
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
  await fs.writeFile(path.join(configDir, WORKSPACE_CONFIG_FILE), yaml.dump(config, { lineWidth: -1 }));
}

/**
 * Write config directly into a directory that IS the config dir (e.g. ~/.reach/).
 */
export async function writeConfigToDir(configDir: string, config: WorkspaceConfig): Promise<void> {
  await fs.ensureDir(configDir);
  await fs.writeFile(path.join(configDir, WORKSPACE_CONFIG_FILE), yaml.dump(config, { lineWidth: -1 }));
}
