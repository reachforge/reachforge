import * as path from 'path';
import * as os from 'os';
import type { ReachforgeConfig } from '../types/index.js';
import { DEFAULT_LLM_MODEL, WORKSPACE_CONFIG_DIR } from './constants.js';
import { readWorkspaceConfig, readConfigFromDir } from './project-config.js';
import type { WorkspaceConfig } from './project-config.js';

export class ConfigManager {
  private constructor(private readonly config: ReachforgeConfig) {}

  /**
   * 3-layer config loading (each layer overrides the previous):
   *   Layer 3 (lowest):  ~/.reach/config.yaml (global)
   *   Layer 2:           {workspaceRoot}/.reach/config.yaml (workspace)
   *   Layer 1 (highest): environment variables
   */
  static async load(workspaceRoot?: string): Promise<ConfigManager> {
    const merged: Record<string, string | undefined> = {};

    // Layer 3: global ~/.reach/config.yaml
    const globalDir = path.join(os.homedir(), WORKSPACE_CONFIG_DIR);
    const globalConfig = await readConfigFromDir(globalDir);
    if (globalConfig) {
      ConfigManager.mergeWorkspaceConfig(globalConfig, merged);
    }

    // Layer 2: workspace .reach/config.yaml
    if (workspaceRoot) {
      const wsConfig = await readWorkspaceConfig(workspaceRoot);
      if (wsConfig) {
        ConfigManager.mergeWorkspaceConfig(wsConfig, merged);
      }
    }

    // Layer 1 (highest): environment variables
    const env = process.env;
    const config: ReachforgeConfig = {
      geminiApiKey: env.GEMINI_API_KEY || merged.gemini_api_key,
      devtoApiKey: env.DEVTO_API_KEY || merged.devto_api_key,
      postizApiKey: env.POSTIZ_API_KEY || merged.postiz_api_key,
      hashnodeApiKey: env.HASHNODE_API_KEY || merged.hashnode_api_key,
      hashnodePublicationId: env.HASHNODE_PUBLICATION_ID || merged.hashnode_publication_id,
      githubToken: env.GITHUB_TOKEN || merged.github_token,
      githubOwner: env.GITHUB_OWNER || merged.github_owner,
      githubRepo: env.GITHUB_REPO || merged.github_repo,
      githubDiscussionCategory: env.GITHUB_DISCUSSION_CATEGORY || merged.github_discussion_category,
      llmModel: env.REACHFORGE_LLM_MODEL || merged.llm_model || DEFAULT_LLM_MODEL,
      llmAdapter: env.REACHFORGE_LLM_ADAPTER || merged.llm_adapter,
      draftAdapter: env.REACHFORGE_DRAFT_ADAPTER || merged.draft_adapter,
      adaptAdapter: env.REACHFORGE_ADAPT_ADAPTER || merged.adapt_adapter,
      llmTimeout: env.REACHFORGE_LLM_TIMEOUT ? Number(env.REACHFORGE_LLM_TIMEOUT) : (merged.llm_timeout ? Number(merged.llm_timeout) : undefined),
      claudeCommand: env.REACHFORGE_CLAUDE_COMMAND || merged.claude_command,
      geminiCommand: env.REACHFORGE_GEMINI_COMMAND || merged.gemini_command,
      codexCommand: env.REACHFORGE_CODEX_COMMAND || merged.codex_command,
      mcpAuthKey: env.MCP_AUTH_KEY || merged.mcp_auth_key,
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

  private static mergeWorkspaceConfig(wc: WorkspaceConfig, merged: Record<string, string | undefined>): void {
    const fields = [
      'devto_api_key', 'postiz_api_key', 'hashnode_api_key', 'hashnode_publication_id',
      'github_token', 'github_owner', 'github_repo', 'github_discussion_category',
      'gemini_api_key', 'llm_adapter', 'draft_adapter', 'adapt_adapter',
      'llm_model', 'claude_command', 'gemini_command', 'codex_command', 'mcp_auth_key',
    ] as const;

    for (const field of fields) {
      const val = wc[field];
      if (val !== undefined && val !== null) {
        merged[field] = String(val);
      }
    }
  }
}
