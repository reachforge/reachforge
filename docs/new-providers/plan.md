# Implementation Plan: 5 New Providers

## Overview

Add Ghost, WordPress, Telegraph, Write.as, Reddit providers. 8 tasks in dependency order.

## Tasks

### Task 1: Shared infrastructure (config, platform IDs, loader wiring)
**Files**: `src/types/pipeline.ts`, `src/core/filename-parser.ts`, `src/core/project-config.ts`, `src/providers/loader.ts`

- Add 13 config fields to `ReachforgeConfig`
- Add config keys to `WorkspaceConfigSchema`
- Add `ghost`, `wordpress`, `telegraph`, `writeas` to `PLATFORM_IDS` (reddit already exists)
- Wire all 5 providers in `ProviderLoader.loadProviders()`
- Add display names in `PLATFORM_DISPLAY_NAMES`
- Add default languages in `PLATFORM_DEFAULT_LANGUAGES` where needed

### Task 2: Ghost provider
**Files**: `src/providers/ghost.ts` (new), `src/validators/ghost.ts` (new), `src/validators/runner.ts`

- Implement GhostProvider with JWT auth (HS256, no external lib)
- `publish()`: POST with `Ghost {jwt}` auth header
- `update()`: GET current post for `updated_at`, then PUT
- `formatContent()`: returns `markdownToHtml(content)`
- Validator: title required
- Register in validator runner

### Task 3: WordPress provider
**Files**: `src/providers/wordpress.ts` (new), `src/validators/wordpress.ts` (new), `src/validators/runner.ts`

- Implement WordPressProvider with Basic Auth
- `publish()`: POST to `/wp-json/wp/v2/posts`
- `update()`: PUT to same endpoint with ID
- `formatContent()`: returns `markdownToHtml(content)`
- Validator: title required
- Tags skipped in v1

### Task 4: Telegraph provider
**Files**: `src/providers/telegraph.ts` (new), `src/validators/telegraph.ts` (new), `src/validators/runner.ts`

- Implement TelegraphProvider
- `htmlToTelegraphNodes()`: regex-based HTML→node converter
- `publish()`: POST to `createPage`
- `update()`: POST to `editPage/{path}`
- articleId = path (not numeric ID)
- Validator: title required, ≤256 chars

### Task 5: Write.as provider
**Files**: `src/providers/writeas.ts` (new), `src/validators/writeas.ts` (new), `src/validators/runner.ts`

- Implement WriteasProvider (simplest — native Markdown)
- `publish()`: POST to `/api/posts` with Token auth
- `update()`: POST (not PUT) to `/api/posts/{id}`
- `formatContent()`: strip frontmatter only
- Validator: body not empty after frontmatter strip

### Task 6: Reddit provider
**Files**: `src/providers/reddit.ts` (new), `src/validators/reddit.ts` (new), `src/validators/runner.ts`

- Implement RedditProvider with OAuth password grant
- `getAccessToken()`: cache token in memory, refresh with 60s buffer
- `publish()`: form-encoded POST to `/api/submit`
- `update()`: form-encoded POST to `/api/editusertext` with `t3_` prefix
- `formatContent()`: strip frontmatter + H1
- Validator: title ≤300 chars, body not empty

### Task 7: CLI + MCP + docs
**Files**: `src/help.ts`, `CLAUDE.md`, `src/mcp/tools.ts` (TOOL_METADATA descriptions)

- Add `ghost`, `wordpress`, `telegraph`, `writeas` to platform list in help text
- Update CLAUDE.md platforms list
- Update TOOL_METADATA descriptions mentioning available platforms
- Update `getCredentialsForPlatform()` in publish.ts for new platforms

### Task 8: Run full test suite
- Verify all tests pass
- Check `reach platforms` shows new providers

## Dependency Order

```
Task 1 (infra) → Tasks 2,3,4,5,6 (providers, parallel) → Task 7 (CLI/docs) → Task 8 (verify)
```

## Critical Files

| File | Changes |
|------|---------|
| `src/types/pipeline.ts` | 13 new config fields |
| `src/core/filename-parser.ts` | 4 new platform IDs |
| `src/core/project-config.ts` | New config keys in WorkspaceConfigSchema |
| `src/providers/loader.ts` | Wire 5 new providers |
| `src/providers/ghost.ts` | New — JWT auth, Admin API |
| `src/providers/wordpress.ts` | New — Basic Auth, WP REST API |
| `src/providers/telegraph.ts` | New — token auth, node format |
| `src/providers/writeas.ts` | New — token auth, native Markdown |
| `src/providers/reddit.ts` | New — OAuth password grant |
| `src/validators/ghost.ts` | New |
| `src/validators/wordpress.ts` | New |
| `src/validators/telegraph.ts` | New |
| `src/validators/writeas.ts` | New |
| `src/validators/reddit.ts` | New |
| `src/validators/runner.ts` | Register 5 new validators |
| `src/commands/publish.ts` | getCredentialsForPlatform for new platforms |
