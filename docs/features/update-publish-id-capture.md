# Feature Spec: Capture Article IDs During Publish

| Field          | Value                                          |
|----------------|------------------------------------------------|
| **Document**   | Feature Spec v1.0                              |
| **Date**       | 2026-03-27                                     |
| **Tech Design** | [Update Command Tech Design](../update-command/tech-design.md) |
| **Depends On** | [update-schema-changes.md](update-schema-changes.md) |
| **Priority**   | P0 (must ship before update command)           |
| **Status**     | Draft                                          |

---

## Summary

Modify each provider's `publish()` method to extract and return the platform-assigned article ID from the API response. Modify `publishContentToPlatforms()` to persist the returned `articleId` to meta.yaml as `article_id`. This is a prerequisite for the update command -- without stored IDs, updates are impossible.

---

## 1. Dev.to Provider

**File**: `src/providers/devto.ts`, `publish()` method (lines 35-102)

### Current Response Parsing (line 87-92)

```typescript
const data = response.json<{ url: string }>();
return {
  platform: 'devto',
  status: 'success',
  url: data.url,
};
```

### Target

```typescript
const data = response.json<{ id: number; url: string }>();
return {
  platform: 'devto',
  status: 'success',
  url: data.url,
  articleId: String(data.id),
};
```

### API Reference

Dev.to `POST /api/articles` response body (relevant fields):
```json
{
  "id": 1842567,
  "url": "https://dev.to/username/article-slug-abc",
  "title": "...",
  "published": true
}
```

The `id` field is always a positive integer. We store it as a string for consistency across providers (Hashnode and GitHub use string IDs). `String(data.id)` converts `1842567` to `"1842567"`.

### Error Path

On failure (`!response.ok` or catch block), the return does not include `articleId`. This is already the correct behavior since failed publishes should not store an ID.

---

## 2. Hashnode Provider

**File**: `src/providers/hashnode.ts`, `publish()` method (lines 37-104)

### Current GraphQL Selection (line 51)

```graphql
post { slug, url, publication { url } }
```

### Target GraphQL Selection

```graphql
post { id, slug, url, publication { url } }
```

### Current Response Parsing (line 94-99)

```typescript
const post = data.data?.publishPost?.post;
const url = post?.url;
const publicationUrl = post?.publication?.url?.replace(/\/$/, '') ?? '';
const slug = post?.slug ?? 'post';
return { platform: 'hashnode', status: 'success', url: url ?? `${publicationUrl}/${slug}` };
```

### Target

```typescript
const post = data.data?.publishPost?.post;
const url = post?.url;
const publicationUrl = post?.publication?.url?.replace(/\/$/, '') ?? '';
const slug = post?.slug ?? 'post';
return {
  platform: 'hashnode',
  status: 'success',
  url: url ?? `${publicationUrl}/${slug}`,
  articleId: post?.id,
};
```

### Response Type Update (line 81-88)

Add `id` to the response type:

```typescript
const data = response.json<{
  data?: {
    publishPost?: {
      post?: { id?: string; slug?: string; url?: string; publication?: { url?: string } };
    };
  };
  errors?: Array<{ message: string }>;
}>();
```

### API Reference

Hashnode `publishPost` mutation returns a `Post` object. The `id` field is a MongoDB ObjectId hex string (e.g., `"65f1a2b3c4d5e6f7a8b9c0d1"`).

---

## 3. GitHub Provider

**File**: `src/providers/github.ts`, `publish()` method (lines 34-125)

### Current GraphQL Selection (line 92)

```graphql
discussion { url id }
```

The `id` is already requested but not extracted.

### Current Response Parsing (lines 119-120)

```typescript
const discussion = createData.data?.createDiscussion?.discussion;
return { platform: 'github', status: 'success', url: discussion?.url };
```

### Target

```typescript
const discussion = createData.data?.createDiscussion?.discussion;
return {
  platform: 'github',
  status: 'success',
  url: discussion?.url,
  articleId: discussion?.id,
};
```

No changes to the GraphQL query or response type are needed -- the `id` field is already in the selection set and in the TypeScript type (line 111: `discussion?: { url?: string; id?: string }`).

### API Reference

GitHub `createDiscussion` mutation returns a `Discussion` object. The `id` field is a GitHub GraphQL node ID (e.g., `"D_kwDOH..."`), an opaque base64 string used by the `updateDiscussion` mutation.

