# Feature Spec: Ghost Provider

| Field        | Value                          |
|--------------|--------------------------------|
| **Feature**  | Ghost Publishing Provider      |
| **Date**     | 2026-03-27                     |
| **Platform ID** | `ghost`                     |
| **Tech Design** | [New Providers Tech Design](../new-providers/tech-design.md) |

---

## 1. Overview

Self-hosted Ghost CMS publishing provider. Uses the Ghost Admin API with JWT authentication signed from an admin API key.

## 2. Provider Class

### File: `src/providers/ghost.ts`

```typescript
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

  validate(content: string): ValidationResult { ... }
  async publish(content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  async update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  formatContent(content: string): string { ... }

  private signJwt(): string { ... }
  private extractTitle(content: string, meta: PublishMeta): string { ... }
  private buildPayload(content: string, meta: PublishMeta): Record<string, unknown> { ... }
}
```

## 3. JWT Generation

Ghost requires a short-lived JWT signed with HS256 using the secret portion of the admin API key.

```typescript
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
```

No external JWT library required. Uses Node `crypto.createHmac` with the hex-decoded secret.

## 4. API Endpoints

### 4.1 Publish (Create Post)

```
POST {apiBase}/posts/?source=html
Authorization: Ghost {jwt}
Content-Type: application/json
```

**Request body:**
```json
{
  "posts": [{
    "title": "Article Title",
    "html": "<p>Content...</p>",
    "status": "published",
    "tags": [{ "name": "javascript" }, { "name": "tutorial" }],
    "feature_image": "https://example.com/image.jpg"
  }]
}
```

**Response (201):**
```json
{
  "posts": [{
    "id": "63a1...",
    "uuid": "...",
    "url": "https://myblog.com/article-title/",
    "slug": "article-title",
    "updated_at": "2026-03-27T10:00:00.000Z"
  }]
}
```

### 4.2 Update Post

Requires `updated_at` from a GET to prevent conflict. Two-step process:

**Step 1: GET current post**
```
GET {apiBase}/posts/{id}/
Authorization: Ghost {jwt}
```

**Step 2: PUT updated post**
```
PUT {apiBase}/posts/{id}/?source=html
Authorization: Ghost {jwt}
Content-Type: application/json
```

**Request body:**
```json
{
  "posts": [{
    "title": "Updated Title",
    "html": "<p>Updated content...</p>",
    "updated_at": "2026-03-27T10:00:00.000Z",
    "tags": [{ "name": "javascript" }]
  }]
}
```

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
```

### 5.3 `update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
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
```

### 5.4 `buildPayload` helper

```typescript
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

private extractTitle(content: string, meta: PublishMeta): string {
  if (meta.title) return meta.title;
  const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
  return h1Match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? 'Untitled';
}
```

## 6. Validator

### File: `src/validators/ghost.ts`

```typescript
import type { ValidationResult } from '../providers/types.js';

export function validateGhostContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Ghost article content is empty.'] };
  }

  // Check for title in frontmatter or H1
  const hasFm = content.match(/^---\n([\s\S]*?)\n---/);
  const hasH1 = content.match(/^#\s+(.+)$/m);

  if (!hasFm && !hasH1) {
    errors.push('Ghost article missing title (no frontmatter block or H1 heading found).');
  } else if (hasFm && !content.match(/^---[\s\S]*?title:/m)) {
    errors.push('Ghost article missing required frontmatter field: title.');
  }

  return { valid: errors.length === 0, errors };
}
```

## 7. Config Fields

| Config Key | Type | Required | Description |
|------------|------|----------|-------------|
| `ghostUrl` | `string` | Yes | Ghost instance URL (e.g., `https://myblog.com`) |
| `ghostAdminApiKey` | `string` | Yes | Admin API key in `{key_id}:{secret}` format |

Both fields must be present for the provider to register.

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Malformed admin API key (no colon) | Throw `ProviderError` at construction time |
| HTTP 401 (expired JWT) | `ProviderError` with status + body |
| HTTP 404 on update | `ProviderError` with status + body |
| HTTP 422 (validation) | `ProviderError` with Ghost error details |
| Network timeout | Handled by `httpRequest` retry logic |

## 9. Test Cases

### Unit Tests (`tests/unit/providers/ghost.test.ts`)

| # | Test | Assertion |
|---|------|-----------|
| 1 | Constructor splits key correctly | `keyId` and `secret` set |
| 2 | Constructor rejects malformed key | Throws `ProviderError` |
| 3 | `signJwt()` produces valid 3-part token | Header has `kid`, payload has `aud: "/admin/"` |
| 4 | `signJwt()` uses HS256 with hex-decoded secret | Signature verifiable with known test vector |
| 5 | `formatContent()` converts markdown to HTML | Output contains `<p>`, `<h1>` etc. |
| 6 | `buildPayload()` maps tags to `[{name}]` format | Tags array correct |
| 7 | `buildPayload()` sets draft status | `status: 'draft'` when `meta.draft=true` |
| 8 | `publish()` sends correct POST | URL, headers, body structure verified |
| 9 | `publish()` returns articleId from response | `articleId` matches `posts[0].id` |
| 10 | `update()` fetches `updated_at` then PUTs | Two HTTP calls in sequence |
| 11 | `update()` returns failed on GET error | `status: 'failed'` |
| 12 | `publish()` returns failed on non-ProviderError | Catches and wraps |

### Validator Tests (`tests/unit/validators/ghost.test.ts`)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Empty content | `""` | Invalid, "content is empty" |
| 2 | Content with H1 | `"# Title\nBody"` | Valid |
| 3 | Content with frontmatter title | `"---\ntitle: X\n---\nBody"` | Valid |
| 4 | Frontmatter without title | `"---\ntags: [a]\n---\nBody"` | Invalid |
| 5 | No title, no frontmatter | `"Just body text"` | Invalid |
