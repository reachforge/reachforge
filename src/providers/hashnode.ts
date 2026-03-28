import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const HASHNODE_GQL_URL = 'https://gql.hashnode.com';

export class HashnodeProvider implements PlatformProvider {
  readonly id = 'hashnode';
  readonly name = 'Hashnode';
  readonly platforms = ['hashnode'];
  readonly contentFormat: ContentFormat = 'markdown';
  readonly language = 'en';

  constructor(
    private readonly apiKey: string,
    private readonly publicationId: string,
  ) {}

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['Hashnode article content is empty.'] };
    }

    const h1Match = content.match(/^#\s+(.+)$/m);
    const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
    const title = h1Match?.[1]?.trim() ?? fmMatch?.[1]?.trim() ?? null;

    if (!title) {
      errors.push('Hashnode article missing title (no H1 heading or frontmatter title found).');
    }

    return { valid: errors.length === 0, errors };
  }

  private _prepareContent(content: string, meta: PublishMeta): { title: string; body: string } {
    const h1Match = content.match(/^#\s+(.+)$/m);
    const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
    const title = meta.title ?? h1Match?.[1]?.trim() ?? fmMatch?.[1]?.trim() ?? 'Untitled';

    let body = content;
    if (content.startsWith('---')) {
      body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    }
    body = body.replace(/^\s*#\s+.+\n?/, '');

    return { title, body };
  }

  private _parsePostResponse(data: {
    data?: {
      publishPost?: { post?: { id?: string; slug?: string; url?: string; publication?: { url?: string } } };
      updatePost?: { post?: { id?: string; slug?: string; url?: string; publication?: { url?: string } } };
    };
    errors?: Array<{ message: string }>;
  }): PublishResult {
    if (data.errors?.length) {
      throw new ProviderError('hashnode', `Hashnode API error: ${data.errors[0].message}`);
    }

    const post = data.data?.publishPost?.post ?? data.data?.updatePost?.post;
    const url = post?.url;
    const publicationUrl = post?.publication?.url?.replace(/\/$/, '') ?? '';
    const slug = post?.slug ?? 'post';

    return { platform: 'hashnode', status: 'success', url: url ?? `${publicationUrl}/${slug}`, articleId: post?.id };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const { title, body } = this._prepareContent(content, meta);

    const mutation = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post { id, slug, url, publication { url } }
        }
      }
    `;

    try {
      const response = await httpRequest(HASHNODE_GQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': this.apiKey },
        body: JSON.stringify({
          query: mutation,
          variables: {
            input: {
              title,
              contentMarkdown: body.trim(),
              publicationId: this.publicationId,
              tags: (meta.tags ?? []).map(name => ({ name, slug: name.toLowerCase().replace(/\s+/g, '-') })),
              ...(meta.coverImage ? { coverImageOptions: { coverImageURL: meta.coverImage } } : {}),
            },
          },
        }),
      });

      if (!response.ok) {
        throw new ProviderError('hashnode', `API returned ${response.status}: ${response.body}`);
      }

      return this._parsePostResponse(response.json());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'hashnode', status: 'failed', error: message };
    }
  }

  async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const { title, body } = this._prepareContent(content, meta);

    const mutation = `
      mutation UpdatePost($input: UpdatePostInput!) {
        updatePost(input: $input) {
          post { id, slug, url, publication { url } }
        }
      }
    `;

    try {
      const response = await httpRequest(HASHNODE_GQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': this.apiKey },
        body: JSON.stringify({
          query: mutation,
          variables: {
            input: {
              id: articleId,
              title,
              contentMarkdown: body.trim(),
              tags: (meta.tags ?? []).map(name => ({ name, slug: name.toLowerCase().replace(/\s+/g, '-') })),
              ...(meta.coverImage ? { coverImageOptions: { coverImageURL: meta.coverImage } } : {}),
            },
          },
        }),
      });

      if (!response.ok) {
        throw new ProviderError('hashnode', `API returned ${response.status}: ${response.body}`);
      }

      return this._parsePostResponse(response.json());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'hashnode', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    return content;
  }
}
