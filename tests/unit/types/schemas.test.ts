import { describe, test, expect } from 'vitest';
import {
  ProjectMetaSchema,
  ReceiptSchema,
  CredentialsSchema,
} from '../../../src/types/index.js';

describe('ProjectMetaSchema', () => {
  test('validates a complete meta object', () => {
    const result = ProjectMetaSchema.safeParse({
      article: 'my-article',
      status: 'drafted',
      publish_date: '2026-03-20',
      adapted_platforms: ['x', 'devto'],
    });
    expect(result.success).toBe(true);
  });

  test('validates minimal meta (only required fields)', () => {
    const result = ProjectMetaSchema.safeParse({
      article: 'test',
      status: 'inbox',
    });
    expect(result.success).toBe(true);
  });

  test('rejects empty article', () => {
    const result = ProjectMetaSchema.safeParse({
      article: '',
      status: 'drafted',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid status', () => {
    const result = ProjectMetaSchema.safeParse({
      article: 'test',
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid date format', () => {
    const result = ProjectMetaSchema.safeParse({
      article: 'test',
      status: 'scheduled',
      publish_date: '03/20/2026',
    });
    expect(result.success).toBe(false);
  });

  test('validates platforms map with status', () => {
    const result = ProjectMetaSchema.safeParse({
      article: 'test',
      status: 'published',
      platforms: {
        x: { status: 'success', url: 'https://x.com/post/123' },
        devto: { status: 'failed', error: 'Rate limit exceeded' },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('ReceiptSchema', () => {
  test('validates a complete receipt', () => {
    const result = ReceiptSchema.safeParse({
      published_at: '2026-03-20T10:30:00Z',
      items: [
        { platform: 'devto', status: 'success', url: 'https://dev.to/user/post' },
        { platform: 'x', status: 'failed', error: 'Rate limit' },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rejects receipt with no items', () => {
    const result = ReceiptSchema.safeParse({
      published_at: '2026-03-20T10:30:00Z',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid platform status', () => {
    const result = ReceiptSchema.safeParse({
      published_at: '2026-03-20T10:30:00Z',
      items: [{ platform: 'devto', status: 'pending' }],
    });
    expect(result.success).toBe(false);
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
