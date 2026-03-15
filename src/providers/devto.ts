import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const DEVTO_API_BASE = 'https://dev.to/api';

export class DevtoProvider implements PlatformProvider {
  readonly id = 'devto';
  readonly name = 'Dev.to (Forem)';
  readonly platforms = ['devto'];

  constructor(private readonly apiKey: string) {}

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      errors.push('Content is empty');
    }

    // Dev.to requires a title (first # heading or frontmatter)
    if (content && !content.match(/^#\s+.+/m) && !content.match(/^---[\s\S]*?title:/m)) {
      errors.push('Dev.to article must have a title (# heading or frontmatter title field)');
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    // Extract title from first heading if not provided
    let title = meta.title;
    if (!title) {
      const match = content.match(/^#\s+(.+)/m);
      title = match ? match[1].trim() : 'Untitled';
    }

    const body = JSON.stringify({
      article: {
        title,
        body_markdown: content,
        published: !meta.draft,
        tags: meta.tags || [],
        canonical_url: meta.canonical,
      },
    });

    try {
      const response = await httpRequest(`${DEVTO_API_BASE}/articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body,
      });

      if (!response.ok) {
        const errorBody = response.body;
        throw new ProviderError('devto', `API returned ${response.status}: ${errorBody}`);
      }

      const data = response.json<{ url: string }>();
      return {
        platform: 'devto',
        status: 'success',
        url: data.url,
      };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return {
        platform: 'devto',
        status: 'failed',
        error: message,
      };
    }
  }

  formatContent(content: string): string {
    // Dev.to accepts standard markdown — minimal formatting needed
    return content;
  }
}
