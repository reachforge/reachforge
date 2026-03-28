# Technical Design: Update Published Articles

| Field          | Value                                          |
|----------------|------------------------------------------------|
| **Document**   | Tech Design v1.0                               |
| **Date**       | 2026-03-27                                     |
| **Author**     | —                                              |
| **Status**     | Draft                                          |
| **Components** | 5 (schema changes, ID capture, provider methods, command, MCP) |

---

## 1. Overview

### Problem Statement

ReachForge publishes articles to Dev.to, Hashnode, and GitHub Discussions but has no mechanism to update them after publication. Users who fix typos, add sections, or restructure content must manually call each platform's API or delete-and-republish, losing engagement metrics.

### Goals

1. Introduce `reach update <article>` to push content changes to already-published platforms.
2. Capture and persist platform-assigned article IDs during the initial `publish` flow.
3. Add `update()` methods to Dev.to, Hashnode, and GitHub providers.
4. Expose the update command via MCP tooling.
5. Maintain backward compatibility: existing meta.yaml files without `article_id` remain valid.

### Non-Goals

- Updating articles published via external file without `--track` (no `article_id` stored).
- Updating X/Twitter posts (Postiz API does not support tweet editing).
- Selective field updates (e.g., update only tags but not body). The full article is re-sent.
- Conflict detection between local and remote content.

---

## 2. Background

### Current Publish Flow

```
User content (02_adapted/article.devto.md)
  → validate() → formatContent() → publish() → PublishResult { platform, status, url }
  → meta.yaml: platforms.devto = { status: "success", url: "..." }
```

The publish flow discards the platform-assigned article ID. All three APIs (Dev.to, Hashnode, GitHub) return an ID in the publish response, but only the `url` field is extracted. Without the ID, there is no way to call the update endpoint.

### Why Update Is Needed

Content publishing is iterative. After an article is live, authors commonly need to:
- Fix errors spotted by readers
- Add follow-up sections or errata
- Update code examples for new library versions
- Improve SEO (title, tags)

Currently the only option is manual API calls per platform. This breaks the single-command philosophy of ReachForge.

---

## 3. Design

### 3.1 Schema Changes

#### 3.1.1 `PlatformPublishStatus` (src/types/schemas.ts)

Add optional `article_id` field to track the platform-assigned identifier.

```typescript
// Before
export const PlatformPublishStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
  published_at: z.string().optional(),
});

// After
export const PlatformPublishStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
  published_at: z.string().optional(),
  article_id: z.string().optional(),   // NEW: platform-assigned article identifier
});
```

**Backward compatibility**: The field is optional. Existing meta.yaml files without `article_id` parse without error. The `update` command will check for its presence and fail gracefully if missing.

**meta.yaml example after publish**:
```yaml
articles:
  my-article:
    status: published
    platforms:
      devto:
        status: success
        url: https://dev.to/user/my-article-abc
        published_at: "2026-03-27T10:00:00Z"
        article_id: "1842567"               # NEW
      hashnode:
        status: success
        url: https://blog.example.com/my-article
        published_at: "2026-03-27T10:00:00Z"
        article_id: "65f1a2b3c4d5e6f7a8b9c0d1"  # NEW
```

#### 3.1.2 `PublishResult` (src/providers/types.ts)

Add optional `articleId` field so providers can return the platform ID.

```typescript
// Before
export interface PublishResult {
  platform: string;
  status: 'success' | 'failed';
  url?: string;
  error?: string;
}

// After
export interface PublishResult {
  platform: string;
  status: 'success' | 'failed';
  url?: string;
  error?: string;
  articleId?: string;   // NEW: platform-assigned article identifier
}
```

#### 3.1.3 `PlatformProvider` Interface (src/providers/types.ts)

Add optional `update()` method. Optional to maintain backward compatibility with providers that do not support updates (e.g., MockProvider, PostizProvider).

