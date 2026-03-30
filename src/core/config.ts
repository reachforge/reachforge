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
    let postizIntegrations: Record<string, string> | undefined;

    // Layer 3: global ~/.reach/config.yaml
    const globalDir = path.join(os.homedir(), WORKSPACE_CONFIG_DIR);
    const globalConfig = await readConfigFromDir(globalDir);
    if (globalConfig) {
      ConfigManager.mergeWorkspaceConfig(globalConfig, merged);
      if (globalConfig.postiz_integrations) {
        postizIntegrations = { ...globalConfig.postiz_integrations };
      }
    }

    // Layer 2: workspace .reach/config.yaml (overrides global for overlapping keys)
    if (workspaceRoot) {
      const wsConfig = await readWorkspaceConfig(workspaceRoot);
      if (wsConfig) {
        ConfigManager.mergeWorkspaceConfig(wsConfig, merged);
        if (wsConfig.postiz_integrations) {
          postizIntegrations = { ...(postizIntegrations ?? {}), ...wsConfig.postiz_integrations };
        }
      }
    }

    // Layer 1 (highest): environment variables
    const env = process.env;

    // POSTIZ_INTEGRATIONS env var accepts JSON: '{"x":"abc-123","linkedin":"def-456"}'
    const envPostizIntegrations: Record<string, string> | undefined = env.POSTIZ_INTEGRATIONS
      ? (() => { try { return JSON.parse(env.POSTIZ_INTEGRATIONS!); } catch { return undefined; } })()
      : undefined;

    const config: ReachforgeConfig = {
      geminiApiKey: env.GEMINI_API_KEY || merged.gemini_api_key,
      devtoApiKey: env.DEVTO_API_KEY || merged.devto_api_key,
      postizApiKey: env.POSTIZ_API_KEY || merged.postiz_api_key,
      postizIntegrations: envPostizIntegrations ?? postizIntegrations,
      postizBaseUrl: env.POSTIZ_BASE_URL || merged.postiz_base_url,
      postizWhoCanReply: env.POSTIZ_WHO_CAN_REPLY || merged.postiz_who_can_reply,
      hashnodeApiKey: env.HASHNODE_API_KEY || merged.hashnode_api_key,
      hashnodePublicationId: env.HASHNODE_PUBLICATION_ID || merged.hashnode_publication_id,
      githubToken: env.GITHUB_TOKEN || merged.github_token,
      githubOwner: env.GITHUB_OWNER || merged.github_owner,
      githubRepo: env.GITHUB_REPO || merged.github_repo,
      githubDiscussionCategory: env.GITHUB_DISCUSSION_CATEGORY || merged.github_discussion_category,
      ghostUrl: env.GHOST_URL || merged.ghost_url,
      ghostAdminApiKey: env.GHOST_ADMIN_API_KEY || merged.ghost_admin_api_key,
      wordpressUrl: env.WORDPRESS_URL || merged.wordpress_url,
      wordpressUsername: env.WORDPRESS_USERNAME || merged.wordpress_username,
      wordpressAppPassword: env.WORDPRESS_APP_PASSWORD || merged.wordpress_app_password,
      telegraphAccessToken: env.TELEGRAPH_ACCESS_TOKEN || merged.telegraph_access_token,
      writeasAccessToken: env.WRITEAS_ACCESS_TOKEN || merged.writeas_access_token,
      writeasUrl: env.WRITEAS_URL || merged.writeas_url,
      redditClientId: env.REDDIT_CLIENT_ID || merged.reddit_client_id,
      redditClientSecret: env.REDDIT_CLIENT_SECRET || merged.reddit_client_secret,
      redditUsername: env.REDDIT_USERNAME || merged.reddit_username,
      redditPassword: env.REDDIT_PASSWORD || merged.reddit_password,
      redditSubreddit: env.REDDIT_SUBREDDIT || merged.reddit_subreddit,
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
      'devto_api_key', 'postiz_api_key', 'postiz_base_url', 'postiz_who_can_reply',
      'hashnode_api_key', 'hashnode_publication_id',
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
    // postiz_integrations is a Record — handled separately in load()
  }
}
