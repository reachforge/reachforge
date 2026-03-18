import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const HASHNODE_GQL_URL = 'https://gql.hashnode.com';

export class HashnodeProvider implements PlatformProvider {
  readonly id = 'hashnode';
  readonly name = 'Hashnode';
  readonly platforms = ['hashnode'];

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

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const h1Match = content.match(/^#\s+(.+)$/m);
    const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
    const title = meta.title ?? h1Match?.[1]?.trim() ?? fmMatch?.[1]?.trim() ?? 'Untitled';

    let body = content;
    if (content.startsWith('---')) {
      body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    } else if (h1Match) {
      body = content.replace(/^#\s+.+\n?/, '');
    }

    const mutation = `
      mutation CreateStory($input: CreateStoryInput!) {
        createPublicationStory(publicationId: "${this.publicationId}", input: $input) {
          post { slug, publication { domain } }
        }
      }
    `;

    try {
      const response = await httpRequest(HASHNODE_GQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiKey,
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            input: {
              title,
              contentMarkdown: body.trim(),
              isPartOfPublication: { publicationId: this.publicationId },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new ProviderError('hashnode', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{
        data?: {
          createPublicationStory?: {
            post?: { slug?: string; publication?: { domain?: string } };
          };
        };
        errors?: Array<{ message: string }>;
      }>();

      if (data.errors?.length) {
        throw new ProviderError('hashnode', `Hashnode API error: ${data.errors[0].message}`);
      }

      const post = data.data?.createPublicationStory?.post;
      const domain = post?.publication?.domain ?? 'hashnode.dev';
      const slug = post?.slug ?? 'post';

      return { platform: 'hashnode', status: 'success', url: `https://${domain}/${slug}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'hashnode', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    return content;
  }
}
