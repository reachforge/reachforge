import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const GITHUB_GQL_URL = 'https://api.github.com/graphql';

export class GitHubProvider implements PlatformProvider {
  readonly id = 'github';
  readonly name = 'GitHub Discussions';
  readonly platforms = ['github'];
  readonly contentFormat: ContentFormat = 'markdown';
  readonly language = 'en';

  constructor(
    private readonly token: string,
    private readonly config: { owner: string; repo: string; category: string },
  ) {}

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['GitHub discussion content is empty.'] };
    }

    const h1Match = content.match(/^#\s+(.+)$/m);
    if (!h1Match) {
      errors.push('GitHub discussion missing title (no H1 heading found).');
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const h1Match = content.match(/^#\s+(.+)$/m);
    const title = meta.title ?? h1Match?.[1]?.trim() ?? 'Untitled';
    const body = h1Match ? content.replace(/^#\s+.+\n?/, '').trim() : content;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };

    try {
      // Step 1: Resolve repo and category IDs
      const repoRes = await httpRequest(GITHUB_GQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `query {
            repository(owner: "${this.config.owner}", name: "${this.config.repo}") {
              id
              discussionCategories(first: 10) { nodes { id name } }
            }
          }`,
        }),
      });

      if (!repoRes.ok) {
        throw new ProviderError('github', `API returned ${repoRes.status}: ${repoRes.body}`);
      }

      const repoData = repoRes.json<{
        data?: {
          repository?: {
            id?: string;
            discussionCategories?: { nodes: Array<{ id: string; name: string }> };
          };
        };
        errors?: Array<{ message: string }>;
      }>();

      if (repoData.errors?.length) {
        throw new ProviderError('github', `GitHub API error: ${repoData.errors[0].message}`);
      }

      const repoId = repoData.data?.repository?.id;
      const categories = repoData.data?.repository?.discussionCategories?.nodes ?? [];
      const category = categories.find(c => c.name === this.config.category);

      if (!repoId || !category) {
        throw new ProviderError('github', 'GitHub repository or discussion category not found.');
      }

      // Step 2: Create discussion
      const createRes = await httpRequest(GITHUB_GQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `mutation CreateDiscussion($input: CreateDiscussionInput!) {
            createDiscussion(input: $input) {
              discussion { url id }
            }
          }`,
          variables: {
            input: {
              repositoryId: repoId,
              categoryId: category.id,
              title,
              body,
            },
          },
        }),
      });

      if (!createRes.ok) {
        throw new ProviderError('github', `API returned ${createRes.status}: ${createRes.body}`);
      }

      const createData = createRes.json<{
        data?: { createDiscussion?: { discussion?: { url?: string; id?: string } } };
        errors?: Array<{ message: string }>;
      }>();

      if (createData.errors?.length) {
        throw new ProviderError('github', `GitHub API error: ${createData.errors[0].message}`);
      }

      const discussion = createData.data?.createDiscussion?.discussion;
      return { platform: 'github', status: 'success', url: discussion?.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'github', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    return content;
  }
}
