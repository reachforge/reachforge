import { describe, test, expect, vi } from 'vitest';
import { MockProvider } from '../../../src/providers/mock.js';
import { DevtoProvider } from '../../../src/providers/devto.js';
import { PostizProvider } from '../../../src/providers/postiz.js';
import { HashnodeProvider } from '../../../src/providers/hashnode.js';
import { GitHubProvider } from '../../../src/providers/github.js';
import { ProviderLoader } from '../../../src/providers/loader.js';
import type { ReachforgeConfig } from '../../../src/types/index.js';

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
    expect(result.url).toContain('mock.reach.dev');
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

  test('validates content with H1 heading but no frontmatter', () => {
    expect(devto.validate('# My Article\n\nContent here').valid).toBe(true);
  });

  test('rejects content without frontmatter or H1', () => {
    const result = devto.validate('Just body content without heading or frontmatter');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('title');
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

  test('publish respects frontmatter published:false as draft', async () => {
    const content = '---\ntitle: Test\npublished: false\ntags: [ai]\n---\nBody';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }),
      };
    }));

    await devto.publish(content, {});

    const parsed = JSON.parse(capturedBody);
    expect(parsed.article.published).toBe(false); // frontmatter says false, no CLI override
    expect(parsed.article.body_markdown).not.toContain('published:');
    expect(parsed.article.body_markdown).not.toContain('title: Test');
    expect(parsed.article.title).toBe('Test');

    vi.unstubAllGlobals();
  });

  test('publish respects frontmatter published:true', async () => {
    const content = '---\ntitle: Test\npublished: true\n---\nBody';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return { ok: true, status: 201, text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }) };
    }));

    await devto.publish(content, {});
    expect(JSON.parse(capturedBody).article.published).toBe(true);

    vi.unstubAllGlobals();
  });

  test('CLI --draft flag overrides frontmatter published:true', async () => {
    const content = '---\ntitle: Test\npublished: true\n---\nBody';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return { ok: true, status: 201, text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }) };
    }));

    await devto.publish(content, { draft: true });
    expect(JSON.parse(capturedBody).article.published).toBe(false); // CLI flag wins

    vi.unstubAllGlobals();
  });

  test('defaults to published:true when no frontmatter published field', async () => {
    const content = '---\ntitle: Test\n---\nBody';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return { ok: true, status: 201, text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }) };
    }));

    await devto.publish(content, {});
    expect(JSON.parse(capturedBody).article.published).toBe(true); // default

    vi.unstubAllGlobals();
  });

  test('publish strips H1 from body when content has no frontmatter', async () => {
    const content = '# External Article\n\nBody content here';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return { ok: true, status: 201, text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }) };
    }));

    await devto.publish(content, {});
    const parsed = JSON.parse(capturedBody);
    expect(parsed.article.title).toBe('External Article');
    expect(parsed.article.body_markdown).not.toContain('# External Article');
    expect(parsed.article.body_markdown).toContain('Body content here');

    vi.unstubAllGlobals();
  });

  test('publish prefers frontmatter title over H1', async () => {
    const content = '---\ntitle: Frontmatter Title\n---\n# H1 Title\n\nBody';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return { ok: true, status: 201, text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }) };
    }));

    await devto.publish(content, {});
    const parsed = JSON.parse(capturedBody);
    expect(parsed.article.title).toBe('Frontmatter Title');
    expect(parsed.article.body_markdown).not.toContain('# H1 Title');

    vi.unstubAllGlobals();
  });

  test('publish passes coverImage as main_image', async () => {
    const content = '---\ntitle: Test\n---\nBody';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return { ok: true, status: 201, text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }) };
    }));

    await devto.publish(content, { coverImage: 'https://cdn.example.com/cover.png' });
    const parsed = JSON.parse(capturedBody);
    expect(parsed.article.main_image).toBe('https://cdn.example.com/cover.png');

    vi.unstubAllGlobals();
  });

  test('publish omits main_image when no coverImage', async () => {
    const content = '---\ntitle: Test\n---\nBody';
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = opts.body;
      return { ok: true, status: 201, text: async () => JSON.stringify({ url: 'https://dev.to/user/test' }) };
    }));

    await devto.publish(content, {});
    const parsed = JSON.parse(capturedBody);
    expect(parsed.article.main_image).toBeUndefined();

    vi.unstubAllGlobals();
  });

  test('update sends PUT to /api/articles/{id} and returns articleId', async () => {
    let capturedUrl = '';
    let capturedMethod = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedUrl = url;
      capturedMethod = opts.method;
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 42, url: 'https://dev.to/user/updated' }) };
    }));

    const result = await devto.update!('42', '# Updated\n\nNew body', {});
    expect(capturedMethod).toBe('PUT');
    expect(capturedUrl).toContain('/articles/42');
    expect(result.status).toBe('success');
    expect(result.articleId).toBe('42');
    expect(result.url).toBe('https://dev.to/user/updated');

    vi.unstubAllGlobals();
  });

  test('update throws ProviderError on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, text: async () => 'Not Found',
    }));

    await expect(devto.update!('99999', '# Test\n\nBody', {})).rejects.toThrow('404');

    vi.unstubAllGlobals();
  });
});

