import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const POSTIZ_API_BASE = 'https://api.postiz.com';
const X_THREAD_DELIMITER = /^---$/m;
const X_MAX_CHARS = 280;

export class PostizProvider implements PlatformProvider {
  readonly id = 'postiz';
  readonly name = 'X/Twitter (via Postiz)';
  readonly platforms = ['x'];
  readonly contentFormat: ContentFormat = 'plaintext';

  constructor(private readonly apiKey: string) {}

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      errors.push('Content is empty');
      return { valid: false, errors };
    }

    // Validate thread segments are within 280 chars
    const segments = content.split(X_THREAD_DELIMITER).map(s => s.trim()).filter(Boolean);

    for (let i = 0; i < segments.length; i++) {
      if (segments[i].length > X_MAX_CHARS) {
        errors.push(
          `X post segment ${i + 1} exceeds ${X_MAX_CHARS} character limit (found: ${segments[i].length})`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const segments = content.split(X_THREAD_DELIMITER).map(s => s.trim()).filter(Boolean);

    // Postiz API uses "twitter" as the external platform identifier
    const body = JSON.stringify({
      platform: 'twitter',
      content: segments.length === 1 ? segments[0] : undefined,
      thread: segments.length > 1 ? segments : undefined,
      schedule: null, // Publish immediately
    });

    try {
      const response = await httpRequest(`${POSTIZ_API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body,
      });

      if (!response.ok) {
        throw new ProviderError('postiz', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ url?: string; id?: string }>();
      return {
        platform: 'x',
        status: 'success',
        url: data.url || `https://x.com/i/status/${data.id}`,
      };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return {
        platform: 'x',
        status: 'failed',
        error: message,
      };
    }
  }

  formatContent(content: string): string {
    // Ensure thread segments are delimited by ---
    return content;
  }
}
