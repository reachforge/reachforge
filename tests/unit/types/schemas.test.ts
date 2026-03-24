import { describe, test, expect } from 'vitest';
import {
  CredentialsSchema,
} from '../../../src/types/index.js';
import {
  ArticleMetaSchema,
  MultiArticleProjectMetaSchema,
  PlatformPublishStatusSchema,
} from '../../../src/types/schemas.js';

describe('ArticleMetaSchema', () => {
  test('validates a complete article meta', () => {
    const result = ArticleMetaSchema.safeParse({
      status: 'drafted',
      schedule: '2026-03-25T09:00',
      adapted_platforms: ['x', 'devto'],
    });
    expect(result.success).toBe(true);
  });

  test('validates minimal meta (only status)', () => {
    const result = ArticleMetaSchema.safeParse({
      status: 'inbox',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid status', () => {
    const result = ArticleMetaSchema.safeParse({
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  test('validates platforms map with publish results', () => {
    const result = ArticleMetaSchema.safeParse({
      status: 'published',
      platforms: {
        x: { status: 'success', url: 'https://x.com/post/123' },
        devto: { status: 'failed', error: 'Rate limit exceeded' },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('PlatformPublishStatusSchema', () => {
  test('validates success status with url', () => {
    const result = PlatformPublishStatusSchema.safeParse({
      status: 'success',
      url: 'https://dev.to/test',
      published_at: '2026-03-25T09:05:00Z',
    });
    expect(result.success).toBe(true);
  });

  test('validates failed status with error', () => {
    const result = PlatformPublishStatusSchema.safeParse({
      status: 'failed',
      error: 'API rate limit',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid status', () => {
    const result = PlatformPublishStatusSchema.safeParse({
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});

describe('MultiArticleProjectMetaSchema', () => {
  test('validates complete project meta with multiple articles', () => {
    const result = MultiArticleProjectMetaSchema.safeParse({
      articles: {
        teaser: { status: 'scheduled', schedule: '2026-03-25T09:00' },
        'deep-dive': { status: 'adapted' },
      },
    });
    expect(result.success).toBe(true);
  });

  test('defaults articles to empty object', () => {
    const result = MultiArticleProjectMetaSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.articles).toEqual({});
    }
  });

  test('validates _locks map', () => {
    const result = MultiArticleProjectMetaSchema.safeParse({
      articles: { teaser: { status: 'scheduled' } },
      _locks: {
        teaser: { pid: 12345, started_at: '2026-03-25T09:00:00Z', hostname: 'test' },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('CredentialsSchema', () => {
  test('validates with all keys present', () => {
    const result = CredentialsSchema.safeParse({
      gemini_api_key: 'AIza-test',
      devto_api_key: 'abc123',
      postiz_api_key: 'pz_test',
    });
    expect(result.success).toBe(true);
  });

  test('validates empty object (all keys optional)', () => {
    const result = CredentialsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('rejects empty string for present key', () => {
    const result = CredentialsSchema.safeParse({
      gemini_api_key: '',
    });
    expect(result.success).toBe(false);
  });
});