```typescript
export interface PlatformProvider {
  readonly id: string;
  readonly name: string;
  readonly platforms: string[];
  readonly contentFormat: ContentFormat;
  readonly language: string;

  validate(content: string): ValidationResult;
  publish(content: string, meta: PublishMeta): Promise<PublishResult>;
  formatContent(content: string): string;
  update?(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>;  // NEW
}
```

The `update()` method signature mirrors `publish()` but takes the `articleId` as the first parameter. Return type is the same `PublishResult` (with the same `articleId` field populated on success).

#### 3.1.4 `UpdateMeta` Type (src/providers/types.ts)

Reuse existing `PublishMeta` for update calls. No new type needed -- title, tags, canonical, draft, and coverImage all apply to updates.

### 3.2 Article ID Capture During Publish

Each provider's `publish()` method must extract the article ID from the API response and include it in `PublishResult.articleId`. The `publishContentToPlatforms()` function must then persist it to meta.yaml.

#### 3.2.1 Dev.to Provider (src/providers/devto.ts)

The Dev.to `POST /api/articles` response body includes `{ id: number, url: string, ... }`.

```typescript
// Current: response.json<{ url: string }>()
// Change to: response.json<{ id: number; url: string }>()
const data = response.json<{ id: number; url: string }>();
return {
  platform: 'devto',
  status: 'success',
  url: data.url,
  articleId: String(data.id),  // NEW
};
```

#### 3.2.2 Hashnode Provider (src/providers/hashnode.ts)

The `publishPost` mutation response includes `post.id`. Update the GraphQL selection set and extract it.

```graphql
# Current selection
post { slug, url, publication { url } }

# Updated selection
post { id, slug, url, publication { url } }
```

```typescript
const post = data.data?.publishPost?.post;
return {
  platform: 'hashnode',
  status: 'success',
  url: url ?? `${publicationUrl}/${slug}`,
  articleId: post?.id,  // NEW
};
```

#### 3.2.3 GitHub Provider (src/providers/github.ts)

The `createDiscussion` mutation response already requests `discussion { url id }`. Just extract the `id`.

```typescript
const discussion = createData.data?.createDiscussion?.discussion;
return {
  platform: 'github',
  status: 'success',
  url: discussion?.url,
  articleId: discussion?.id,  // NEW
};
```

#### 3.2.4 Persisting to meta.yaml (src/commands/publish.ts)

In `publishContentToPlatforms()`, when a publish succeeds, include `article_id` in the platform result:

```typescript
// Line ~253 in publish.ts
if (result.status === 'success') {
  platformResults[platform] = {
    status: 'success',
    url: result.url,
    published_at: new Date().toISOString(),
    article_id: result.articleId,  // NEW
  };
  // ...
}
```

The existing `writeArticleMeta()` call at line ~558 already writes the full `platformResults` object to meta.yaml, so no additional persistence code is needed.

### 3.3 Provider Update Methods

#### 3.3.1 Dev.to: `PUT /api/articles/{id}`

Same request body as POST. The Dev.to API uses the same `article` object shape for both create and update.

