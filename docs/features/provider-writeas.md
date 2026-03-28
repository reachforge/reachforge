# Feature Spec: Write.as Provider

| Field        | Value                              |
|--------------|------------------------------------|
| **Feature**  | Write.as / WriteFreely Provider    |
| **Date**     | 2026-03-27                         |
| **Platform ID** | `writeas`                       |
| **Tech Design** | [New Providers Tech Design](../new-providers/tech-design.md) |

---

## 1. Overview

Write.as (and self-hosted WriteFreely) publishing provider. Accepts Markdown natively, making it the simplest provider to implement. Authentication via access token.

## 2. Provider Class

### File: `src/providers/writeas.ts`

```typescript
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

  validate(content: string): ValidationResult { ... }
  async publish(content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  async update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  formatContent(content: string): string { ... }

  private stripFrontmatter(content: string): string { ... }
  private extractTitle(content: string, meta: PublishMeta): string | undefined { ... }
}
```

## 3. Authentication

Write.as uses a bearer token in the `Authorization` header:

```
Authorization: Token {access_token}
```

The token can be obtained either:
1. Directly from the user (preferred, stored in config)
2. Via `POST /api/auth/login` with `{ alias, pass }` (not implemented in v1)

## 4. API Endpoints

### 4.1 Create Post

```
POST {apiBase}/posts
Authorization: Token {access_token}
Content-Type: application/json
```

**Request body:**
```json
{
  "title": "Article Title",
  "body": "# Article Title\n\nMarkdown content here..."
}
```

**Response (201):**
```json
{
  "code": 201,
  "data": {
    "id": "abc123def456",
    "slug": "article-title",
    "title": "Article Title",
    "body": "...",
    "created": "2026-03-27T10:00:00Z"
  }
}
```

Post URL: `https://write.as/{id}` (anonymous) or `https://write.as/{username}/{slug}` (with collection).

### 4.2 Update Post

```
POST {apiBase}/posts/{id}
Authorization: Token {access_token}
Content-Type: application/json
```

Note: Write.as uses POST (not PUT) for updates.

**Request body:**
```json
{
  "title": "Updated Title",
  "body": "Updated markdown content..."
}
```

**Response (200):** Same structure as create.

## 5. Method Implementations

### 5.1 `formatContent(content: string): string`

Write.as accepts Markdown natively. Strip frontmatter only.

```typescript
formatContent(content: string): string {
  return this.stripFrontmatter(content);
}

private stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}
```

### 5.2 `publish(content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
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
```

### 5.3 `update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
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

private extractTitle(content: string, meta: PublishMeta): string | undefined {
  if (meta.title) return meta.title;
  const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
  if (fmMatch) return fmMatch[1].trim();
  const h1Match = content.match(/^#\s+(.+)$/m);
  return h1Match?.[1]?.trim();
}
```

## 6. Validator

### File: `src/validators/writeas.ts`

```typescript
import type { ValidationResult } from '../providers/types.js';

export function validateWriteasContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Write.as article content is empty.'] };
  }

  // Write.as does not strictly require a title, but body must be non-empty after frontmatter strip
  const stripped = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  if (stripped.length === 0) {
    errors.push('Write.as article body is empty after stripping frontmatter.');
  }

  return { valid: errors.length === 0, errors };
}
```

## 7. Config Fields

| Config Key | Type | Required | Description |
|------------|------|----------|-------------|
| `writeasAccessToken` | `string` | Yes | Write.as / WriteFreely access token |
| `writeasUrl` | `string` | No | Instance URL (defaults to `https://write.as`) |

Only `writeasAccessToken` is required for provider registration.

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| HTTP 401 (invalid token) | `ProviderError` with status + body |
| HTTP 404 on update (bad post ID) | `ProviderError` with status + body |
| HTTP 410 (deleted post) | `ProviderError` with status + body |
| Self-hosted instance unreachable | Handled by `httpRequest` retry logic |

## 9. Test Cases

### Unit Tests (`tests/unit/providers/writeas.test.ts`)

| # | Test | Assertion |
|---|------|-----------|
| 1 | Constructor uses default URL | `apiBase` includes `write.as/api` |
| 2 | Constructor uses custom URL | Custom URL used for self-hosted |
| 3 | `formatContent()` strips frontmatter | Frontmatter removed, body preserved |
| 4 | `formatContent()` preserves content without frontmatter | No change |
| 5 | `extractTitle()` prefers meta.title | meta.title returned |
| 6 | `extractTitle()` falls back to frontmatter | Frontmatter title extracted |
| 7 | `extractTitle()` falls back to H1 | H1 text extracted |
| 8 | `publish()` sends POST with Token auth | Headers correct |
| 9 | `publish()` constructs URL from response id | URL is `{base}/{id}` |
| 10 | `update()` POSTs to `/posts/{id}` | POST method, correct URL |
| 11 | `publish()` handles non-OK response | Throws `ProviderError` |
| 12 | `publish()` catches non-provider errors | Returns `status: 'failed'` |

### Validator Tests (`tests/unit/validators/writeas.test.ts`)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Empty content | `""` | Invalid |
| 2 | Content with body | `"Some text"` | Valid |
| 3 | Frontmatter-only content | `"---\ntitle: X\n---"` | Invalid (empty body after strip) |
| 4 | Content with frontmatter + body | `"---\ntitle: X\n---\nBody"` | Valid |
