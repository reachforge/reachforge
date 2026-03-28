# Feature Spec: Provider Update Methods

| Field          | Value                                          |
|----------------|------------------------------------------------|
| **Document**   | Feature Spec v1.0                              |
| **Date**       | 2026-03-27                                     |
| **Tech Design** | [Update Command Tech Design](../update-command/tech-design.md) |
| **Depends On** | [update-schema-changes.md](update-schema-changes.md), [update-publish-id-capture.md](update-publish-id-capture.md) |
| **Priority**   | P0                                             |
| **Status**     | Draft                                          |

---

## Summary

Implement the `update()` method on DevtoProvider, HashnodeProvider, GitHubProvider, and MockProvider. Each method takes an `articleId` (captured during publish), updated content, and metadata, then calls the platform's update API. Shared payload preparation logic is refactored into private helpers to avoid duplication with `publish()`.

---

## 1. Dev.to Provider

**File**: `src/providers/devto.ts`

### API

```
PUT https://dev.to/api/articles/{id}
Content-Type: application/json
api-key: {API_KEY}

{
  "article": {
    "title": "Updated Title",
    "body_markdown": "Updated body...",
    "published": true,
    "tags": ["typescript", "cli"],
    "canonical_url": "https://...",
    "main_image": "https://..."
  }
}
```

Response: `200 OK` with same body shape as POST (`{ id, url, title, ... }`).

Error responses: `404` if article not found, `401` if unauthorized, `422` if validation fails.

### Refactoring

Extract shared logic from `publish()` into a private helper:

```typescript
private _prepareArticlePayload(
  content: string,
  meta: PublishMeta,
): { article: Record<string, unknown> } {
  // Title extraction (frontmatter > H1 > meta.title > 'Untitled')
  let title = meta.title;
  if (!title) {
    const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
    const h1Match = content.match(/^#\s+(.+)$/m);
    title = fmMatch?.[1]?.trim() ?? h1Match?.[1]?.trim() ?? 'Untitled';
  }

  // Published state: meta.draft > frontmatter > default (true)
  let shouldPublish = true;
  const fmPublishedMatch = content.match(/^---\n[\s\S]*?published:\s*(true|false)/m);
  if (fmPublishedMatch) shouldPublish = fmPublishedMatch[1] === 'true';
  if (meta.draft !== undefined) shouldPublish = !meta.draft;

  // Strip frontmatter and H1
  let cleanedContent = content;
  if (cleanedContent.startsWith('---')) {
    cleanedContent = cleanedContent.replace(/^---\n[\s\S]*?\n---\n?/, '');
  }
  cleanedContent = cleanedContent.replace(/^\s*#\s+.+\n?/, '');

  return {
    article: {
      title,
      body_markdown: cleanedContent,
      published: shouldPublish,
      tags: meta.tags || [],
      canonical_url: meta.canonical,
      ...(meta.coverImage ? { main_image: meta.coverImage } : {}),
    },
  };
}
```

### update() Method

