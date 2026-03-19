import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';

export class MockProvider implements PlatformProvider {
  readonly id = 'mock';
  readonly name = 'Mock Provider';
  readonly platforms = ['x', 'wechat', 'zhihu', 'devto', 'hashnode', 'github'];
  readonly contentFormat: ContentFormat = 'markdown';

  validate(content: string): ValidationResult {
    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['Content is empty'] };
    }
    return { valid: true, errors: [] };
  }

  async publish(content: string, meta: PublishMeta): Promise<PublishResult> {
    const id = Math.random().toString(36).substring(7);
    // Clearly warn this is mock mode
    console.warn(`⚠ [MOCK MODE] No real API call — content not actually published.`);
    return {
      platform: 'mock',
      status: 'success',
      url: `https://mock.reachforge.dev/post/${id}`,
    };
  }

  formatContent(content: string): string {
    return content;
  }
}
