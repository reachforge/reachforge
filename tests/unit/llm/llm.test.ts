import { describe, test, expect } from 'vitest';
import type { LLMProvider, GenerateOptions, AdaptOptions, LLMResult } from '../../../src/llm/index.js';
import { PLATFORM_PROMPTS, DEFAULT_DRAFT_PROMPT } from '../../../src/llm/index.js';
import { LLMError } from '../../../src/types/index.js';

// Mock LLM provider for testing
class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  public lastPrompt = '';
  public shouldFail = false;
  public shouldReturnEmpty = false;
  public response = 'Generated content here.';

  async generate(content: string, options: GenerateOptions = {}): Promise<LLMResult> {
    this.lastPrompt = `${DEFAULT_DRAFT_PROMPT}\n\nIDEA: ${content}`;
    if (this.shouldFail) throw new LLMError('Mock failure');
    if (this.shouldReturnEmpty) throw new LLMError('AI generation returned empty content.');
    return {
      content: this.response,
      model: 'mock-model',
      provider: this.name,
      tokenUsage: { prompt: 10, completion: 20 },
    };
  }

  async adapt(content: string, options: AdaptOptions): Promise<LLMResult> {
    const platformPrompt = PLATFORM_PROMPTS[options.platform];
    if (!platformPrompt) throw new LLMError(`Unknown platform "${options.platform}"`);
    this.lastPrompt = `${platformPrompt}\n\nCONTENT:\n${content}`;
    if (this.shouldFail) throw new LLMError('Mock failure');
    return {
      content: `Adapted for ${options.platform}: ${content.substring(0, 50)}`,
      model: 'mock-model',
      provider: this.name,
      tokenUsage: { prompt: 10, completion: 20 },
    };
  }
}

describe('MockLLMProvider (interface compliance)', () => {
  test('generate returns LLMResult', async () => {
    const provider = new MockLLMProvider();
    const result = await provider.generate('Build a CLI tool');
    expect(result.content).toBe('Generated content here.');
    expect(result.model).toBe('mock-model');
    expect(result.provider).toBe('mock');
    expect(result.tokenUsage.prompt).toBe(10);
  });

  test('generate includes draft prompt', async () => {
    const provider = new MockLLMProvider();
    await provider.generate('Test idea');
    expect(provider.lastPrompt).toContain(DEFAULT_DRAFT_PROMPT);
    expect(provider.lastPrompt).toContain('Test idea');
  });

  test('adapt returns platform-specific content', async () => {
    const provider = new MockLLMProvider();
    const result = await provider.adapt('Full article content here', { platform: 'x' });
    expect(result.content).toContain('Adapted for x');
  });

  test('adapt throws for unknown platform', async () => {
    const provider = new MockLLMProvider();
    await expect(provider.adapt('content', { platform: 'tiktok' })).rejects.toThrow(LLMError);
  });

  test('adapt uses correct platform prompt', async () => {
    const provider = new MockLLMProvider();
    await provider.adapt('content', { platform: 'devto' });
    expect(provider.lastPrompt).toContain(PLATFORM_PROMPTS.devto);
  });

  test('generate throws LLMError on failure', async () => {
    const provider = new MockLLMProvider();
    provider.shouldFail = true;
    await expect(provider.generate('test')).rejects.toThrow(LLMError);
  });

  test('generate throws on empty response', async () => {
    const provider = new MockLLMProvider();
    provider.shouldReturnEmpty = true;
    await expect(provider.generate('test')).rejects.toThrow('empty content');
  });
});

describe('PLATFORM_PROMPTS', () => {
  test('has prompts for all core platforms', () => {
    expect(PLATFORM_PROMPTS.x).toBeDefined();
    expect(PLATFORM_PROMPTS.wechat).toBeDefined();
    expect(PLATFORM_PROMPTS.zhihu).toBeDefined();
    expect(PLATFORM_PROMPTS.devto).toBeDefined();
    expect(PLATFORM_PROMPTS.hashnode).toBeDefined();
  });

  test('x prompt mentions thread and 280 chars', () => {
    expect(PLATFORM_PROMPTS.x).toContain('thread');
    expect(PLATFORM_PROMPTS.x).toContain('280');
  });

  test('x prompt specifies --- delimiter', () => {
    expect(PLATFORM_PROMPTS.x).toContain('---');
  });
});

describe('Parallel adaptation', () => {
  test('multiple platforms can be adapted concurrently via Promise.all', async () => {
    const provider = new MockLLMProvider();
    const content = 'Master article about Bun runtime performance';
    const platforms = ['x', 'wechat', 'zhihu', 'devto'];

    const results = await Promise.all(
      platforms.map(platform => provider.adapt(content, { platform }))
    );

    expect(results).toHaveLength(4);
    expect(results[0].content).toContain('Adapted for x');
    expect(results[1].content).toContain('Adapted for wechat');
    expect(results[2].content).toContain('Adapted for zhihu');
    expect(results[3].content).toContain('Adapted for devto');
  });
});