```typescript
async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
  // Title extraction, content cleaning, published state — identical to publish()
  // Extract shared into a private helper: _preparePayload(content, meta)

  const body = this._preparePayload(content, meta);

  try {
    const response = await httpRequest(`${DEVTO_API_BASE}/articles/${articleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = response.body;
      throw new ProviderError('devto', `API returned ${response.status}: ${errorBody}`);
    }

    const data = response.json<{ id: number; url: string }>();
    return {
      platform: 'devto',
      status: 'success',
      url: data.url,
      articleId: String(data.id),
    };
  } catch (err: unknown) {
    if (err instanceof ProviderError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { platform: 'devto', status: 'failed', error: message };
  }
}
```

**Refactoring**: Extract the shared title extraction, content cleaning, and body construction from `publish()` into a private `_preparePayload()` method to avoid duplication.

#### 3.3.2 Hashnode: `updatePost` GraphQL Mutation

```graphql
mutation UpdatePost($input: UpdatePostInput!) {
  updatePost(input: $input) {
    post { id, slug, url, publication { url } }
  }
}
```

Variables:
```json
{
  "input": {
    "id": "<articleId>",
    "title": "...",
    "contentMarkdown": "...",
    "tags": [{ "name": "...", "slug": "..." }],
    "coverImageOptions": { "coverImageURL": "..." }
  }
}
```

Key difference from `publishPost`: `UpdatePostInput` takes `id` (the post ID) instead of `publicationId`. The `publicationId` is not needed for updates.

```typescript
async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
  const { title, body } = this._prepareContent(content, meta);

  const mutation = `
    mutation UpdatePost($input: UpdatePostInput!) {
      updatePost(input: $input) {
        post { id, slug, url, publication { url } }
      }
    }
  `;

  try {
    const response = await httpRequest(HASHNODE_GQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            id: articleId,
            title,
            contentMarkdown: body.trim(),
            tags: (meta.tags ?? []).map(name => ({
              name,
              slug: name.toLowerCase().replace(/\s+/g, '-'),
            })),
            ...(meta.coverImage ? { coverImageOptions: { coverImageURL: meta.coverImage } } : {}),
          },
        },
      }),
    });

    if (!response.ok) {
      throw new ProviderError('hashnode', `API returned ${response.status}: ${response.body}`);
    }

    const data = response.json<{
      data?: { updatePost?: { post?: { id?: string; slug?: string; url?: string; publication?: { url?: string } } } };
      errors?: Array<{ message: string }>;
    }>();

    if (data.errors?.length) {
      throw new ProviderError('hashnode', `Hashnode API error: ${data.errors[0].message}`);
    }

    const post = data.data?.updatePost?.post;
    const url = post?.url;
    const publicationUrl = post?.publication?.url?.replace(/\/$/, '') ?? '';
    const slug = post?.slug ?? 'post';

    return {
      platform: 'hashnode',
      status: 'success',
      url: url ?? `${publicationUrl}/${slug}`,
      articleId: post?.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { platform: 'hashnode', status: 'failed', error: message };
  }
}
```

#### 3.3.3 GitHub: `updateDiscussion` GraphQL Mutation

```graphql
mutation UpdateDiscussion($input: UpdateDiscussionInput!) {
  updateDiscussion(input: $input) {
    discussion { id, url }
  }
}
```

Variables:
```json
{
  "input": {
    "discussionId": "<articleId>",
    "title": "...",
    "body": "..."
  }
}
```

The GitHub `updateDiscussion` mutation does not require re-resolving the repository ID or category ID. It only needs the discussion's node ID (the `id` field from `createDiscussion`).

```typescript
async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
  const h1Match = content.match(/^#\s+(.+)$/m);
  const title = meta.title ?? h1Match?.[1]?.trim() ?? 'Untitled';
  const body = h1Match ? content.replace(/^#\s+.+\n?/, '').trim() : content;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.token}`,
  };

  try {
    const updateRes = await httpRequest(GITHUB_GQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `mutation UpdateDiscussion($input: UpdateDiscussionInput!) {
          updateDiscussion(input: $input) {
            discussion { id url }
          }
        }`,
        variables: {
          input: {
            discussionId: articleId,
            title,
            body,
          },
        },
      }),
    });

    if (!updateRes.ok) {
      throw new ProviderError('github', `API returned ${updateRes.status}: ${updateRes.body}`);
    }

    const updateData = updateRes.json<{
      data?: { updateDiscussion?: { discussion?: { id?: string; url?: string } } };
      errors?: Array<{ message: string }>;
    }>();

    if (updateData.errors?.length) {
      throw new ProviderError('github', `GitHub API error: ${updateData.errors[0].message}`);
    }

    const discussion = updateData.data?.updateDiscussion?.discussion;
    return {
      platform: 'github',
      status: 'success',
      url: discussion?.url,
      articleId: discussion?.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { platform: 'github', status: 'failed', error: message };
  }
}
```

#### 3.3.4 MockProvider (src/providers/mock.ts)

Add a mock `update()` for testing:

```typescript
async update(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult> {
  console.warn(`[MOCK MODE] No real API call -- content not actually updated.`);
  return {
    platform: 'mock',
    status: 'success',
    url: `https://mock.reach.dev/post/${articleId}`,
    articleId,
  };
}
```

### 3.4 Update Command

#### 3.4.1 CLI Signature

```
reach update <article> [-p, --platforms <list>] [-n, --dry-run] [--json] [--force]
```

| Option | Description |
|--------|-------------|
| `<article>` | Required. Pipeline article name (e.g., `my-article`). |
| `-p, --platforms` | Optional. Comma-separated platform filter. Default: all published platforms. |
| `-n, --dry-run` | Preview what would be updated without calling APIs. |
| `--json` | JSON output envelope. |
| `--force` | Update even if some platforms lack `article_id` (skip those, update the rest). |

#### 3.4.2 Command Flow

```
reach update my-article
  │
  ├─ 1. Resolve article in meta.yaml
  │     └─ Error if article not found or status !== 'published'
  │
  ├─ 2. Read platform statuses from meta.yaml
  │     └─ Filter to platforms with status === 'success' AND article_id present
  │     └─ Apply --platforms filter if provided
  │     └─ Error if no updatable platforms remain
  │
  ├─ 3. Read adapted content from 02_adapted/ (or 03_published/)
  │     └─ For each platform: read {article}.{platform}.md
  │     └─ Error if content file missing for any target platform
  │
  ├─ 4. Validate content per platform
  │
  ├─ 5. For each platform:
  │     ├─ Load provider (ProviderLoader)
  │     ├─ Check provider has update() method
  │     ├─ Format content (markdown → html if needed)
  │     ├─ Call provider.update(articleId, content, meta)
  │     └─ Record result
  │
  ├─ 6. Update meta.yaml with new timestamps
  │     └─ platforms.{platform}.updated_at = now
  │
  └─ 7. Print summary
```

#### 3.4.3 Content Source Resolution

The update command reads content from `03_published/` (where files land after publish) or `02_adapted/` (if the user ran `reach adapt` again after publish, or edited adapted files directly). Priority:

1. If `02_adapted/{article}.{platform}.md` exists, use it (user has edited post-publish).
2. Else if `03_published/{article}.{platform}.md` exists, use it.
3. Else error: "No content found for {article} on {platform}".

This supports both workflow paths:
- **Path A**: User edits `02_adapted/article.devto.md` directly, then runs `reach update article`.
- **Path B**: User edits draft, runs `reach adapt article`, then runs `reach update article`.

#### 3.4.4 Updated Metadata Schema

Add `updated_at` to `PlatformPublishStatus`:

```typescript
export const PlatformPublishStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
  published_at: z.string().optional(),
  article_id: z.string().optional(),
  updated_at: z.string().optional(),   // NEW: last update timestamp
});
```

#### 3.4.5 Implementation File

New file: `src/commands/update.ts`

```typescript
export interface UpdateOptions {
  article: string;
  platforms?: string;
  dryRun?: boolean;
  json?: boolean;
  force?: boolean;
  cover?: string;
  config?: ReachforgeConfig;
}

