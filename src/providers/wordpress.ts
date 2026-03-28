import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { markdownToHtml } from '../utils/markdown.js';
import { ProviderError } from '../types/index.js';

export class WordPressProvider implements PlatformProvider {
  readonly id = 'wordpress';
  readonly name = 'WordPress';
  readonly platforms = ['wordpress'];
  readonly contentFormat: ContentFormat = 'html';
  readonly language = 'en';

  private readonly apiBase: string;
  private readonly authHeader: string;

  constructor(url: string, username: string, appPassword: string) {
    this.apiBase = url.replace(/\/+$/, '') + '/wp-json/wp/v2';
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');
  }

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['WordPress article content is empty.'] };
    }

    const hasFm = content.match(/^---\n([\s\S]*?)\n---/);
    const hasH1 = content.match(/^#\s+(.+)$/m);

    if (!hasFm && !hasH1) {
      errors.push('WordPress article missing title (no frontmatter block or H1 heading found).');
    } else if (hasFm && !content.match(/^---[\s\S]*?title:/m)) {
      errors.push('WordPress article missing required frontmatter field: title.');
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const html = this.formatContent(content);
    const body = JSON.stringify(this.buildPayload(html, meta));

    try {
      const response = await httpRequest(`${this.apiBase}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body,
      });

      if (!response.ok) {
        throw new ProviderError('wordpress', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ id: number; link: string }>();
      return { platform: 'wordpress', status: 'success', url: data.link, articleId: String(data.id) };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'wordpress', status: 'failed', error: message };
    }
  }

  async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const html = this.formatContent(content);
    const body = JSON.stringify(this.buildPayload(html, meta));

    try {
      const response = await httpRequest(`${this.apiBase}/posts/${articleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body,
      });

      if (!response.ok) {
        throw new ProviderError('wordpress', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ id: number; link: string }>();
      return { platform: 'wordpress', status: 'success', url: data.link, articleId: String(data.id) };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'wordpress', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    return markdownToHtml(content);
  }

  private extractTitle(content: string, meta: PublishMeta): string {
    if (meta.title) return meta.title;
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    return h1Match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? 'Untitled';
  }

  private buildPayload(html: string, meta: PublishMeta): Record<string, unknown> {
    return {
      title: this.extractTitle(html, meta),
      content: html,
      status: meta.draft ? 'draft' : 'publish',
    };
  }
}