```typescript
async update(articleId: string, content: string, meta: PublishMeta = {}): Promise<PublishResult> {
  const body = JSON.stringify(this._prepareArticlePayload(content, meta));

  try {
    const response = await httpRequest(`${DEVTO_API_BASE}/articles/${articleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body,
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

### Updated publish()

Refactor `publish()` to use `_prepareArticlePayload()`:

```typescript
async publish(content: string, meta: PublishMeta = {}): Promise<PublishResult> {
  const body = JSON.stringify(this._prepareArticlePayload(content, meta));

  try {
    const response = await httpRequest(`${DEVTO_API_BASE}/articles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body,
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

---

## 2. Hashnode Provider

**File**: `src/providers/hashnode.ts`

### API

```graphql
mutation UpdatePost($input: UpdatePostInput!) {
  updatePost(input: $input) {
    post {
      id
      slug
      url
      publication { url }
    }
  }
}
```

Variables:
```json
{
  "input": {
    "id": "<post_id>",
    "title": "Updated Title",
    "contentMarkdown": "Updated body...",
    "tags": [{ "name": "TypeScript", "slug": "typescript" }],
    "coverImageOptions": { "coverImageURL": "https://..." }
  }
}
```

Key difference from `publishPost`: `UpdatePostInput` uses `id` (post ID) instead of `publicationId`. The publication is inferred from the post.

Response shape: same as `publishPost` (nested `post` object with `id`, `slug`, `url`, `publication`).

Error: GraphQL errors array in response body.

### Refactoring

Extract shared content preparation:

```typescript
private _prepareContent(content: string, meta: PublishMeta): { title: string; body: string } {
  const h1Match = content.match(/^#\s+(.+)$/m);
  const fmMatch = content.match(/^---\n[\s\S]*?title:\s*(.+?)\s*(?:\n|$)/m);
  const title = meta.title ?? h1Match?.[1]?.trim() ?? fmMatch?.[1]?.trim() ?? 'Untitled';

  let body = content;
  if (content.startsWith('---')) {
    body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  }
  body = body.replace(/^\s*#\s+.+\n?/, '');

  return { title, body };
}
```

### update() Method

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
      data?: {
        updatePost?: {
          post?: { id?: string; slug?: string; url?: string; publication?: { url?: string } };
        };
      };
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

---

## 3. GitHub Provider

**File**: `src/providers/github.ts`

### API

```graphql
mutation UpdateDiscussion($input: UpdateDiscussionInput!) {
  updateDiscussion(input: $input) {
    discussion {
      id
      url
    }
  }
}
```

Variables:
```json
{
  "input": {
    "discussionId": "<node_id>",
    "title": "Updated Title",
    "body": "Updated body..."
  }
}
```

The `UpdateDiscussionInput` only requires `discussionId`. The `categoryId` cannot be changed via update. The `repositoryId` is not needed (the discussion already belongs to a repo).

This makes the update method significantly simpler than `publish()` -- no repo/category resolution step.

### update() Method

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

---

## 4. Mock Provider

**File**: `src/providers/mock.ts`

### update() Method

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

---

## 5. Postiz Provider -- No update() Method

**File**: `src/providers/postiz.ts`

The Postiz API does not support editing tweets. `PostizProvider` does not implement `update()`. The update command will check for the method's existence and skip X with a warning.

---

## 6. Error Handling Summary

| Provider | Error Condition | Response Code | Behavior |
|----------|----------------|---------------|----------|
| Dev.to | Article not found | 404 | `ProviderError` thrown, caught, returns `{ status: 'failed' }` |
| Dev.to | Unauthorized | 401 | `ProviderError` thrown |
| Dev.to | Validation error | 422 | `ProviderError` thrown with body |
| Hashnode | Post not found | 200 (GraphQL error) | Error in `data.errors`, `ProviderError` thrown |
| Hashnode | Unauthorized | 401 | HTTP error, `ProviderError` thrown |
| GitHub | Discussion not found | 200 (GraphQL error) | Error in `data.errors`, `ProviderError` thrown |
| GitHub | Insufficient permissions | 200 (GraphQL error) | Error in `data.errors`, `ProviderError` thrown |
| All | Network timeout | N/A | `httpRequest` retries then throws, caught in update() |

---

## 7. Test Cases

### Dev.to Update Tests

```typescript
describe('DevtoProvider.update()', () => {
  it('sends PUT to /api/articles/{id}', async () => {
    // Mock httpRequest, verify URL is DEVTO_API_BASE/articles/42
    // Verify method is 'PUT'
    // Verify body matches _prepareArticlePayload output
  });

  it('returns articleId on success', async () => {
    // Mock response: { id: 42, url: 'https://dev.to/user/updated' }
    const result = await provider.update('42', '# Updated\nNew body', {});
    expect(result.status).toBe('success');
    expect(result.articleId).toBe('42');
    expect(result.url).toBe('https://dev.to/user/updated');
  });

  it('returns failed on 404', async () => {
    // Mock response: 404 Not Found
    const result = await provider.update('99999', '# Test\nBody', {});
    expect(result.status).toBe('failed');
    expect(result.error).toContain('404');
  });

  it('uses same payload structure as publish', async () => {
    // Capture body from publish() and update() with same content
    // Verify article object shape is identical
  });
});
```

### Hashnode Update Tests

```typescript
describe('HashnodeProvider.update()', () => {
  it('sends updatePost mutation with post id', async () => {
    // Mock httpRequest, verify query contains 'updatePost'
    // Verify variables.input.id === articleId
    // Verify variables.input does NOT contain publicationId
  });

  it('returns articleId on success', async () => {
    // Mock response with post.id
    const result = await provider.update('abc123', '# Updated\nBody', {});
    expect(result.articleId).toBe('abc123');
  });

  it('handles GraphQL errors', async () => {
    // Mock response with errors array
    const result = await provider.update('bad-id', '# Test\nBody', {});
    expect(result.status).toBe('failed');
  });
});
```

### GitHub Update Tests

```typescript
describe('GitHubProvider.update()', () => {
  it('sends updateDiscussion mutation', async () => {
    // Mock httpRequest, verify query contains 'updateDiscussion'
    // Verify variables.input.discussionId === articleId
    // Verify NO repo/category resolution query (single API call)
  });

  it('returns success with url and articleId', async () => {
    // Mock response
    const result = await provider.update('D_kwDO...', '# Updated\nBody', {});
    expect(result.status).toBe('success');
    expect(result.articleId).toBe('D_kwDO...');
  });

  it('handles permission errors', async () => {
    // Mock GraphQL error response
    const result = await provider.update('D_kwDO...', '# Test\nBody', {});
    expect(result.status).toBe('failed');
  });

  it('does not require repo resolution (single API call)', async () => {
    // Verify httpRequest called exactly once (not twice like publish)
  });
});
```

### Mock Update Tests

```typescript
describe('MockProvider.update()', () => {
  it('returns success with provided articleId', async () => {
    const provider = new MockProvider();
    const result = await provider.update('test-id', '# Test', {});
    expect(result.status).toBe('success');
    expect(result.articleId).toBe('test-id');
  });
});
```
