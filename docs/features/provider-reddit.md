# Feature Spec: Reddit Provider

| Field        | Value                              |
|--------------|------------------------------------|
| **Feature**  | Reddit Publishing Provider         |
| **Date**     | 2026-03-27                         |
| **Platform ID** | `reddit`                        |
| **Tech Design** | [New Providers Tech Design](../new-providers/tech-design.md) |

---

## 1. Overview

Reddit self-post publishing provider. Uses OAuth2 password grant for authentication with in-memory token caching. Content is submitted as Markdown self-posts to a configured subreddit.

## 2. Provider Class

### File: `src/providers/reddit.ts`

```typescript
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

  validate(content: string): ValidationResult { ... }
  async publish(content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  async update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  formatContent(content: string): string { ... }

  private async getAccessToken(): Promise<string> { ... }
  private stripFrontmatter(content: string): string { ... }
  private extractTitle(content: string, meta: PublishMeta): string { ... }
}
```

## 3. OAuth2 Password Grant Flow

Reddit uses OAuth2 with the "script" app type (password grant):

### 3.1 Token Request

```
POST https://www.reddit.com/api/v1/access_token
Authorization: Basic base64("{client_id}:{client_secret}")
Content-Type: application/x-www-form-urlencoded
User-Agent: ReachForge/1.0

grant_type=password&username={username}&password={password}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 86400,
  "scope": "submit edit"
}
```

### 3.2 Token Caching

```typescript
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
```

## 4. API Endpoints

### 4.1 Submit Self-Post

```
POST https://oauth.reddit.com/api/submit
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded
User-Agent: ReachForge/1.0
```

**Request body (form-encoded, NOT JSON):**
```
sr={subreddit}&kind=self&title={title}&text={markdown_content}
```

**Response:**
```json
{
  "json": {
    "errors": [],
    "data": {
      "url": "https://www.reddit.com/r/programming/comments/abc123/article_title/",
      "id": "abc123",
      "name": "t3_abc123"
    }
  }
}
```

### 4.2 Edit Self-Post Text

```
POST https://oauth.reddit.com/api/editusertext
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded
User-Agent: ReachForge/1.0
```

**Request body (form-encoded):**
```
thing_id=t3_{id}&text={updated_markdown_content}
```

Note: Reddit does not allow editing post titles after submission.

**Response:**
```json
{
  "json": {
    "errors": [],
    "data": {
      "things": [{ "data": { "id": "t3_abc123" } }]
    }
  }
}
```

## 5. Method Implementations

### 5.1 `formatContent(content: string): string`

Reddit accepts Markdown natively. Strip frontmatter and leading H1 (title goes in the `title` field).

```typescript
formatContent(content: string): string {
  let content_ = this.stripFrontmatter(content);
  // Remove leading H1 (used as title)
  content_ = content_.replace(/^\s*#\s+.+\n?/, '');
  return content_.trim();
}

private stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}
```

### 5.2 `publish(content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
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
```

### 5.3 `update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
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
```

### 5.4 `extractTitle` helper

```typescript
private extractTitle(content: string, meta: PublishMeta): string {
  if (meta.title) return meta.title.slice(0, 300);  // Reddit max 300 chars
  const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
  if (fmMatch) return fmMatch[1].trim().slice(0, 300);
  const h1Match = content.match(/^#\s+(.+)$/m);
  return (h1Match?.[1]?.trim() ?? 'Untitled').slice(0, 300);
}
```

## 6. Validator

### File: `src/validators/reddit.ts`

```typescript
import type { ValidationResult } from '../providers/types.js';

export function validateRedditContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Reddit post content is empty.'] };
  }

  // Extract title
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

  // Check body is non-empty after stripping frontmatter + H1
  const stripped = content
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/^\s*#\s+.+\n?/, '')
    .trim();
  if (stripped.length === 0) {
    errors.push('Reddit post body is empty after stripping title.');
  }

  return { valid: errors.length === 0, errors };
}
```

## 7. Config Fields

| Config Key | Type | Required | Description |
|------------|------|----------|-------------|
| `redditClientId` | `string` | Yes | Reddit API "script" app client ID |
| `redditClientSecret` | `string` | Yes | Reddit API app secret |
| `redditUsername` | `string` | Yes | Reddit account username |
| `redditPassword` | `string` | Yes | Reddit account password |
| `redditSubreddit` | `string` | No | Default subreddit (defaults to `"programming"`) |

All four credential fields must be present for the provider to register.

## 8. Reddit API Setup Prerequisites

Users must create a Reddit "script" type application at https://www.reddit.com/prefs/apps:
1. Click "create another app..."
2. Select "script" type
3. Set redirect URI to `http://localhost` (unused but required)
4. Note the client ID (under app name) and secret

