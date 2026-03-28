import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { markdownToHtml } from '../utils/markdown.js';
import { ProviderError } from '../types/index.js';
import { createHmac } from 'crypto';

export class GhostProvider implements PlatformProvider {
  readonly id = 'ghost';
  readonly name = 'Ghost';
  readonly platforms = ['ghost'];
  readonly contentFormat: ContentFormat = 'html';
  readonly language = 'en';

  private readonly keyId: string;
  private readonly secret: Buffer;
  private readonly apiBase: string;

  constructor(ghostUrl: string, adminApiKey: string) {
    const [keyId, secret] = adminApiKey.split(':');
    if (!keyId || !secret) {
      throw new ProviderError('ghost', 'Admin API key must be in format "{key_id}:{secret}"');
    }
    this.keyId = keyId;
    this.secret = Buffer.from(secret, 'hex');
    this.apiBase = ghostUrl.replace(/\/+$/, '') + '/ghost/api/admin';
  }

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['Ghost article content is empty.'] };
    }

    const hasFm = content.match(/^---\n([\s\S]*?)\n---/);
    const hasH1 = content.match(/^#\s+(.+)$/m);

    if (!hasFm && !hasH1) {
      errors.push('Ghost article missing title (no frontmatter block or H1 heading found).');
    } else if (hasFm && !content.match(/^---[\s\S]*?title:/m)) {
      errors.push('Ghost article missing required frontmatter field: title.');
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const html = this.formatContent(content);
    const body = JSON.stringify({ posts: [this.buildPayload(html, meta)] });
    const token = this.signJwt();

    try {
      const response = await httpRequest(`${this.apiBase}/posts/?source=html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Ghost ${token}`,
        },
        body,
      });

      if (!response.ok) {
        throw new ProviderError('ghost', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ posts: [{ id: string; url: string }] }>();
      return { platform: 'ghost', status: 'success', url: data.posts[0].url, articleId: data.posts[0].id };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'ghost', status: 'failed', error: message };
    }
  }

  async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const token = this.signJwt();
    const authHeaders = { 'Authorization': `Ghost ${token}`, 'Content-Type': 'application/json' };

    try {
      // Step 1: GET current post to obtain updated_at
      const getResponse = await httpRequest(`${this.apiBase}/posts/${articleId}/`, {
        headers: { 'Authorization': `Ghost ${token}` },
      });
      if (!getResponse.ok) {
        throw new ProviderError('ghost', `GET post failed: ${getResponse.status}: ${getResponse.body}`);
      }
      const current = getResponse.json<{ posts: [{ updated_at: string }] }>();

      // Step 2: PUT with updated_at
      const html = this.formatContent(content);
      const payload = { ...this.buildPayload(html, meta), updated_at: current.posts[0].updated_at };
      const body = JSON.stringify({ posts: [payload] });

      const response = await httpRequest(`${this.apiBase}/posts/${articleId}/?source=html`, {
        method: 'PUT',
        headers: authHeaders,
        body,
      });

      if (!response.ok) {
        throw new ProviderError('ghost', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{ posts: [{ id: string; url: string }] }>();
      return { platform: 'ghost', status: 'success', url: data.posts[0].url, articleId: data.posts[0].id };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'ghost', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    return markdownToHtml(content);
  }

  private signJwt(): string {
    const header = { alg: 'HS256', typ: 'JWT', kid: this.keyId };
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + 300, aud: '/admin/' };

    const encode = (obj: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');

    const headerB64 = encode(header);
    const payloadB64 = encode(payload);
    const signature = createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  private extractTitle(content: string, meta: PublishMeta): string {
    if (meta.title) return meta.title;
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    return h1Match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? 'Untitled';
  }

  private buildPayload(html: string, meta: PublishMeta): Record<string, unknown> {
    const title = this.extractTitle(html, meta);
    return {
      title,
      html,
      status: meta.draft ? 'draft' : 'published',
      ...(meta.tags?.length ? { tags: meta.tags.map(name => ({ name })) } : {}),
      ...(meta.coverImage ? { feature_image: meta.coverImage } : {}),
    };
  }
}