export async function updateCommand(
  engine: PipelineEngine,
  options: UpdateOptions,
): Promise<void>;
```

#### 3.4.6 Error Cases

| Condition | Behavior |
|-----------|----------|
| Article not in meta.yaml | Error: `Article "X" not found in meta.yaml` |
| Article status !== 'published' | Error: `Article "X" has not been published yet. Use 'reach publish' first.` |
| No platforms with `article_id` | Error: `No platforms have article IDs stored. Republish with the latest version to capture IDs.` |
| Platform filter yields no updatable platforms | Error: `None of the specified platforms (X) have article IDs for "Y".` |
| Provider has no `update()` method | Warning: `Platform "X" does not support updates. Skipping.` |
| Content file missing | Error: `No content found for "X" on platform "Y". Run 'reach adapt' first.` |
| API call fails | Per-platform failure recorded in results, other platforms continue. |
| `--force` not set and some platforms lack IDs | Error listing missing platforms, suggest `--force` to skip them. |

### 3.5 MCP Integration

Add `UpdateToolSchema` to `src/mcp/tools.ts`:

```typescript
export const UpdateToolSchema = z.object({
  article: z.string().min(1).describe('Name of the published article to update on platforms'),
  platforms: z.string().optional().describe('Comma-separated platform filter. Default: all published platforms with article_id'),
  dryRun: z.boolean().optional().describe('If true, preview what would be updated without calling APIs'),
  force: z.boolean().optional().describe('If true, skip platforms without article_id instead of erroring'),
  cover: z.string().optional().describe('Cover image path or URL'),
});
```

Add to `TOOL_METADATA`:

```typescript
'reach.update': {
  description: 'Update an already-published article on its platforms. Reads updated content from 02_adapted (or 03_published) and pushes changes via platform update APIs. Only works for pipeline articles with stored article_id.',
  inputSchema: jsonSchema(UpdateToolSchema),
},
```

### 3.6 CLI Registration

In the main CLI entry point (Commander.js program), register the update command:

```typescript
program
  .command('update <article>')
  .description('Update a published article on its platforms')
  .option('-p, --platforms <list>', 'Comma-separated platform filter')
  .option('-n, --dry-run', 'Preview without executing')
  .option('--force', 'Skip platforms without article_id')
  .option('--json', 'JSON output')
  .option('--cover <path>', 'Cover image path or URL')
  .action(async (article, opts) => {
    await updateCommand(engine, { article, ...opts });
  });