Required OAuth scopes: `submit`, `edit`.

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| OAuth token request fails | `ProviderError` with HTTP status |
| Token expired mid-request | Auto-refresh on next call (60s buffer) |
| Submit returns errors array | `ProviderError` with joined error messages |
| Subreddit doesn't exist | Reddit returns error in `json.errors` |
| Rate limited (HTTP 429) | Handled by `httpRequest` retry logic |
| Missing `User-Agent` | Reddit rejects with 429; always send header |
| Edit on deleted post | `ProviderError` from API |

## 10. Design Decisions

### Form-encoded body (not JSON)

Reddit's `/api/submit` and `/api/editusertext` require `application/x-www-form-urlencoded`, not JSON. This differs from all other providers.

### Title truncation

Reddit enforces a 300-character title limit. The provider silently truncates; the validator warns.

### In-memory token caching

The OAuth token is cached on the provider instance with a 60-second expiry buffer. No persistent storage needed since CLI sessions are short-lived.

### articleId format

Store the short ID (e.g., `abc123`) without the `t3_` prefix. The provider adds the prefix when calling `editusertext`.

## 11. Test Cases

### Unit Tests (`tests/unit/providers/reddit.test.ts`)

| # | Test | Assertion |
|---|------|-----------|
| 1 | `getAccessToken()` sends correct Basic Auth | Base64 of `clientId:clientSecret` |
| 2 | `getAccessToken()` sends form-encoded body | `grant_type=password&username=...&password=...` |
| 3 | `getAccessToken()` caches token | Second call returns cached, no HTTP |
| 4 | `getAccessToken()` refreshes expired token | New HTTP call after expiry |
| 5 | `formatContent()` strips frontmatter + H1 | Both removed |
| 6 | `extractTitle()` truncates to 300 chars | Long title truncated |
| 7 | `publish()` sends form-encoded POST | Content-Type is `x-www-form-urlencoded` |
| 8 | `publish()` includes subreddit in body | `sr=` present |
| 9 | `publish()` handles json.errors | Throws `ProviderError` |
| 10 | `publish()` returns short ID as articleId | No `t3_` prefix |
| 11 | `update()` adds `t3_` prefix to thing_id | `thing_id=t3_{id}` |
| 12 | `update()` sends to `/api/editusertext` | Correct endpoint |
| 13 | `publish()` includes User-Agent header | `ReachForge/1.0` |
| 14 | `publish()` catches non-provider errors | Returns `status: 'failed'` |

### Validator Tests (`tests/unit/validators/reddit.test.ts`)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Empty content | `""` | Invalid |
| 2 | Content with title + body | `"# Title\nBody"` | Valid |
| 3 | Title > 300 chars | `"# ${'x'.repeat(301)}\nBody"` | Invalid, length error |
| 4 | No title | `"Just body text"` | Invalid |
| 5 | Title only, no body | `"# Title"` | Invalid, empty body |
| 6 | Frontmatter title | `"---\ntitle: X\n---\nBody"` | Valid |
