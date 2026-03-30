import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';
import { basePlatform } from '../core/filename-parser.js';

const DEFAULT_POSTIZ_BASE = 'https://api.postiz.com';
const X_THREAD_DELIMITER = /^<!--\s*thread-break\s*-->$/m;
const X_MAX_CHARS = 280;

export type PostizWhoCanReply = 'everyone' | 'following' | 'mentionedUsers' | 'subscribers' | 'verified';

export interface PostizIntegration {
  id: string;
  name: string;
  identifier: string;  // e.g. "@username"
  type: string;        // 'x', 'linkedin', 'bluesky', etc.
  picture?: string;
  disabled: boolean;
}

export interface PostizProviderOptions {
  baseUrl?: string;
  whoCanReply?: PostizWhoCanReply;
  /** Full platform key for this integration (default: 'x').
   *  Single account: 'x', 'linkedin'
   *  Named account:  'x_company', 'linkedin_brand'
   */
  platform?: string;
}

/** Human-readable display names for platforms served via Postiz. */
const POSTIZ_PLATFORM_NAMES: Record<string, string> = {
  x: 'X/Twitter (via Postiz)',
  linkedin: 'LinkedIn (via Postiz)',
  bluesky: 'Bluesky (via Postiz)',
  instagram: 'Instagram (via Postiz)',
  facebook: 'Facebook (via Postiz)',
  tiktok: 'TikTok (via Postiz)',
  youtube: 'YouTube (via Postiz)',
  threads: 'Threads (via Postiz)',
};

export class PostizProvider implements PlatformProvider {
  readonly id = 'postiz';
  readonly contentFormat: ContentFormat = 'plaintext';
  readonly language = 'auto';

  readonly platforms: string[];
  readonly name: string;

  private readonly platformKey: string;
  private readonly base: string;
  private readonly apiBase: string;
  private readonly whoCanReply: PostizWhoCanReply;

  constructor(
    private readonly apiKey: string,
    private readonly integrationId: string,
    options: PostizProviderOptions = {},
  ) {
    this.platformKey = options.platform ?? 'x';
    this.base = basePlatform(this.platformKey);
    this.platforms = [this.platformKey];
    this.apiBase = (options.baseUrl ?? DEFAULT_POSTIZ_BASE).replace(/\/$/, '');
    this.whoCanReply = options.whoCanReply ?? 'everyone';

    const baseName = POSTIZ_PLATFORM_NAMES[this.base] ?? `${this.base} (via Postiz)`;
    // If this is a named account slot, append the label to the display name
    const label = this.platformKey !== this.base
      ? ` [${this.platformKey.slice(this.base.length + 1)}]`
      : '';
    this.name = baseName + label;
  }

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      errors.push('Content is empty');
      return { valid: false, errors };
    }

    // X-specific: enforce 280-char limit per thread segment
    if (this.base === 'x') {
      const segments = content.split(X_THREAD_DELIMITER).map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].length > X_MAX_CHARS) {
          errors.push(
            `X post segment ${i + 1} exceeds ${X_MAX_CHARS} character limit (found: ${segments[i].length})`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, _meta: PublishMeta = {}): Promise<PublishResult> {
    // X supports threads via <!-- thread-break --> delimiter; other platforms send single post
    const value = this.base === 'x'
      ? content.split(X_THREAD_DELIMITER).map(s => s.trim()).filter(Boolean)
          .map((seg, i) => ({ content: seg, image: [], delay: i * 1000 }))
      : [{ content: content.trim(), image: [], delay: 0 }];

    // Platform-specific post settings — __type is the Postiz integration type
    const settings: Record<string, unknown> = { __type: this.base };
    if (this.base === 'x') {
      settings.who_can_reply_post = this.whoCanReply;
    }

    const body = JSON.stringify({
      type: 'now',
      date: new Date().toISOString(),
      shortLink: false,
      posts: [
        {
          integration: { id: this.integrationId },
          value,
          settings,
        },
      ],
      tags: [],
    });

    try {
      const response = await httpRequest(`${this.apiBase}/public/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiKey,
        },
        body,
      });

      if (!response.ok) {
        throw new ProviderError('postiz', `API returned ${response.status}: ${response.body}`);
      }

      const results = response.json<Array<{
        postId?: string;
        integration?: string;
        state?: string;
        releaseURL?: string | null;
      }>>();

      const first = Array.isArray(results) ? results[0] : null;

      return {
        platform: this.platformKey,
        status: 'success',
        url: first?.releaseURL ?? undefined,
        articleId: first?.postId,
      };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: this.platformKey, status: 'failed', error: message };
    }
  }

  // Posts on most Postiz-served platforms are immutable once published.
  // update() is intentionally omitted; the pipeline's typeof guard handles this gracefully.

  formatContent(content: string): string {
    return content;
  }

  /**
   * List all social integrations connected to this Postiz account.
   * Use this to discover integration IDs for the postizIntegrationId config.
   *
   * @example
   *   const integrations = await PostizProvider.listIntegrations(apiKey);
   *   // [{ id: 'abc', name: 'Twitter', identifier: '@myhandle', type: 'x', disabled: false }, ...]
   */
  static async listIntegrations(
    apiKey: string,
    baseUrl: string = DEFAULT_POSTIZ_BASE,
  ): Promise<PostizIntegration[]> {
    const apiBase = baseUrl.replace(/\/$/, '');
    const response = await httpRequest(`${apiBase}/public/v1/integrations`, {
      method: 'GET',
      headers: { 'Authorization': apiKey },
    });

    if (!response.ok) {
      throw new ProviderError(
        'postiz',
        `Failed to list integrations: ${response.status}: ${response.body}`,
      );
    }

    // Postiz returns either a plain array or a wrapped { integrations: [...] } object
    const data = response.json<PostizIntegration[] | { integrations?: PostizIntegration[] }>();
    if (Array.isArray(data)) return data;
    return data.integrations ?? [];
  }

}