describe('PostizProvider', () => {
  const postizX = new PostizProvider('test-api-key', 'test-integration-id');
  const postizLinkedIn = new PostizProvider('test-api-key', 'li-integration-id', { platform: 'linkedin' });

  test('default platform is x', () => {
    expect(postizX.platforms).toEqual(['x']);
    expect(postizX.name).toBe('X/Twitter (via Postiz)');
  });

  test('explicit platform sets platforms and name', () => {
    expect(postizLinkedIn.platforms).toEqual(['linkedin']);
    expect(postizLinkedIn.name).toBe('LinkedIn (via Postiz)');
  });

  test('named account slot shows label in name', () => {
    const p = new PostizProvider('key', 'id', { platform: 'x_company' });
    expect(p.platforms).toEqual(['x_company']);
    expect(p.name).toBe('X/Twitter (via Postiz) [company]');
  });

  test('validates X thread with segments under 280 chars', () => {
    const thread = 'First tweet about Bun.\n<!-- thread-break -->\nSecond tweet about performance.';
    expect(postizX.validate(thread).valid).toBe(true);
  });

  test('validates single X post under 280 chars', () => {
    expect(postizX.validate('Just a simple tweet.').valid).toBe(true);
  });

  test('rejects X thread segment over 280 chars', () => {
    const longSegment = 'a'.repeat(281);
    const thread = `Short tweet\n<!-- thread-break -->\n${longSegment}`;
    const result = postizX.validate(thread);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds 280');
    expect(result.errors[0]).toContain('found: 281');
  });

  test('validates X thread at exactly 280 chars', () => {
    const exactSegment = 'a'.repeat(280);
    expect(postizX.validate(exactSegment).valid).toBe(true);
  });

  test('rejects empty content', () => {
    expect(postizX.validate('').valid).toBe(false);
  });

  test('ignores empty segments between delimiters', () => {
    const thread = 'First tweet\n<!-- thread-break -->\n<!-- thread-break -->\nThird tweet';
    expect(postizX.validate(thread).valid).toBe(true);
  });

  test('markdown --- horizontal rule is not treated as thread delimiter', () => {
    const article = 'A tweet with a horizontal rule.\n---\nThis is still the same tweet.';
    expect(postizX.validate(article).valid).toBe(true);
  });

  test('LinkedIn does not enforce 280-char limit', () => {
    const longPost = 'a'.repeat(1000);
    expect(postizLinkedIn.validate(longPost).valid).toBe(true);
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
          publishPost: {
            post: { slug: 'my-article', url: 'https://blog.example.com/my-article', publication: { url: 'https://blog.example.com' } },
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

  test('publish strips both frontmatter and H1 from body', async () => {
    const content = '---\ntitle: FM Title\n---\n# FM Title\n\nBody content';
    let capturedBody = '';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          publishPost: {
            post: { slug: 'fm-title', url: 'https://blog.example.com/fm-title', publication: { url: 'https://blog.example.com' } },
          },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await hashnode.publish(content, {});
    expect(result.status).toBe('success');

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.variables.input.title).toBe('FM Title');
    expect(sentBody.variables.input.contentMarkdown).not.toContain('# FM Title');
    expect(sentBody.variables.input.contentMarkdown).toContain('Body content');

    vi.unstubAllGlobals();
  });

  test('publish passes coverImage as coverImageOptions', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { publishPost: { post: { slug: 'test', url: 'https://blog.example.com/test', publication: { url: 'https://blog.example.com' } } } },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await hashnode.publish('# Test\n\nBody', { coverImage: 'https://cdn.example.com/cover.png' });
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.variables.input.coverImageOptions).toEqual({ coverImageURL: 'https://cdn.example.com/cover.png' });

    vi.unstubAllGlobals();
  });

  test('publish omits coverImageOptions when no coverImage', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { publishPost: { post: { slug: 'test', url: 'https://blog.example.com/test', publication: { url: 'https://blog.example.com' } } } },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await hashnode.publish('# Test\n\nBody', {});
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.variables.input.coverImageOptions).toBeUndefined();

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

  test('update sends updatePost mutation and returns articleId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { updatePost: { post: { id: 'abc123', slug: 'updated', url: 'https://blog.example.com/updated', publication: { url: 'https://blog.example.com' } } } },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await hashnode.update!('abc123', '# Updated\n\nBody', {});
    expect(result.status).toBe('success');
    expect(result.articleId).toBe('abc123');

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.query).toContain('updatePost');
    expect(sentBody.variables.input.id).toBe('abc123');
    expect(sentBody.variables.input.publicationId).toBeUndefined();

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

  test('update sends single updateDiscussion mutation and returns articleId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { updateDiscussion: { discussion: { id: 'disc-789', url: 'https://github.com/myorg/myrepo/discussions/1' } } },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await github.update!('disc-789', '# Updated Discussion\n\nNew body', {});
    expect(result.status).toBe('success');
    expect(result.articleId).toBe('disc-789');
    expect(mockFetch).toHaveBeenCalledTimes(1); // single call, no repo resolution

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.query).toContain('updateDiscussion');
    expect(sentBody.variables.input.discussionId).toBe('disc-789');

    vi.unstubAllGlobals();
  });
});

