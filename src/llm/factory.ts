import type { LLMProvider } from './types.js';
import { GeminiProvider } from './gemini.js';
import { LLMNotConfiguredError, AphypeError } from '../types/index.js';
import type { ConfigManager } from '../core/config.js';

export class LLMFactory {
  static create(config: ConfigManager): LLMProvider {
    const fullConfig = config.getConfig();
    const model = config.getLLMModel();

    // For now, only Gemini is supported. Future: detect from config.
    if (fullConfig.geminiApiKey) {
      return new GeminiProvider(fullConfig.geminiApiKey, model);
    }

    throw new LLMNotConfiguredError('Gemini');
  }

  static createFromApiKey(apiKey: string, model?: string): LLMProvider {
    return new GeminiProvider(apiKey, model);
  }
}
