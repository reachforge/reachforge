import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { ProviderError } from '../types/index.js';

const REDDIT_AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';
const USER_AGENT = 'ReachForge/1.0';

export class RedditProvider implements PlatformProvider {
  readonly id = 'reddit';
  readonly name = 'Reddit';
  readonly platforms = ['reddit'];
  readonly contentFormat: ContentFormat = 'markdown';
  readonly language = 'en';

  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly username: string,
    private readonly password: string,
    private readonly subreddit: string,
  ) {}

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      return { valid: false, errors: ['Reddit post content is empty.'] };
    }

    let title: string | undefined;
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const titleMatch = fmMatch[1].match(/title:\s*(.+)/);
      title = titleMatch?.[1]?.trim();
    }
    if (!title) {
      const h1Match = content.match(/^#\s+(.+)$/m);
      title = h1Match?.[1]?.trim();
    }

    if (!title) {
      errors.push('Reddit post missing title (no frontmatter title or H1 heading found).');
    } else if (title.length > 300) {
      errors.push(`Reddit post title exceeds 300 character limit (found: ${title.length}).`);
    }

    const stripped = content
      .replace(/^---\n[\s\S]*?\n---\n?/, '')
      .replace(/^\s*#\s+.+\n?/, '')
      .trim();
    if (stripped.length === 0) {
      errors.push('Reddit post body is empty after stripping title.');
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const token = await this.getAccessToken();
    const title = this.extractTitle(content, meta);
    const text = this.formatContent(content);

    const formBody = new URLSearchParams({
      sr: this.subreddit,
      kind: 'self',
      title,
      text,
    }).toString();

    try {
      const response = await httpRequest(`${REDDIT_API_BASE}/api/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: formBody,
      });

      if (!response.ok) {
        throw new ProviderError('reddit', `API returned ${response.status}: ${response.body}`);
      }

      const data = response.json<{
        json: { errors: string[][]; data: { url: string; id: string; name: string } };
      }>();

      if (data.json.errors.length > 0) {
        const errorMsg = data.json.errors.map(e => e.join(': ')).join('; ');
        throw new ProviderError('reddit', `Submit errors: ${errorMsg}`);
      }

      return {
        platform: 'reddit',
        status: 'success',
        url: data.json.data.url,
        articleId: data.json.data.id,      // Store the short ID (e.g., "abc123")
      };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'reddit', status: 'failed', error: message };
    }
  }

  async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
    const token = await this.getAccessToken();
    const text = this.formatContent(content);

    // thing_id needs the t3_ prefix for link (post) type
    const thingId = articleId.startsWith('t3_') ? articleId : `t3_${articleId}`;

    const formBody = new URLSearchParams({
      thing_id: thingId,
      text,
    }).toString();

    try {
      const response = await httpRequest(`${REDDIT_API_BASE}/api/editusertext`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: formBody,
      });

      if (!response.ok) {
        throw new ProviderError('reddit', `API returned ${response.status}: ${response.body}`);
      }

      // editusertext doesn't return a URL, construct it
      const url = `https://www.reddit.com/r/${this.subreddit}/comments/${articleId.replace('t3_', '')}/`;
      return { platform: 'reddit', status: 'success', url, articleId: articleId.replace('t3_', '') };
    } catch (err: unknown) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return { platform: 'reddit', status: 'failed', error: message };
    }
  }

  formatContent(content: string): string {
    let content_ = this.stripFrontmatter(content);
    // Remove leading H1 (used as title)
    content_ = content_.replace(/^\s*#\s+.+\n?/, '');
    return content_.trim();
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.token;
    }

    const basicAuth = 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const formBody = new URLSearchParams({
      grant_type: 'password',
      username: this.username,
      password: this.password,
    }).toString();

    const response = await httpRequest(REDDIT_AUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: formBody,
    });

    if (!response.ok) {
      throw new ProviderError('reddit', `OAuth token request failed: ${response.status}: ${response.body}`);
    }

    const data = response.json<{ access_token: string; expires_in: number }>();
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return this.cachedToken.token;
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  }

  private extractTitle(content: string, meta: PublishMeta): string {
    if (meta.title) return meta.title.slice(0, 300);  // Reddit max 300 chars
    const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
    if (fmMatch) return fmMatch[1].trim().slice(0, 300);
    const h1Match = content.match(/^#\s+(.+)$/m);
    return (h1Match?.[1]?.trim() ?? 'Untitled').slice(0, 300);
  }
}