```

### 3.7 JSON Output Envelope

```json
{
  "jsonVersion": 1,
  "command": "update",
  "success": true,
  "data": {
    "updated": [
      { "article": "my-article", "platform": "devto", "status": "success", "url": "..." }
    ],
    "failed": [
      { "article": "my-article", "platform": "hashnode", "status": "failed", "error": "..." }
    ],
    "skipped": ["github"]
  }
}
```

---

## 4. Implementation Plan

Ordered by dependency. Each step is independently testable.

### Step 1: Schema Changes
**Files**: `src/types/schemas.ts`, `src/providers/types.ts`
- Add `article_id` to `PlatformPublishStatusSchema`
- Add `updated_at` to `PlatformPublishStatusSchema`
- Add `articleId` to `PublishResult`
- Add `update?()` to `PlatformProvider`
- Run existing tests to confirm backward compatibility

### Step 2: Article ID Capture in Providers
**Files**: `src/providers/devto.ts`, `src/providers/hashnode.ts`, `src/providers/github.ts`
- Extract `articleId` from each provider's publish response
- Return it in `PublishResult`

### Step 3: Persist Article ID in Publish Flow
**Files**: `src/commands/publish.ts`
- In `publishContentToPlatforms()`, propagate `result.articleId` to `platformResults[platform].article_id`
- Existing meta.yaml write already handles the full object

### Step 4: Provider Update Methods
**Files**: `src/providers/devto.ts`, `src/providers/hashnode.ts`, `src/providers/github.ts`, `src/providers/mock.ts`
- Implement `update()` on each provider
- Refactor shared payload preparation into private helpers to reduce duplication

### Step 5: Update Command
**Files**: `src/commands/update.ts` (new)
- Implement `updateCommand()` with full flow (resolve, read, validate, update, persist)
- Handle all error cases from Section 3.4.6

### Step 6: CLI Registration
**Files**: `src/cli.ts` (or equivalent main entry point)
- Register `reach update <article>` with Commander.js options

### Step 7: MCP Integration
**Files**: `src/mcp/tools.ts`
- Add `UpdateToolSchema` and `TOOL_METADATA['reach.update']`
- Wire up in MCP handler

### Step 8: Help Text
**Files**: `src/help.ts`
- Add `update` to grouped help output

---

## 5. Testing Strategy

### 5.1 Unit Tests

| Test | File | Coverage |
|------|------|----------|
| Schema backward compat | `tests/unit/schemas.test.ts` | `PlatformPublishStatusSchema` parses without `article_id` |
| Schema with article_id | `tests/unit/schemas.test.ts` | `PlatformPublishStatusSchema` parses with `article_id` |
| DevTo publish returns articleId | `tests/unit/devto-provider.test.ts` | Mock HTTP, verify `articleId` in result |
| DevTo update success | `tests/unit/devto-provider.test.ts` | Mock HTTP PUT, verify response |
| DevTo update failure | `tests/unit/devto-provider.test.ts` | Mock HTTP 404/500, verify error |
| Hashnode publish returns articleId | `tests/unit/hashnode-provider.test.ts` | Mock HTTP, verify `articleId` in result |
| Hashnode update success | `tests/unit/hashnode-provider.test.ts` | Mock HTTP, verify `updatePost` mutation |
| Hashnode update failure | `tests/unit/hashnode-provider.test.ts` | Mock HTTP error, verify error |
| GitHub publish returns articleId | `tests/unit/github-provider.test.ts` | Mock HTTP, verify `articleId` in result |
| GitHub update success | `tests/unit/github-provider.test.ts` | Mock HTTP, verify `updateDiscussion` mutation |
| GitHub update failure | `tests/unit/github-provider.test.ts` | Mock HTTP error, verify error |
| Mock update | `tests/unit/mock-provider.test.ts` | Returns success with given articleId |

### 5.2 Integration Tests

| Test | File | Coverage |
|------|------|----------|
| Update command: article not published | `tests/integration/update.test.ts` | Error when status is 'adapted' |
| Update command: no article_id | `tests/integration/update.test.ts` | Error when article_id missing |
| Update command: happy path | `tests/integration/update.test.ts` | Full flow with mock provider |
| Update command: platform filter | `tests/integration/update.test.ts` | Only updates specified platforms |
| Update command: --force skips missing IDs | `tests/integration/update.test.ts` | Updates platforms with IDs, skips others |
| Update command: dry run | `tests/integration/update.test.ts` | No API calls made |
| Update command: JSON output | `tests/integration/update.test.ts` | Correct envelope structure |
| Update command: content from 02_adapted | `tests/integration/update.test.ts` | Prefers 02_adapted over 03_published |
| Publish + Update roundtrip | `tests/integration/update.test.ts` | Publish captures ID, update uses it |
| MCP update tool | `tests/integration/mcp.test.ts` | Tool schema present, invocable |

### 5.3 Edge Cases

- Article published to 3 platforms, only 2 have `article_id` (one from before ID capture was added).
- Provider `update()` returns a different URL (e.g., slug changed). Meta.yaml should update the URL.
- Concurrent update calls for the same article (locking via `lockArticle()`).
- Content file exists in both `02_adapted/` and `03_published/` -- prefer `02_adapted/`.

---

## 6. Alternatives Considered

### A. Republish Instead of Update

Force users to delete and republish. Rejected: loses engagement metrics, comments, and bookmarks on all platforms.

### B. Store Article ID in Frontmatter

Embed `<!-- devto_id: 123 -->` in the markdown file. Rejected: mixes platform metadata with content, breaks portability.

### C. Separate Credentials File for IDs

Store IDs in a separate `.reach/ids.yaml`. Rejected: adds unnecessary complexity; meta.yaml already tracks per-platform state.

---

## 7. Open Questions

1. **Postiz/X update support**: If Postiz adds tweet editing in the future, should we capture the post ID now? **Recommendation**: Yes, capture the ID in PostizProvider's `publish()` preemptively, but do not implement `update()` until the API supports it.

2. **`updated_at` granularity**: Should `updated_at` track per-platform or per-article? **Decision**: Per-platform (in `PlatformPublishStatus`), since platforms may be updated independently.
