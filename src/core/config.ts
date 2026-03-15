import * as path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import dotenv from 'dotenv';
import type { AphypeConfig } from '../types/index.js';
import { CredentialsSchema } from '../types/index.js';
import { DEFAULT_LLM_MODEL } from './constants.js';

export class ConfigManager {
  private constructor(private readonly config: AphypeConfig) {}

  static async load(workingDir: string): Promise<ConfigManager> {
    // Tier 3 (lowest): credentials.yaml
    let fileConfig: Record<string, string | undefined> = {};
    const credPath = path.join(workingDir, 'credentials.yaml');
    if (await fs.pathExists(credPath)) {
      try {
        const raw = await fs.readFile(credPath, 'utf-8');
        const parsed = yaml.load(raw);
        const result = CredentialsSchema.safeParse(parsed);
        if (result.success) {
          fileConfig = result.data as Record<string, string | undefined>;
        }
      } catch {
        // Silently skip invalid credentials.yaml (YAML parse error)
      }
    }

    // Tier 2: .env file
    dotenv.config({ path: path.join(workingDir, '.env') });

    // Tier 1 (highest): environment variables — merged below
    const config: AphypeConfig = {
      geminiApiKey: process.env.GEMINI_API_KEY || fileConfig.gemini_api_key,
      devtoApiKey: process.env.DEVTO_API_KEY || fileConfig.devto_api_key,
      postizApiKey: process.env.POSTIZ_API_KEY || fileConfig.postiz_api_key,
      hashnodeApiKey: process.env.HASHNODE_API_KEY || fileConfig.hashnode_api_key,
      hashnodePublicationId: process.env.HASHNODE_PUBLICATION_ID || fileConfig.hashnode_publication_id,
      githubToken: process.env.GITHUB_TOKEN || fileConfig.github_token,
      githubOwner: process.env.GITHUB_OWNER || fileConfig.github_owner,
      githubRepo: process.env.GITHUB_REPO || fileConfig.github_repo,
      githubDiscussionCategory: process.env.GITHUB_DISCUSSION_CATEGORY || fileConfig.github_discussion_category,
      llmModel: process.env.APHYPE_LLM_MODEL || DEFAULT_LLM_MODEL,
      mcpAuthKey: process.env.MCP_AUTH_KEY,
    };

    return new ConfigManager(config);
  }

  getConfig(): AphypeConfig {
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
