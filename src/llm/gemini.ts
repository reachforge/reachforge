import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider, GenerateOptions, AdaptOptions, LLMResult } from './types.js';
import { PLATFORM_PROMPTS, DEFAULT_DRAFT_PROMPT } from './types.js';
import { LLMError } from '../types/index.js';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(apiKey: string, modelName: string = 'gemini-pro') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generate(content: string, options: GenerateOptions = {}): Promise<LLMResult> {
    const prompt = `${DEFAULT_DRAFT_PROMPT}\n\nIDEA: ${content}`;
    return this.callModel(prompt, options);
  }

  async adapt(content: string, options: AdaptOptions): Promise<LLMResult> {
    const platformPrompt = PLATFORM_PROMPTS[options.platform];
    if (!platformPrompt) {
      throw new LLMError(
        `Unknown platform "${options.platform}" for adaptation.`,
        `Supported platforms: ${Object.keys(PLATFORM_PROMPTS).join(', ')}`,
      );
    }

    const prompt = `${platformPrompt}\n\nCONTENT:\n${content}`;
    return this.callModel(prompt, options);
  }

  private async callModel(prompt: string, options: GenerateOptions): Promise<LLMResult> {
    try {
      const model = this.client.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new LLMError(
          'AI generation returned empty content.',
          'Try again or check your input.',
        );
      }

      return {
        content: text,
        model: this.modelName,
        provider: this.name,
        tokenUsage: {
          prompt: 0,
          completion: 0,
        },
      };
    } catch (err: unknown) {
      if (err instanceof LLMError) throw err;

      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('timed out') || message.includes('timeout')) {
        throw new LLMError('AI generation failed: request timed out.', 'Check your network connection and try again.');
      }
      if (message.includes('API key') || message.includes('401') || message.includes('403')) {
        throw new LLMError('AI generation failed: invalid API key.', 'Check your GEMINI_API_KEY in .env file.');
      }
      throw new LLMError(`AI generation failed: ${message}`);
    }
  }
}
