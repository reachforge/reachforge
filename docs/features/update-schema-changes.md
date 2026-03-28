# Feature Spec: Update Schema Changes

| Field          | Value                                          |
|----------------|------------------------------------------------|
| **Document**   | Feature Spec v1.0                              |
| **Date**       | 2026-03-27                                     |
| **Tech Design** | [Update Command Tech Design](../update-command/tech-design.md) |
| **Priority**   | P0 (prerequisite for all update features)      |
| **Status**     | Draft                                          |

---

## Summary

Add `article_id` and `updated_at` fields to `PlatformPublishStatus`, add `articleId` to `PublishResult`, and add an optional `update()` method to the `PlatformProvider` interface. These are the foundational schema changes that enable the entire update feature.

---

## 1. PlatformPublishStatusSchema

**File**: `src/types/schemas.ts` (lines 21-26)

### Current

```typescript
export const PlatformPublishStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
  published_at: z.string().optional(),
});
```

### Target

```typescript
export const PlatformPublishStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']),
  url: z.string().url().optional(),
  error: z.string().optional(),
  published_at: z.string().optional(),
  article_id: z.string().optional(),
  updated_at: z.string().optional(),
});
```

### Fields Added

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `article_id` | `z.string().optional()` | No | Platform-assigned unique identifier. Numeric string for Dev.to, ObjectId hex string for Hashnode, GraphQL node ID for GitHub. |
| `updated_at` | `z.string().optional()` | No | ISO 8601 timestamp of the last successful `update` call for this platform. |

### Backward Compatibility

Both fields are optional with no default. Existing meta.yaml files will parse without error. The inferred TypeScript type `PlatformPublishStatus` gains two optional properties:

```typescript
type PlatformPublishStatus = {
  status: 'pending' | 'success' | 'failed';
  url?: string;
  error?: string;
  published_at?: string;
  article_id?: string;   // NEW
  updated_at?: string;   // NEW
};
```

No existing code reads `article_id` or `updated_at`, so no call sites break.

---

## 2. PublishResult Interface

**File**: `src/providers/types.ts` (lines 24-29)

### Current

```typescript
export interface PublishResult {
  platform: string;
  status: 'success' | 'failed';
  url?: string;
  error?: string;
}
```

### Target

```typescript
export interface PublishResult {
  platform: string;
  status: 'success' | 'failed';
  url?: string;
  error?: string;
  articleId?: string;
}
```

### Field Added

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `articleId` | `string \| undefined` | No | Platform-assigned article identifier, returned by providers on successful publish or update. Camel case to match TypeScript conventions (mapped to `article_id` in meta.yaml). |

### Impact on Consumers

The only consumer of `PublishResult` is `publishContentToPlatforms()` in `src/commands/publish.ts`. It reads `result.status`, `result.url`, and `result.error`. Adding an optional `articleId` field is non-breaking. The publish flow must be updated (separate feature spec) to propagate `articleId` to meta.yaml.

---

## 3. PlatformProvider Interface

**File**: `src/providers/types.ts` (lines 3-14)

### Current

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
}
```

### Target

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
  update?(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>;
}
```

### Method Added

```typescript
update?(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `articleId` | `string` | The platform-assigned article ID from a previous publish. |
| `content` | `string` | The updated article content (same format as `publish()`). |
| `meta` | `PublishMeta` | Title, tags, canonical URL, draft flag, cover image (same as `publish()`). |
| **Returns** | `Promise<PublishResult>` | Same shape as `publish()` return. `articleId` should be populated on success. |

### Why Optional (`update?`)

The method is optional (`?`) because:
1. `MockProvider` may or may not implement it (for testing it should, but it is not required by the interface).
2. `PostizProvider` (X/Twitter) cannot update tweets. Omitting `update()` signals "not supported" at the type level.
3. Existing providers compile without changes until their `update()` is implemented.

### Checking for Update Support

Callers check at runtime:

```typescript
if (typeof provider.update !== 'function') {
  // Platform does not support updates
}
```

---

## 4. No Changes Required

The following types are **not** changed:

- `PublishMeta` -- reused as-is for update calls. Title, tags, canonical, draft, and coverImage all apply.
- `ValidationResult` -- validation logic is identical for publish and update.
- `ArticleMetaSchema` -- already has `platforms: z.record(z.string(), PlatformPublishStatusSchema).optional()` which automatically picks up the new fields.
- `MultiArticleProjectMetaSchema` -- wraps `ArticleMetaSchema`, inherits changes.

---

## 5. Test Cases

### Schema Parsing Tests

```typescript
// test: PlatformPublishStatusSchema parses without article_id (backward compat)
const result = PlatformPublishStatusSchema.parse({
  status: 'success',
  url: 'https://dev.to/user/post',
  published_at: '2026-03-27T10:00:00Z',
});
expect(result.article_id).toBeUndefined();
expect(result.updated_at).toBeUndefined();

// test: PlatformPublishStatusSchema parses with article_id
const result = PlatformPublishStatusSchema.parse({
  status: 'success',
  url: 'https://dev.to/user/post',
  published_at: '2026-03-27T10:00:00Z',
  article_id: '1842567',
  updated_at: '2026-03-27T12:00:00Z',
});
expect(result.article_id).toBe('1842567');
expect(result.updated_at).toBe('2026-03-27T12:00:00Z');

// test: PlatformPublishStatusSchema rejects unknown status values
expect(() => PlatformPublishStatusSchema.parse({ status: 'updated' })).toThrow();

// test: ArticleMetaSchema parses meta.yaml with article_id in platforms
const meta = ArticleMetaSchema.parse({
  status: 'published',
  platforms: {
    devto: { status: 'success', url: 'https://dev.to/x', article_id: '123' },
  },
});
expect(meta.platforms!.devto.article_id).toBe('123');
```

### Interface Compliance Tests

```typescript
// test: Provider without update() satisfies PlatformProvider
const provider: PlatformProvider = new PostizProvider('key');
expect(provider.update).toBeUndefined();

// test: Provider with update() satisfies PlatformProvider
const provider: PlatformProvider = new DevtoProvider('key');
expect(typeof provider.update).toBe('function');
```

---

## 6. Migration

No migration script is needed. The schema is additive (optional fields only). Existing meta.yaml files are forward-compatible. Articles published before this change will have `article_id: undefined` in their platform status, which the update command handles as "cannot update this platform."

To retroactively capture IDs for already-published articles, users can:
1. Manually add `article_id` to meta.yaml from their platform dashboard.
2. Or delete the article from the platform and republish (which will capture the ID).
