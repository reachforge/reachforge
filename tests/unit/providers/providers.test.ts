import { describe, test, expect, vi } from 'vitest';
import { MockProvider } from '../../../src/providers/mock.js';
import { DevtoProvider } from '../../../src/providers/devto.js';
import { PostizProvider } from '../../../src/providers/postiz.js';
import { HashnodeProvider } from '../../../src/providers/hashnode.js';
import { GitHubProvider } from '../../../src/providers/github.js';
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

  test('validates content with frontmatter title', () => {
    expect(devto.validate('---\ntitle: My Post\n---\nContent').valid).toBe(true);
  });

  test('rejects content without frontmatter block', () => {
    const result = devto.validate('# My Article\n\nContent here');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('frontmatter');
  });

  test('rejects content without title in frontmatter', () => {
    const result = devto.validate('---\ntags: [js]\n---\nContent');
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

describe('HashnodeProvider', () => {
  const hashnode = new HashnodeProvider('test-api-key', 'pub-123');

  test('validates content with H1 title', () => {
    expect(hashnode.validate('# My Article\n\nContent').valid).toBe(true);
  });

  test('validates content with frontmatter title', () => {
    expect(hashnode.validate('---\ntitle: My Post\n---\nContent').valid).toBe(true);
  });

  test('rejects content without title', () => {
    const result = hashnode.validate('Just body content without heading');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing title');
  });

  test('rejects empty content', () => {
    expect(hashnode.validate('').valid).toBe(false);
  });

  test('formatContent returns content unchanged', () => {
    expect(hashnode.formatContent('# Test')).toBe('# Test');
  });

  test('publish sends GraphQL mutation and returns URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          createPublicationStory: {
            post: { slug: 'my-article', publication: { domain: 'blog.example.com' } },
          },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await hashnode.publish('# My Article\n\nContent', {});
    expect(result.status).toBe('success');
    expect(result.url).toBe('https://blog.example.com/my-article');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gql.hashnode.com',
      expect.objectContaining({ method: 'POST' })
    );

    vi.unstubAllGlobals();
  });

  test('publish returns failed status on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }));

    const result = await hashnode.publish('# Article\n\nContent', {});
    expect(result.status).toBe('failed');

    vi.unstubAllGlobals();
  });
});

describe('GitHubProvider', () => {
  const github = new GitHubProvider('test-token', { owner: 'myorg', repo: 'myrepo', category: 'General' });

  test('validates content with H1 title', () => {
    expect(github.validate('# My Discussion\n\nBody').valid).toBe(true);
  });

  test('rejects content without H1 title', () => {
    const result = github.validate('Just body content');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing title');
  });

  test('rejects empty content', () => {
    expect(github.validate('').valid).toBe(false);
  });

  test('formatContent returns content unchanged', () => {
    expect(github.formatContent('# Test')).toBe('# Test');
  });

  test('publish resolves repo/category IDs then creates discussion', async () => {
    const repoResponse = JSON.stringify({
      data: {
        repository: {
          id: 'repo-123',
          discussionCategories: {
            nodes: [{ id: 'cat-456', name: 'General' }],
          },
        },
      },
    });
    const createResponse = JSON.stringify({
      data: {
        createDiscussion: {
          discussion: { url: 'https://github.com/myorg/myrepo/discussions/1', id: 'disc-789' },
        },
      },
    });

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        text: async () => callCount === 1 ? repoResponse : createResponse,
      };
    }));

    const result = await github.publish('# My Discussion\n\nBody', {});
    expect(result.status).toBe('success');
    expect(result.url).toBe('https://github.com/myorg/myrepo/discussions/1');
    expect(callCount).toBe(2);

    vi.unstubAllGlobals();
  });

  test('publish returns failed when category not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          repository: {
            id: 'repo-123',
            discussionCategories: { nodes: [{ id: 'cat-1', name: 'Other' }] },
          },
        },
      }),
    }));

    const result = await github.publish('# My Discussion\n\nBody', {});
    expect(result.status).toBe('failed');
    expect(result.error).toContain('not found');

    vi.unstubAllGlobals();
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

  test('loads HashnodeProvider when API key and publication ID are present', () => {
    const config: AphypeConfig = { hashnodeApiKey: 'key', hashnodePublicationId: 'pub-123' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('hashnode')).toBe(true);
    expect(loader.listRegistered()).toContain('hashnode');
  });

  test('does not load HashnodeProvider when publication ID is missing', () => {
    const config: AphypeConfig = { hashnodeApiKey: 'key' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('hashnode')).toBe(false);
  });

  test('loads GitHubProvider when token, owner, and repo are present', () => {
    const config: AphypeConfig = { githubToken: 'token', githubOwner: 'org', githubRepo: 'repo' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('github')).toBe(true);
    expect(loader.listRegistered()).toContain('github');
  });

  test('does not load GitHubProvider when owner is missing', () => {
    const config: AphypeConfig = { githubToken: 'token', githubRepo: 'repo' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('github')).toBe(false);
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