---

## 4. Postiz Provider (Preemptive)

**File**: `src/providers/postiz.ts`, `publish()` method (lines 40-80)

### Current Response Parsing (lines 65-69)

```typescript
const data = response.json<{ url?: string; id?: string }>();
return {
  platform: 'x',
  status: 'success',
  url: data.url || `https://x.com/i/status/${data.id}`,
};
```

### Target

```typescript
const data = response.json<{ url?: string; id?: string }>();
return {
  platform: 'x',
  status: 'success',
  url: data.url || `https://x.com/i/status/${data.id}`,
  articleId: data.id,
};
```

Even though X/Twitter update is not supported, capturing the ID preemptively costs nothing and may be useful if Postiz adds edit support in the future.

---

## 5. Publish Flow Changes

**File**: `src/commands/publish.ts`, `publishContentToPlatforms()` function (lines 151-270)

### Current Success Handling (lines 252-255)

```typescript
if (result.status === 'success') {
  platformResults[platform] = { status: 'success', url: result.url, published_at: new Date().toISOString() };
  jsonPublished.push({ article: articleLabel, platform, status: 'success', url: result.url });
  if (!options.json) console.log(chalk.green(`  ✔ ${platform}: ${result.url}`));
}
```

### Target

```typescript
if (result.status === 'success') {
  platformResults[platform] = {
    status: 'success',
    url: result.url,
    published_at: new Date().toISOString(),
    article_id: result.articleId,
  };
  jsonPublished.push({ article: articleLabel, platform, status: 'success', url: result.url });
  if (!options.json) console.log(chalk.green(`  ✔ ${platform}: ${result.url}`));
}
```

The `article_id` field flows through the existing `writeArticleMeta()` call (line 558 in `publishPipelineArticle()`) which writes the full `platformResults` object as `platforms` in meta.yaml. No additional code needed.

### Resume Path

When resuming a partially failed publish (existing statuses passed as `existingStatuses`), already-succeeded platforms retain their `article_id`:

```typescript
// Line 177-179 — existing code preserves prior status
platformResults[platform] = existing?.status === 'success'
  ? { ...existing }   // Spread includes article_id if present
  : { status: 'pending' };
```

This works correctly because the spread copies all fields, including `article_id`.

---

## 6. JSON Output

The `jsonPublished` array (used for JSON output) currently has type:
```typescript
Array<{ article: string; platform: string; status: 'success'; url?: string }>
```

Optionally extend to include `articleId`:
```typescript
Array<{ article: string; platform: string; status: 'success'; url?: string; articleId?: string }>
```

This is optional for v1 since the article ID is primarily an internal tracking value, not something users need in CLI output. The ID is always available in meta.yaml.

---

## 7. Test Cases

### Dev.to

```typescript
// test: publish() returns articleId from API response
// Mock httpRequest to return { id: 42, url: 'https://dev.to/user/test' }
const result = await provider.publish('# Test\nBody', {});
expect(result.articleId).toBe('42');
expect(result.status).toBe('success');
```

### Hashnode

```typescript
// test: publish() returns articleId from GraphQL response
// Mock httpRequest to return { data: { publishPost: { post: { id: 'abc123', slug: 'test', url: '...', publication: { url: '...' } } } } }
const result = await provider.publish('# Test\nBody', {});
expect(result.articleId).toBe('abc123');
```

### GitHub

```typescript
// test: publish() returns articleId (discussion node ID)
// Mock httpRequest sequence: (1) repo query returns repoId + categoryId, (2) createDiscussion returns { discussion: { id: 'D_kwDO...', url: '...' } }
const result = await provider.publish('# Test\nBody', {});
expect(result.articleId).toBe('D_kwDO...');
```

### Publish Flow Integration

```typescript
// test: article_id persisted to meta.yaml after publish
// Setup: create adapted file, run publishPipelineArticle with mock provider
// Verify: meta.yaml platforms.mock.article_id is set

// test: article_id preserved on resume
// Setup: meta.yaml has devto with article_id + success, hashnode with failed
// Run publish again (resume) — verify devto article_id still present
```

---

## 8. Rollout Consideration

This change is backward-compatible but introduces a data dependency for the update command. Articles published before this change will not have `article_id` in meta.yaml. The update command must handle this gracefully (documented in the update command feature spec).

After deployment, every new publish automatically captures article IDs. No migration is needed.
