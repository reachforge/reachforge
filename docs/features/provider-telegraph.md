# Feature Spec: Telegraph Provider

| Field        | Value                              |
|--------------|------------------------------------|
| **Feature**  | Telegraph (Telegra.ph) Provider    |
| **Date**     | 2026-03-27                         |
| **Platform ID** | `telegraph`                     |
| **Tech Design** | [New Providers Tech Design](../new-providers/tech-design.md) |

---

## 1. Overview

Telegraph (Telegra.ph) publishing provider. Telegraph does not accept HTML or Markdown directly -- it requires a custom JSON node format. The provider converts Markdown to HTML via `markdownToHtml()`, then converts HTML to Telegraph nodes via a lightweight built-in parser.

## 2. Provider Class

### File: `src/providers/telegraph.ts`

```typescript
import type { PlatformProvider, PublishMeta, PublishResult, ValidationResult, ContentFormat } from './types.js';
import { httpRequest } from '../utils/http.js';
import { markdownToHtml } from '../utils/markdown.js';
import { ProviderError } from '../types/index.js';

const TELEGRAPH_API = 'https://api.telegra.ph';

type TelegraphNode = string | { tag: string; attrs?: Record<string, string>; children?: TelegraphNode[] };

export class TelegraphProvider implements PlatformProvider {
  readonly id = 'telegraph';
  readonly name = 'Telegraph';
  readonly platforms = ['telegraph'];
  readonly contentFormat: ContentFormat = 'html';
  readonly language = 'en';

  constructor(private readonly accessToken: string) {}

  validate(content: string): ValidationResult { ... }
  async publish(content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  async update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult> { ... }
  formatContent(content: string): string { ... }
}

export function htmlToTelegraphNodes(html: string): TelegraphNode[] { ... }
```

## 3. HTML-to-Telegraph Node Converter

Telegraph expects content as an array of `Node` objects:

```typescript
type TelegraphNode = string | {
  tag: string;                          // "p", "h3", "h4", "blockquote", "ul", "ol", "li",
                                        // "a", "img", "strong", "em", "code", "pre", "br", "hr"
  attrs?: Record<string, string>;       // e.g., { href: "..." } for <a>, { src: "..." } for <img>
  children?: TelegraphNode[];
};
```

### Supported tags

Telegraph only supports: `a`, `aside`, `b`, `blockquote`, `br`, `code`, `em`, `figcaption`, `figure`, `h3`, `h4`, `hr`, `i`, `img`, `li`, `ol`, `p`, `pre`, `s`, `strong`, `u`, `ul`.

### Converter implementation

```typescript
export function htmlToTelegraphNodes(html: string): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];
  // Mapping: h1/h2 -> h3, h5/h6 -> h4 (Telegraph only has h3/h4)
  const TAG_MAP: Record<string, string> = { h1: 'h3', h2: 'h3', h5: 'h4', h6: 'h4' };
  const ALLOWED_TAGS = new Set([
    'a', 'aside', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption',
    'figure', 'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
    's', 'strong', 'u', 'ul',
  ]);

  // Regex-based parser: split HTML into tags and text segments
  const TOKEN_RE = /<(\/?)(\w+)([^>]*)>/g;
  let lastIndex = 0;
  const stack: { tag: string; attrs?: Record<string, string>; children: TelegraphNode[] }[] = [];

  function addToParent(node: TelegraphNode): void {
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      nodes.push(node);
    }
  }

  function parseAttrs(attrStr: string): Record<string, string> | undefined {
    const attrs: Record<string, string> = {};
    const ATTR_RE = /(\w+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = ATTR_RE.exec(attrStr)) !== null) {
      attrs[m[1]] = m[2];
    }
    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    // Add text before this tag
    const text = html.slice(lastIndex, match.index).trim();
    if (text) addToParent(text);
    lastIndex = TOKEN_RE.lastIndex;

    const isClose = match[1] === '/';
    let tag = match[2].toLowerCase();
    const attrStr = match[3];

    // Map unsupported heading tags
    if (TAG_MAP[tag]) tag = TAG_MAP[tag];

    // Skip unsupported tags (unwrap their children)
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (isClose) {
      // Pop from stack, add completed node to parent
      if (stack.length > 0 && stack[stack.length - 1].tag === tag) {
        const completed = stack.pop()!;
        const node: TelegraphNode = { tag: completed.tag };
        if (completed.attrs) node.attrs = completed.attrs;
        if (completed.children.length > 0) node.children = completed.children;
        addToParent(node);
      }
    } else if (tag === 'br' || tag === 'hr' || tag === 'img') {
      // Self-closing tags
      const attrs = parseAttrs(attrStr);
      const node: TelegraphNode = { tag };
      if (attrs) node.attrs = attrs;
      addToParent(node);
    } else {
      // Opening tag
      stack.push({ tag, attrs: parseAttrs(attrStr), children: [] });
    }
  }

  // Remaining text
  const remaining = html.slice(lastIndex).trim();
  if (remaining) addToParent(remaining);

  return nodes;
}
```

## 4. API Endpoints

### 4.1 Create Page

```
POST https://api.telegra.ph/createPage
Content-Type: application/json
```

**Request body:**
```json
{
  "access_token": "...",
  "title": "Article Title",
  "content": [
    { "tag": "p", "children": ["Hello world"] },
    { "tag": "p", "children": [
      "Visit ",
      { "tag": "a", "attrs": { "href": "https://example.com" }, "children": ["here"] }
    ]}
  ],
  "return_content": false
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "path": "Article-Title-03-27",
    "url": "https://telegra.ph/Article-Title-03-27",
    "title": "Article Title",
    "views": 0
  }
}
```

