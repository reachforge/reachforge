import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const DEFAULT_WRITEAS_URL = 'https://write.as';

export class WriteasProvider implements PlatformProvider {
  readonly id = 'writeas';
  readonly name = 'Write.as';
  readonly platforms = ['writeas'];
  readonly contentFormat: ContentFormat = 'markdown';
  readonly language = 'en';

  private readonly apiBase: string;

  constructor(
    private readonly accessToken: string,
    url?: string,
  ) {
    this.apiBase = (url ?? DEFAULT_WRITEAS_URL).replace(/\/+$/, '') + '/api';
  }

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['Write.as article content is empty.'] };
    }

    const stripped = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
    if (stripped.length === 0) {
      errors.push('Write.as article body is empty after stripping frontmatter.');
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const body = this.formatContent(content);
    const title = this.extractTitle(content, meta);

    const payload: Record<string, string> = { body };
    if (title) payload.title = title;

    try {
      const response = await httpRequest(`${this.apiBase}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new ProviderError('writeas', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ data: { id: string; slug: string } }>();
      const url = `${this.apiBase.replace('/api', '')}/${data.data.id}`;
      return { platform: 'writeas', status: 'success', url, articleId: data.data.id };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'writeas', status: 'failed', error: message };
    }
  }

  async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const body = this.formatContent(content);
    const title = this.extractTitle(content, meta);

    const payload: Record<string, string> = { body };
    if (title) payload.title = title;

    try {
      const response = await httpRequest(`${this.apiBase}/posts/${articleId}`, {
        method: 'POST',        // Write.as uses POST for updates
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new ProviderError('writeas', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ data: { id: string; slug: string } }>();
      const url = `${this.apiBase.replace('/api', '')}/${data.data.id}`;
      return { platform: 'writeas', status: 'success', url, articleId: data.data.id };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'writeas', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    let cleaned = content;
    if (cleaned.startsWith('---')) {
      cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n?/, '');
    }
    cleaned = cleaned.replace(/^\s*#\s+.+\n?/, '');
    return cleaned;
  }

  private extractTitle(content: string, meta: PublishMeta): string | undefined {
    if (meta.title) return meta.title;
    const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
    if (fmMatch) return fmMatch[1].trim();
    const h1Match = content.match(/^#\s+(.+)$/m);
    return h1Match?.[1]?.trim();
  }
}
