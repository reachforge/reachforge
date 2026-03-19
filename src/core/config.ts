import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import dotenv from 'dotenv';
import type { ReachforgeConfig } from '../types/index.js';
import { CredentialsSchema } from '../types/index.js';
import { DEFAULT_LLM_MODEL, WORKSPACE_CONFIG_DIR } from './constants.js';
import { readWorkspaceConfig } from './project-config.js';

export class ConfigManager {
  private constructor(private readonly config: ReachforgeConfig) {}

  /**
   * 4-layer config loading:
   *   Layer 4 (lowest):  ~/.reachforge/config.yaml (global)
   *   Layer 3:           {workspaceRoot}/.reachforge/config.yaml (workspace shared)
   *   Layer 2:           {projectDir}/.env + {projectDir}/credentials.yaml (project)
   *   Layer 1 (highest): environment variables
   */
  static async load(projectDir: string, workspaceRoot?: string): Promise<ConfigManager> {
    let mergedCreds: Record<string, string | undefined> = {};

    // Layer 4: global ~/.reachforge/config.yaml credentials
    const globalDir = path.join(os.homedir(), WORKSPACE_CONFIG_DIR);
    const globalWsConfig = await readWorkspaceConfig(globalDir);
    if (globalWsConfig?.credentials) {
      mergedCreds = { ...mergedCreds, ...globalWsConfig.credentials };
    }

    // Layer 3: workspace .reachforge/config.yaml credentials
    if (workspaceRoot) {
      const wsConfig = await readWorkspaceConfig(workspaceRoot);
      if (wsConfig?.credentials) {
        mergedCreds = { ...mergedCreds, ...wsConfig.credentials };
      }
    }

    // Layer 2: project credentials.yaml
    const credPath = path.join(projectDir, 'credentials.yaml');
    if (await fs.pathExists(credPath)) {
      try {
        const raw = await fs.readFile(credPath, 'utf-8');
        const parsed = yaml.load(raw);
        const result = CredentialsSchema.safeParse(parsed);
        if (result.success) {
          mergedCreds = { ...mergedCreds, ...(result.data as Record<string, string | undefined>) };
        }
      } catch {
        // Silently skip invalid credentials.yaml
      }
    }

    // Layer 2 cont: parse .env files WITHOUT mutating process.env
    // This prevents global pollution when iterating multiple projects
    let envVars: Record<string, string> = {};
    if (workspaceRoot) {
      const wsEnvPath = path.join(workspaceRoot, '.env');
      if (await fs.pathExists(wsEnvPath)) {
        try {
          const raw = await fs.readFile(wsEnvPath, 'utf-8');
          envVars = { ...envVars, ...dotenv.parse(raw) };
        } catch { /* skip unreadable .env */ }
      }
    }
    const projEnvPath = path.join(projectDir, '.env');
    if (await fs.pathExists(projEnvPath)) {
      try {
        const raw = await fs.readFile(projEnvPath, 'utf-8');
        envVars = { ...envVars, ...dotenv.parse(raw) }; // project overrides workspace
      } catch { /* skip unreadable .env */ }
    }

    // Merge: .env values fill gaps in credentials, but don't override
    for (const [key, value] of Object.entries(envVars)) {
      const lowerKey = key.toLowerCase();
      if (!mergedCreds[lowerKey]) {
        mergedCreds[lowerKey] = value;
      }
    }

    // Layer 1 (highest): real environment variables override everything
    const env = process.env;
    const config: ReachforgeConfig = {
      geminiApiKey: env.GEMINI_API_KEY || mergedCreds.gemini_api_key || envVars.GEMINI_API_KEY,
      devtoApiKey: env.DEVTO_API_KEY || mergedCreds.devto_api_key || envVars.DEVTO_API_KEY,
      postizApiKey: env.POSTIZ_API_KEY || mergedCreds.postiz_api_key || envVars.POSTIZ_API_KEY,
      hashnodeApiKey: env.HASHNODE_API_KEY || mergedCreds.hashnode_api_key || envVars.HASHNODE_API_KEY,
      hashnodePublicationId: env.HASHNODE_PUBLICATION_ID || mergedCreds.hashnode_publication_id || envVars.HASHNODE_PUBLICATION_ID,
      githubToken: env.GITHUB_TOKEN || mergedCreds.github_token || envVars.GITHUB_TOKEN,
      githubOwner: env.GITHUB_OWNER || mergedCreds.github_owner || envVars.GITHUB_OWNER,
      githubRepo: env.GITHUB_REPO || mergedCreds.github_repo || envVars.GITHUB_REPO,
      githubDiscussionCategory: env.GITHUB_DISCUSSION_CATEGORY || mergedCreds.github_discussion_category || envVars.GITHUB_DISCUSSION_CATEGORY,
      llmModel: env.REACHFORGE_LLM_MODEL || envVars.REACHFORGE_LLM_MODEL || DEFAULT_LLM_MODEL,
      mcpAuthKey: env.MCP_AUTH_KEY || envVars.MCP_AUTH_KEY,
    };

    return new ConfigManager(config);
  }

  getConfig(): ReachforgeConfig {
    return { ...this.config };
  }

  getApiKey(service: string): string | undefined {
    const keyMap: Record<string, string | undefined> = {
      gemini: this.config.geminiApiKey,
      devto: this.config.devtoApiKey,
      postiz: this.config.postizApiKey,
      hashnode: this.config.hashnodeApiKey,
      github: this.config.githubToken,
    };
    return keyMap[service];
  }

  getLLMModel(): string {
    return this.config.llmModel || DEFAULT_LLM_MODEL;
  }
}
