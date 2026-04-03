import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { Config } from 'apcore-js';
import type { ReachforgeConfig } from '../types/index.js';
import { DEFAULT_LLM_MODEL, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE } from './constants.js';

// ── Register "reach" namespace with apcore Config bus ──────────────────────
// envPrefix: null — we handle env vars manually because platform-standard
// names (DEVTO_API_KEY, GITHUB_TOKEN) don't follow REACHFORGE_ prefix.
try {
  Config.registerNamespace({
    name: 'reach',
    envPrefix: null,
    defaults: { llm_model: DEFAULT_LLM_MODEL },
  });
} catch {
  // Already registered (ConfigNamespaceDuplicateError) — safe to ignore
}

export class ConfigManager {
  private constructor(
    private readonly config: ReachforgeConfig,
    private readonly _apcoreConfig: Config,
  ) {}

  /**
   * 3-layer config loading (each layer overrides the previous):
   *   Layer 3 (lowest):  ~/.reach/config.yaml (global)
   *   Layer 2:           {workspaceRoot}/.reach/config.yaml (workspace)
   *   Layer 1 (highest): environment variables
   *
   * Uses apcore Config (namespace mode) as the underlying store.
   * Config files support both formats:
   *   - Namespace mode: reach: { devto_api_key: ... }
   *   - Legacy flat:    devto_api_key: ...  (auto-wrapped into reach namespace)
   */
  static async load(workspaceRoot?: string): Promise<ConfigManager> {
    // Layer 3: global ~/.reach/config.yaml
    const globalDir = path.join(os.homedir(), WORKSPACE_CONFIG_DIR);
    const globalPath = path.join(globalDir, WORKSPACE_CONFIG_FILE);

    let apcoreConfig: Config;
    if (await fs.pathExists(globalPath)) {
      const raw = await ConfigManager.readYaml(globalPath);
      if (raw) {
        // Normalise: wrap flat config into namespace mode
        const normalised = ConfigManager.normaliseToNamespace(raw);
        apcoreConfig = new Config(normalised);
      } else {
        apcoreConfig = new Config({ apcore: {} });
      }
    } else {
      apcoreConfig = new Config({ apcore: {} });
    }

    // Layer 2: workspace .reach/config.yaml (merged into reach namespace)
    if (workspaceRoot) {
      const wsPath = path.join(workspaceRoot, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE);
      if (await fs.pathExists(wsPath)) {
        const wsRaw = await ConfigManager.readYaml(wsPath);
        if (wsRaw) {
          // Extract reach section (or treat whole file as reach data)
          const wsReach = ConfigManager.extractReachSection(wsRaw);
          if (Object.keys(wsReach).length > 0) {
            apcoreConfig.mount('reach', { fromDict: wsReach });
          }
        }
      }
    }

    // Layer 1 (highest): environment variables
    const reach = apcoreConfig.namespace('reach') as Record<string, unknown>;
    const env = process.env;

    // POSTIZ_INTEGRATIONS env var accepts JSON: '{"x":"abc-123","linkedin":"def-456"}'
    const envPostizIntegrations: Record<string, string> | undefined = env.POSTIZ_INTEGRATIONS
      ? (() => {
          try { return JSON.parse(env.POSTIZ_INTEGRATIONS!); }
          catch { console.warn('Warning: POSTIZ_INTEGRATIONS env var contains invalid JSON — ignoring.'); return undefined; }
        })()
      : undefined;

    const yamlPostizIntegrations = reach.postiz_integrations as Record<string, string> | undefined;

    const config: ReachforgeConfig = {
      geminiApiKey: env.GEMINI_API_KEY || s(reach.gemini_api_key),
      devtoApiKey: env.DEVTO_API_KEY || s(reach.devto_api_key),
      postizApiKey: env.POSTIZ_API_KEY || s(reach.postiz_api_key),
      postizIntegrations: envPostizIntegrations ?? yamlPostizIntegrations,
      postizBaseUrl: env.POSTIZ_BASE_URL || s(reach.postiz_base_url),
      postizWhoCanReply: env.POSTIZ_WHO_CAN_REPLY || s(reach.postiz_who_can_reply),
      hashnodeApiKey: env.HASHNODE_API_KEY || s(reach.hashnode_api_key),
      hashnodePublicationId: env.HASHNODE_PUBLICATION_ID || s(reach.hashnode_publication_id),
      githubToken: env.GITHUB_TOKEN || s(reach.github_token),
      githubOwner: env.GITHUB_OWNER || s(reach.github_owner),
      githubRepo: env.GITHUB_REPO || s(reach.github_repo),
      githubDiscussionCategory: env.GITHUB_DISCUSSION_CATEGORY || s(reach.github_discussion_category),
      ghostUrl: env.GHOST_URL || s(reach.ghost_url),
      ghostAdminApiKey: env.GHOST_ADMIN_API_KEY || s(reach.ghost_admin_api_key),
      wordpressUrl: env.WORDPRESS_URL || s(reach.wordpress_url),
      wordpressUsername: env.WORDPRESS_USERNAME || s(reach.wordpress_username),
      wordpressAppPassword: env.WORDPRESS_APP_PASSWORD || s(reach.wordpress_app_password),
      telegraphAccessToken: env.TELEGRAPH_ACCESS_TOKEN || s(reach.telegraph_access_token),
      writeasAccessToken: env.WRITEAS_ACCESS_TOKEN || s(reach.writeas_access_token),
      writeasUrl: env.WRITEAS_URL || s(reach.writeas_url),
      redditClientId: env.REDDIT_CLIENT_ID || s(reach.reddit_client_id),
      redditClientSecret: env.REDDIT_CLIENT_SECRET || s(reach.reddit_client_secret),
      redditUsername: env.REDDIT_USERNAME || s(reach.reddit_username),
      redditPassword: env.REDDIT_PASSWORD || s(reach.reddit_password),
      redditSubreddit: env.REDDIT_SUBREDDIT || s(reach.reddit_subreddit),
      llmModel: env.REACHFORGE_LLM_MODEL || s(reach.llm_model) || DEFAULT_LLM_MODEL,
      llmAdapter: env.REACHFORGE_LLM_ADAPTER || s(reach.llm_adapter),
      draftAdapter: env.REACHFORGE_DRAFT_ADAPTER || s(reach.draft_adapter),
      adaptAdapter: env.REACHFORGE_ADAPT_ADAPTER || s(reach.adapt_adapter),
      llmTimeout: env.REACHFORGE_LLM_TIMEOUT ? Number(env.REACHFORGE_LLM_TIMEOUT) : n(reach.llm_timeout),
      claudeCommand: env.REACHFORGE_CLAUDE_COMMAND || s(reach.claude_command),
      geminiCommand: env.REACHFORGE_GEMINI_COMMAND || s(reach.gemini_command),
      codexCommand: env.REACHFORGE_CODEX_COMMAND || s(reach.codex_command),
      mcpAuthKey: env.MCP_AUTH_KEY || s(reach.mcp_auth_key),
    };

    return new ConfigManager(config, apcoreConfig);
  }

