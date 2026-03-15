import { describe, test, expect, vi } from 'vitest';
import { MockProvider } from '../../../src/providers/mock.js';
import { DevtoProvider } from '../../../src/providers/devto.js';
import { PostizProvider } from '../../../src/providers/postiz.js';
import { ProviderLoader } from '../../../src/providers/loader.js';
import type { AphypeConfig } from '../../../src/types/index.js';

describe('MockProvider', () => {
  const mock = new MockProvider();

  test('validates non-empty content', () => {
    expect(mock.validate('hello').valid).toBe(true);
  });

  test('rejects empty content', () => {
    const result = mock.validate('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Content is empty');
  });

  test('publish returns mock URL with warning', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await mock.publish('content', {});
    expect(result.status).toBe('success');
    expect(result.url).toContain('mock.aphype.dev');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('MOCK MODE'));
    vi.restoreAllMocks();
  });

  test('supports all platforms', () => {
    expect(mock.platforms).toContain('x');
    expect(mock.platforms).toContain('devto');
    expect(mock.platforms).toContain('wechat');
  });
});

describe('DevtoProvider', () => {
  const devto = new DevtoProvider('test-api-key');

  test('validates content with heading', () => {
    expect(devto.validate('# My Article\n\nContent here').valid).toBe(true);
  });

  test('validates content with frontmatter title', () => {
    expect(devto.validate('---\ntitle: My Post\n---\nContent').valid).toBe(true);
  });

  test('rejects content without title', () => {
    const result = devto.validate('Just some content without a heading');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('title');
  });

  test('rejects empty content', () => {
    const result = devto.validate('');
    expect(result.valid).toBe(false);
  });

  test('formatContent returns content unchanged', () => {
    expect(devto.formatContent('# Test')).toBe('# Test');
  });
});

describe('PostizProvider', () => {
  const postiz = new PostizProvider('test-api-key');

  test('validates thread with segments under 280 chars', () => {
    const thread = 'First tweet about Bun.\n---\nSecond tweet about performance.';
    expect(postiz.validate(thread).valid).toBe(true);
  });

  test('validates single post under 280 chars', () => {
    expect(postiz.validate('Just a simple tweet.').valid).toBe(true);
  });

  test('rejects thread segment over 280 chars', () => {
    const longSegment = 'a'.repeat(281);
    const thread = `Short tweet\n---\n${longSegment}`;
    const result = postiz.validate(thread);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds 280');
    expect(result.errors[0]).toContain('found: 281');
  });

  test('validates thread at exactly 280 chars', () => {
    const exactSegment = 'a'.repeat(280);
    expect(postiz.validate(exactSegment).valid).toBe(true);
  });

  test('rejects empty content', () => {
    expect(postiz.validate('').valid).toBe(false);
  });

  test('ignores empty segments between delimiters', () => {
    const thread = 'First tweet\n---\n---\nThird tweet';
    expect(postiz.validate(thread).valid).toBe(true);
  });
});

describe('ProviderLoader', () => {
  test('loads DevtoProvider when API key is present', () => {
    const config: AphypeConfig = { devtoApiKey: 'test-key' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('devto')).toBe(true);
    expect(loader.listRegistered()).toContain('devto');
  });

  test('loads PostizProvider when API key is present', () => {
    const config: AphypeConfig = { postizApiKey: 'test-key' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('x')).toBe(true);
    expect(loader.listRegistered()).toContain('postiz');
  });

  test('returns MockProvider when no real provider available', () => {
    const config: AphypeConfig = {};
    const loader = new ProviderLoader(config);
    const provider = loader.getProviderOrMock('x');
    expect(provider.id).toBe('mock');
  });

  test('loads multiple providers from config', () => {
    const config: AphypeConfig = { devtoApiKey: 'key1', postizApiKey: 'key2' };
    const loader = new ProviderLoader(config);
    expect(loader.size).toBe(2); // devto + x
    expect(loader.hasRealProvider('devto')).toBe(true);
    expect(loader.hasRealProvider('x')).toBe(true);
  });

  test('returns undefined for unregistered platform', () => {
    const config: AphypeConfig = {};
    const loader = new ProviderLoader(config);
    expect(loader.getProvider('linkedin')).toBeUndefined();
  });
});
