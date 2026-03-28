# Implementation Plan: Update Published Articles

## Overview

Add `reach update <article>` command to push content changes to already-published platforms. 4 components, 7 tasks in dependency order.

## Tasks

### Task 1: Schema changes
**Files**: `src/providers/types.ts`, `src/types/schemas.ts`
**Tests**: `tests/unit/providers/providers.test.ts`

- Add `articleId?: string` to `PublishResult` interface
- Add `article_id: z.string().optional()` and `updated_at: z.string().optional()` to `PlatformPublishStatusSchema`
- Add optional `update?(articleId: string, content: string, meta: PublishMeta): Promise<PublishResult>` to `PlatformProvider` interface
- Test: schema parses with/without new fields (backward compat)

### Task 2: Capture article IDs during publish
**Files**: `src/providers/devto.ts`, `src/providers/hashnode.ts`, `src/providers/github.ts`, `src/providers/postiz.ts`, `src/providers/mock.ts`, `src/commands/publish.ts`
**Tests**: `tests/unit/providers/providers.test.ts`

- Dev.to: extract `data.id` as `articleId: String(data.id)` from publish response
- Hashnode: add `id` to GraphQL selection, return `articleId: post?.id`
- GitHub: extract `articleId: discussion?.id` (already in selection set)
- Postiz: extract `articleId: data.id` (preemptive)
- Mock: return generated ID as `articleId`
- Publish flow (`publishContentToPlatforms`): persist `result.articleId` as `article_id` in platformResults
- Test: each provider's publish returns articleId; meta.yaml stores article_id

### Task 3: Provider update methods — Dev.to
**Files**: `src/providers/devto.ts`
**Tests**: `tests/unit/providers/providers.test.ts`

- Extract shared payload logic into `private _prepareArticlePayload(content, meta)`
- Refactor `publish()` to use helper
- Add `update(articleId, content, meta)`: PUT to `/api/articles/{articleId}` with same payload
- Test: update sends PUT, returns success with articleId, handles 404

### Task 4: Provider update methods — Hashnode
**Files**: `src/providers/hashnode.ts`
**Tests**: `tests/unit/providers/providers.test.ts`

- Extract shared content prep into `private _prepareContent(content, meta)`
- Refactor `publish()` to use helper
- Add `update(articleId, content, meta)`: `updatePost` mutation with `id: articleId`
- Test: update sends updatePost, returns success, handles GraphQL errors

### Task 5: Provider update methods — GitHub + Mock
**Files**: `src/providers/github.ts`, `src/providers/mock.ts`
**Tests**: `tests/unit/providers/providers.test.ts`

- GitHub: add `update(articleId, content, meta)`: `updateDiscussion` mutation (single API call, no repo resolution)
- Mock: add `update()` returning success with provided articleId
- Test: GitHub update sends single mutation; Mock returns success

### Task 6: Update command
**Files**: `src/commands/update.ts` (new), `src/index.ts`, `src/mcp/tools.ts`, `src/help.ts`, `CLAUDE.md`
**Tests**: `tests/unit/commands/update.test.ts` (new)

- Create `updateCommand(engine, options)` with full flow: resolve meta → filter platforms → read content → validate → update each
- Content source: `02_adapted/` first, fallback to `03_published/`
- CLI registration: `reach update <article> [-p] [-n] [--force] [--cover]`
- MCP: `UpdateToolSchema` + tool metadata + apcore handler
- Help: add to Pipeline Steps group, update workflow line
- CLAUDE.md: add update to Quick Reference and Pipeline Steps
- Test: all 8 error cases, platform filter, dry run, JSON output, content source priority

### Task 7: Run full test suite
- Verify all tests pass
- Manual smoke test: publish → edit → update roundtrip

## Dependency Order

```
Task 1 (schema) → Task 2 (ID capture) → Tasks 3,4,5 (provider update methods, parallel) → Task 6 (command) → Task 7 (verify)
```

## Critical Files

| File | Changes |
|------|---------|
| `src/providers/types.ts` | `PublishResult.articleId`, `PlatformProvider.update?()` |
| `src/types/schemas.ts` | `article_id`, `updated_at` in PlatformPublishStatus |
| `src/providers/devto.ts` | ID capture + `_prepareArticlePayload` + `update()` |
| `src/providers/hashnode.ts` | ID capture + `_prepareContent` + `update()` |
| `src/providers/github.ts` | ID capture + `update()` |
| `src/providers/postiz.ts` | ID capture (preemptive) |
| `src/providers/mock.ts` | ID + `update()` |
| `src/commands/publish.ts` | Persist `article_id` in platformResults |
| `src/commands/update.ts` | New file — update command |
| `src/index.ts` | CLI + apcore registration |
| `src/mcp/tools.ts` | UpdateToolSchema + metadata |
| `src/help.ts` | Add update to groups |
| `CLAUDE.md` | Document update command |