### 4.2 Edit Page

```
POST https://api.telegra.ph/editPage/{path}
Content-Type: application/json
```

**Request body:** Same as createPage (minus `return_content`).

**Response:** Same structure as createPage.

Note: `articleId` stored in meta.yaml is the `path` value (e.g., `"Article-Title-03-27"`).

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
  const nodes = htmlToTelegraphNodes(html);
  const title = meta.title ?? this.extractTitleFromHtml(html) ?? 'Untitled';

  const body = JSON.stringify({
    access_token: this.accessToken,
    title,
    content: nodes,
    return_content: false,
  });

  try {
    const response = await httpRequest(`${TELEGRAPH_API}/createPage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      throw new ProviderError('telegraph', `API returned ${response.status}: ${response.body}`);
    }

    const data = response.json<{ ok: boolean; result?: { path: string; url: string }; error?: string }>();
    if (!data.ok || !data.result) {
      throw new ProviderError('telegraph', `API error: ${data.error ?? 'Unknown error'}`);
    }

    return { platform: 'telegraph', status: 'success', url: data.result.url, articleId: data.result.path };
  } catch (err: unknown) {
    if (err instanceof ProviderError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { platform: 'telegraph', status: 'failed', error: message };
  }
}
```

### 5.3 `update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>`

```typescript
async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
  const html = this.formatContent(content);
  const nodes = htmlToTelegraphNodes(html);
  const title = meta.title ?? this.extractTitleFromHtml(html) ?? 'Untitled';

  const body = JSON.stringify({
    access_token: this.accessToken,
    title,
    content: nodes,
  });

  try {
    const response = await httpRequest(`${TELEGRAPH_API}/editPage/${articleId}`, {
      method: 'POST',        // Telegraph uses POST for edits too
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      throw new ProviderError('telegraph', `API returned ${response.status}: ${response.body}`);
    }

    const data = response.json<{ ok: boolean; result?: { path: string; url: string }; error?: string }>();
    if (!data.ok || !data.result) {
      throw new ProviderError('telegraph', `API error: ${data.error ?? 'Unknown error'}`);
    }

    return { platform: 'telegraph', status: 'success', url: data.result.url, articleId: data.result.path };
  } catch (err: unknown) {
    if (err instanceof ProviderError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { platform: 'telegraph', status: 'failed', error: message };
  }
}

private extractTitleFromHtml(html: string): string | undefined {
  const match = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
  return match?.[1]?.replace(/<[^>]+>/g, '').trim();
}
```

## 6. Validator

### File: `src/validators/telegraph.ts`

```typescript
import type { ValidationResult } from '../providers/types.js';

export function validateTelegraphContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['Telegraph article content is empty.'] };
  }

  // Extract title from frontmatter or H1
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
    errors.push('Telegraph article missing title (no frontmatter title or H1 heading found).');
  } else if (title.length > 256) {
    errors.push(`Telegraph title exceeds 256 character limit (found: ${title.length}).`);
  }

  return { valid: errors.length === 0, errors };
}
```

## 7. Config Fields

| Config Key | Type | Required | Description |
|------------|------|----------|-------------|
| `telegraphAccessToken` | `string` | Yes | Telegra.ph access token |

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| `ok: false` in response | `ProviderError` with `error` field from response |
| Invalid access token | Telegraph returns `ok: false, error: "ACCESS_TOKEN_INVALID"` |
| Title > 256 chars | Caught by validator pre-publish |
| Empty content array | Telegraph returns `ok: false, error: "CONTENT_TEXT_REQUIRED"` |
| Network timeout | Handled by `httpRequest` retry logic |

## 9. Test Cases

### Unit Tests (`tests/unit/providers/telegraph.test.ts`)

| # | Test | Assertion |
|---|------|-----------|
| 1 | `htmlToTelegraphNodes` converts `<p>text</p>` | `[{ tag: "p", children: ["text"] }]` |
| 2 | `htmlToTelegraphNodes` converts nested tags | `<p><strong>bold</strong></p>` -> nested node |
| 3 | `htmlToTelegraphNodes` maps h1 to h3 | Input `<h1>X</h1>` -> `{ tag: "h3" }` |
| 4 | `htmlToTelegraphNodes` handles `<a href="...">` | `attrs: { href: "..." }` preserved |
| 5 | `htmlToTelegraphNodes` handles `<img src="...">` | Self-closing, attrs preserved |
| 6 | `htmlToTelegraphNodes` strips unsupported tags | `<div><p>X</p></div>` -> just the `<p>` node |
| 7 | `formatContent()` produces HTML | Markdown input -> HTML output |
| 8 | `publish()` sends correct body structure | `access_token`, `title`, `content` array |
| 9 | `publish()` uses path as articleId | `articleId === data.result.path` |
| 10 | `update()` POSTs to `/editPage/{path}` | URL includes articleId |
| 11 | `publish()` handles `ok: false` response | Throws `ProviderError` |
| 12 | `publish()` catches non-provider errors | Returns `status: 'failed'` |

### Validator Tests (`tests/unit/validators/telegraph.test.ts`)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Empty content | `""` | Invalid |
| 2 | Content with short title | `"# Title\nBody"` | Valid |
| 3 | Title > 256 chars | `"# ${'x'.repeat(257)}\nBody"` | Invalid, length error |
| 4 | No title | `"Just body text"` | Invalid |
| 5 | Frontmatter title | `"---\ntitle: X\n---\nBody"` | Valid |