  getConfig(): ReachforgeConfig {
    return { ...this.config };
  }

  /** Return the underlying apcore Config instance (for mcp/cli namespace access). */
  getApcoreConfig(): Config {
    return this._apcoreConfig;
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

  // ── Internal helpers ────────────────────────────────────────────────────

  private static async readYaml(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Normalise config data to namespace mode.
   * If the data already has an 'apcore' key (namespace mode), return as-is.
   * Otherwise wrap flat keys into a 'reach' namespace section.
   */
  private static normaliseToNamespace(data: Record<string, unknown>): Record<string, unknown> {
    if (data.apcore !== undefined && typeof data.apcore === 'object') {
      // Already namespace mode
      return data;
    }
    // Legacy flat format → wrap into reach namespace
    const { default_workspace, ...reachFields } = data;
    const result: Record<string, unknown> = { apcore: {} };
    if (Object.keys(reachFields).length > 0) {
      result.reach = reachFields;
    }
    return result;
  }

  /**
   * Extract the reach section from a config file.
   * Supports both namespace mode (has 'reach' key) and flat format.
   */
  private static extractReachSection(data: Record<string, unknown>): Record<string, unknown> {
    if (data.reach && typeof data.reach === 'object' && !Array.isArray(data.reach)) {
      return data.reach as Record<string, unknown>;
    }
    // Flat format: everything except non-reach keys
    const { default_workspace, apcore, ...rest } = data;
    return rest;
  }
}

/** Coerce unknown value to string | undefined. */
function s(v: unknown): string | undefined {
  return v != null ? String(v) : undefined;
}

/** Coerce unknown value to number | undefined. */
function n(v: unknown): number | undefined {
  if (v == null) return undefined;
  const num = Number(v);
  return isNaN(num) ? undefined : num;
}