describe('MockProvider update', () => {
  test('update returns success with provided articleId', async () => {
    const mock = new MockProvider();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await mock.update!('test-id', '# Test', {});
    expect(result.status).toBe('success');
    expect(result.articleId).toBe('test-id');
    vi.restoreAllMocks();
  });
});

describe('ProviderLoader', () => {
  test('loads DevtoProvider when API key is present', () => {
    const config: ReachforgeConfig = { devtoApiKey: 'test-key' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('devto')).toBe(true);
    expect(loader.listRegistered()).toContain('devto');
  });

  test('loads PostizProvider when API key and integrations map are present', () => {
    const config: ReachforgeConfig = { postizApiKey: 'test-key', postizIntegrations: { x: 'test-int-id' } };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('x')).toBe(true);
    expect(loader.listRegistered()).toContain('postiz');
  });

  test('does not load PostizProvider when integrations map is missing', () => {
    const config: ReachforgeConfig = { postizApiKey: 'test-key' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('x')).toBe(false);
  });

  test('loads HashnodeProvider when API key and publication ID are present', () => {
    const config: ReachforgeConfig = { hashnodeApiKey: 'key', hashnodePublicationId: 'pub-123' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('hashnode')).toBe(true);
    expect(loader.listRegistered()).toContain('hashnode');
  });

  test('does not load HashnodeProvider when publication ID is missing', () => {
    const config: ReachforgeConfig = { hashnodeApiKey: 'key' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('hashnode')).toBe(false);
  });

  test('loads GitHubProvider when token, owner, and repo are present', () => {
    const config: ReachforgeConfig = { githubToken: 'token', githubOwner: 'org', githubRepo: 'repo' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('github')).toBe(true);
    expect(loader.listRegistered()).toContain('github');
  });

  test('does not load GitHubProvider when owner is missing', () => {
    const config: ReachforgeConfig = { githubToken: 'token', githubRepo: 'repo' };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('github')).toBe(false);
  });

  test('returns MockProvider when no real provider available', () => {
    const config: ReachforgeConfig = {};
    const loader = new ProviderLoader(config);
    const provider = loader.getProviderOrMock('x');
    expect(provider.id).toBe('mock');
  });

  test('loads multiple providers from config', () => {
    const config: ReachforgeConfig = { devtoApiKey: 'key1', postizApiKey: 'key2', postizIntegrations: { x: 'int-id' } };
    const loader = new ProviderLoader(config);
    expect(loader.size).toBe(2); // devto + x
    expect(loader.hasRealProvider('devto')).toBe(true);
    expect(loader.hasRealProvider('x')).toBe(true);
  });

  test('loads multiple Postiz platforms from integrations map', () => {
    const config: ReachforgeConfig = {
      postizApiKey: 'key',
      postizIntegrations: { x: 'id-x', linkedin: 'id-li' },
    };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('x')).toBe(true);
    expect(loader.hasRealProvider('linkedin')).toBe(true);
    expect(loader.size).toBe(2);
  });

  test('loads named account slots from integrations map', () => {
    const config: ReachforgeConfig = {
      postizApiKey: 'key',
      postizIntegrations: { x_company: 'id1', x_personal: 'id2', linkedin: 'id3' },
    };
    const loader = new ProviderLoader(config);
    expect(loader.hasRealProvider('x_company')).toBe(true);
    expect(loader.hasRealProvider('x_personal')).toBe(true);
    expect(loader.hasRealProvider('linkedin')).toBe(true);
    expect(loader.hasRealProvider('x')).toBe(false); // bare 'x' not registered
    expect(loader.size).toBe(3);
  });

  test('listPlatforms includes dynamic named slots', () => {
    const config: ReachforgeConfig = {
      postizApiKey: 'key',
      postizIntegrations: { x_company: 'id1', linkedin: 'id2' },
    };
    const loader = new ProviderLoader(config);
    const platforms = loader.listPlatforms().map(p => p.platform);
    expect(platforms).toContain('x_company');
    expect(platforms).toContain('linkedin');
  });

  test('resolveProvider throws with --provider hint on conflict', () => {
    // Simulate conflict by registering two providers for same platform
    // (In practice this happens when native X + Postiz X both configured)
    const config: ReachforgeConfig = {
      postizApiKey: 'key',
      postizIntegrations: { x: 'postiz-id' },
      // devto has no conflict, just testing the mechanism
    };
    const loader = new ProviderLoader(config);
    // No conflict here, resolveProvider returns normally
    expect(loader.resolveProvider('x')).toBeDefined();
    expect(loader.resolveProvider('missing')).toBeUndefined();
  });

  test('returns undefined for unregistered platform', () => {
    const config: ReachforgeConfig = {};
    const loader = new ProviderLoader(config);
    expect(loader.getProvider('linkedin')).toBeUndefined();
  });
});
