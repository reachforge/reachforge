# Feature Spec: WordPress Provider

| Field        | Value                              |
|--------------|------------------------------------|
| **Feature**  | WordPress Publishing Provider      |
| **Date**     | 2026-03-27                         |
| **Platform ID** | `wordpress`                     |
| **Tech Design** | [New Providers Tech Design](../new-providers/tech-design.md) |

---

## 1. Overview

Self-hosted WordPress (5.6+) publishing provider using the WP REST API with Application Password authentication via Basic Auth. Tags are skipped in v1 (WP requires tag IDs, not names).

## 2. Provider Class

### File: `src/providers/wordpress.ts`

```typescript
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

  validate(content: string): ValidationResult { ... }
  async publish(content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  async update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  formatContent(content: string): string { ... }

  private extractTitle(content: string, meta: PublishMeta): string { ... }
  private buildPayload(html: string, meta: PublishMeta): Record<string, unknown> { ... }
}
```

## 3. Authentication

WordPress Application Passwords use HTTP Basic Auth:

```
Authorization: Basic base64("{username}:{app_password}")
```

The application password is generated in WordPress admin under Users > Application Passwords. It may contain spaces (e.g., `xxxx xxxx xxxx xxxx`) which is normal.

## 4. API Endpoints

### 4.1 Publish (Create Post)

```
POST {apiBase}/posts
Authorization: Basic {base64_credentials}
Content-Type: application/json
```

**Request body:**
```json
{
  "title": "Article Title",
  "content": "<p>HTML content...</p>",
  "status": "publish"
}
```

**Response (201):**
```json
{
  "id": 42,
  "link": "https://mysite.com/2026/03/27/article-title/",
  "status": "publish",
  "title": { "rendered": "Article Title" }
}
```

### 4.2 Update Post

```
PUT {apiBase}/posts/{id}
Authorization: Basic {base64_credentials}
Content-Type: application/json
```

**Request body:** Same as create. Only include fields to update.

**Response (200):** Same structure as create.

## 5. Method Implementations

### 5.1 `formatContent(content: string): string`

```typescript
formatContent(content: string): string {
  return markdownToHtml(content);
}
```

### 5.2 `publish(content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
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
```

### 5.3 `update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
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
```

### 5.4 `buildPayload` helper

```typescript
private buildPayload(html: string, meta: PublishMeta): Record<string, unknown> {
  return {
    title: this.extractTitle(html, meta),
    content: html,
    status: meta.draft ? 'draft' : 'publish',
  };
}

private extractTitle(content: string, meta: PublishMeta): string {
  if (meta.title) return meta.title;
  const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
  return h1Match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? 'Untitled';
}
```

## 6. Validator

### File: `src/validators/wordpress.ts`

```typescript
import type { ValidationResult } from '../providers/types.js';

export function validateWordPressContent(content: string): ValidationResult {
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
```

## 7. Config Fields

| Config Key | Type | Required | Description |
|------------|------|----------|-------------|
| `wordpressUrl` | `string` | Yes | WordPress site URL (e.g., `https://mysite.com`) |
| `wordpressUsername` | `string` | Yes | WordPress username |
| `wordpressAppPassword` | `string` | Yes | Application Password |

All three must be present for the provider to register.

## 8. Design Decisions

### Tags skipped in v1

The WP REST API `tags` field only accepts tag IDs (integers). To use tag names, we would need to:
1. `GET /wp-json/wp/v2/tags?search={name}` for each tag
2. `POST /wp-json/wp/v2/tags` to create missing ones
3. Collect all IDs and pass to the post

This adds N+1 API calls per publish. Deferred to v2.

### Status field

WordPress uses `"publish"` (not `"published"`) for the live status.

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| HTTP 401 (bad credentials) | `ProviderError` with status + body |
| HTTP 403 (insufficient permissions) | `ProviderError` -- user needs "edit_posts" capability |
| HTTP 404 on update (bad post ID) | `ProviderError` with status + body |
| HTTP 500 (server error) | `ProviderError`, retried by `httpRequest` |
| REST API disabled | `ProviderError` from 404 on `/wp-json/wp/v2/posts` |

## 10. Test Cases

### Unit Tests (`tests/unit/providers/wordpress.test.ts`)

| # | Test | Assertion |
|---|------|-----------|
| 1 | Constructor builds correct API base | Trailing slashes stripped, `/wp-json/wp/v2` appended |
| 2 | Constructor encodes Basic Auth header | Base64 of `user:pass` |
| 3 | `formatContent()` converts markdown to HTML | HTML output |
| 4 | `buildPayload()` uses `"publish"` status | Not `"published"` |
| 5 | `buildPayload()` uses `"draft"` when meta.draft=true | `status: 'draft'` |
| 6 | `publish()` sends POST with correct headers | Auth + Content-Type present |
| 7 | `publish()` returns articleId from response | `String(data.id)` |
| 8 | `update()` sends PUT to correct URL | URL includes articleId |
| 9 | `publish()` handles non-OK response | Throws `ProviderError` |
| 10 | `publish()` catches non-provider errors | Returns `status: 'failed'` |

### Validator Tests (`tests/unit/validators/wordpress.test.ts`)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Empty content | `""` | Invalid |
| 2 | Content with H1 | `"# Title\nBody"` | Valid |
| 3 | Content with frontmatter title | `"---\ntitle: X\n---\nBody"` | Valid |
| 4 | Frontmatter without title | `"---\ntags: [a]\n---\nBody"` | Invalid |
| 5 | No title, no frontmatter | `"Just body"` | Invalid |
