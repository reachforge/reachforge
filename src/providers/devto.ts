import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const DEVTO_API_BASE = 'https://dev.to/api';

export class DevtoProvider implements PlatformProvider {
  readonly id = 'devto';
  readonly name = 'Dev.to (Forem)';
  readonly platforms = ['devto'];
  readonly contentFormat: ContentFormat = 'markdown';

  constructor(private readonly apiKey: string) {}

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['Dev.to article content is empty.'] };
    }

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      return { valid: false, errors: ['Dev.to article missing required frontmatter block (---...--).' ] };
    }

    if (!content.match(/^---[\s\S]*?title:/m)) {
      errors.push('Dev.to article missing required frontmatter field: title.');
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

    // Determine published state:
    //   Priority: meta.draft (CLI flag) > frontmatter `published` > default (true)
    // Dev.to API uses frontmatter over body params, so we strip it from the
    // markdown and pass a single consistent value via the API parameter.
    let shouldPublish = true;
    const fmPublishedMatch = content.match(/^---\n[\s\S]*?published:\s*(true|false)/m);
    if (fmPublishedMatch) {
      shouldPublish = fmPublishedMatch[1] === 'true';
    }
    if (meta.draft !== undefined) {
      shouldPublish = !meta.draft;
    }

    const cleanedContent = content.replace(
      /^(---\n[\s\S]*?)published:\s*(true|false)\n([\s\S]*?---)/, '$1$3'
    );

    const body = JSON.stringify({
      article: {
        title,
        body_markdown: cleanedContent,
        published: shouldPublish,
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
