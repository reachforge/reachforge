import { fileURLToPath } from 'url';
import * as path from 'path';
import type { LLMProvider, CLIAdapter } from './types.js';
import { GeminiProvider } from './gemini.js';
import { LLMNotConfiguredError, AdapterNotFoundError } from '../types/index.js';
import type { ConfigManager } from '../core/config.js';
import { ClaudeAdapter } from './adapters/claude.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { CodexAdapter } from './adapters/codex.js';
import { SkillResolver } from './skills.js';

const VALID_ADAPTERS = ['claude', 'gemini', 'codex'] as const;
type AdapterName = (typeof VALID_ADAPTERS)[number];

const DEFAULT_COMMANDS: Record<AdapterName, string> = {
  claude: 'claude',
  gemini: 'gemini',
  codex: 'codex',
};

const _builtInSkillsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../skills',
);

/** @deprecated Use AdapterFactory instead */
export class LLMFactory {
  static create(config: ConfigManager): LLMProvider {
    const fullConfig = config.getConfig();
    const model = config.getLLMModel();

    if (fullConfig.geminiApiKey) {
      return new GeminiProvider(fullConfig.geminiApiKey, model);
    }

    throw new LLMNotConfiguredError('Gemini');
  }

  static createFromApiKey(apiKey: string, model?: string): LLMProvider {
    return new GeminiProvider(apiKey, model);
  }
}

export class AdapterFactory {
  static create(
    stage: string,
    opts?: { workspaceDir?: string; projectDir?: string },
  ): { adapter: CLIAdapter; resolver: SkillResolver } {
    const name = AdapterFactory.resolveAdapterName(stage);

    if (!VALID_ADAPTERS.includes(name as AdapterName)) {
      throw new AdapterNotFoundError(name);
    }

    const envKey = `APHYPE_${name.toUpperCase()}_COMMAND`;
    const command = process.env[envKey] || DEFAULT_COMMANDS[name as AdapterName];

    let adapter: CLIAdapter;
    switch (name) {
      case 'claude':
        adapter = new ClaudeAdapter(command);
        break;
      case 'gemini':
        adapter = new GeminiAdapter(command);
        break;
      case 'codex':
        adapter = new CodexAdapter(command);
        break;
      default:
        throw new AdapterNotFoundError(name);
    }

    const resolver = new SkillResolver(
      _builtInSkillsDir,
      opts?.workspaceDir ?? '',
      opts?.projectDir ?? '',
    );

    return { adapter, resolver };
  }

  private static resolveAdapterName(stage: string): string {
    // Stage-specific env vars take priority
    if (stage === 'draft' && process.env.APHYPE_DRAFT_ADAPTER) {
      return process.env.APHYPE_DRAFT_ADAPTER;
    }
    if (stage === 'adapt' && process.env.APHYPE_ADAPT_ADAPTER) {
      return process.env.APHYPE_ADAPT_ADAPTER;
    }
    // General adapter setting
    return process.env.APHYPE_LLM_ADAPTER || 'claude';
  }
}
