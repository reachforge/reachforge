# Feature Overview: reachforge Component Architecture

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Document** | Feature Overview v1.1                      |
| **Date**     | 2026-03-17                                 |
| **Tech Design** | [reachforge Tech Design](../reachforge/tech-design.md), [LLM Adapter Tech Design](../llm-adapter/tech-design.md) |

---

## Component Map

reachforge is decomposed into 14 functional components across 9 source directories. This document describes how they relate to each other and the order in which they should be implemented.

## Components

| # | Component | Directory | Feature Spec | Priority | Status |
|---|-----------|-----------|-------------|----------|--------|
| 1 | Pipeline Core | `src/core/` | [pipeline-core.md](pipeline-core.md) | P0 | Implemented |
| 2 | CLI Commands | `src/commands/` | [cli-commands.md](cli-commands.md) | P0 | Implemented (27 modules via apcore) |
| 3 | LLM Provider | `src/llm/` | [llm-provider.md](llm-provider.md) | P0 | **SUPERSEDED** by Adapter Layer |
| 3a | CLI Adapter Core | `src/llm/adapters/`, `src/llm/parsers/` | [cli-adapter-core.md](cli-adapter-core.md) | P0 | Implemented |
| 3b | Session Manager | `src/llm/session.ts` | [session-manager.md](session-manager.md) | P0 | Implemented |
| 3c | Skill Resolver | `src/llm/skills.ts` | [skill-resolver.md](skill-resolver.md) | P0 | Implemented |
| 3d | Refine Command | `src/commands/refine.ts` | [refine-command.md](refine-command.md) | P0 | Implemented |
| 4 | Platform Providers | `src/providers/` | [platform-providers.md](platform-providers.md) | P0/P1 | Implemented (DevTo, Postiz, Hashnode, GitHub, Ghost, WordPress, Telegraph, Write.as, Reddit, Mock) |
| 5 | Content Validation | `src/validators/` | [content-validation.md](content-validation.md) | P1 | Implemented (X, DevTo, Hashnode, GitHub, Ghost, WordPress, Telegraph, Write.as, Reddit) |
| 6 | Media Manager | `src/utils/media.ts` | [media-manager.md](media-manager.md) | P1 | Implemented (detect, upload, cache, CDN replace) |
| 6a | Asset Library | `src/core/asset-manager.ts` | — | P1 | Implemented (@assets/ registry + reference resolution) |
| 7 | Watcher Daemon | `src/commands/watch.ts` | [watcher-daemon.md](watcher-daemon.md) | P1 | Implemented |
| 8 | MCP Server | `src/mcp/` | [mcp-server.md](mcp-server.md) | P2 | Implemented (27 tools, stdio + SSE) |
| 9 | Plugin System | `src/providers/loader.ts` | [plugin-system.md](plugin-system.md) | P1 | Implemented |
| 10 | Shared Types | `src/types/` | (Defined across all specs) | P0 | Implemented |
| 11 | Workspace Management | `src/core/workspace.ts` | — | P0 | Implemented (multi-project workspaces) |
| 12 | Template System | `src/core/templates.ts` | — | P2 | Implemented (2-layer resolution + variable interpolation) |
| 13 | Analytics Dashboard | `src/commands/analytics.ts` | — | P2 | Implemented (per-platform success rates + date filtering) |

## Dependency Graph

```
Shared Types (types/)
  └── Pipeline Core (core/)
        ├── CLI Commands (commands/)
        │     ├── Status
        │     ├── Draft ──────── CLI Adapter Core (llm/adapters/)
        │     │                    ├── Skill Resolver (llm/skills.ts)
        │     │                    └── Session Manager (llm/session.ts)
        │     ├── Adapt ──────── CLI Adapter Core (llm/adapters/)
        │     │                    ├── Skill Resolver (llm/skills.ts)
        │     │                    └── Session Manager (llm/session.ts)
        │     ├── Refine ─────── CLI Adapter Core + Session Manager (multi-turn)
        │     ├── Schedule
        │     ├── Publish ─────┬── Plugin System (providers/loader.ts)
        │     │                │     └── Platform Providers (providers/*.ts)
        │     │                ├── Content Validation (validators/)
        │     │                └── Media Manager (utils/media.ts)
        │     ├── Watch ──────── (reuses Publish flow)
        │     └── MCP ────────── MCP Server (mcp/)
        │                         └── (reuses all command handlers)
        └── Config (core/config.ts)
              └── (supplies adapter selection + credentials to all components)
```

## Implementation Order

The recommended implementation order follows the migration plan in the tech design:

1. **Shared Types** (`types/`) — All interfaces, Zod schemas, error classes. No behavior, just contracts.
2. **Pipeline Core** (`core/`) — Extract from monolith. Pipeline engine, metadata manager, config.
3. **CLI Adapter Core** (`llm/`) — Replace GeminiProvider with CLI adapters (Claude, Gemini, Codex). Includes ProcessRunner, parsers, and AdapterFactory. See [LLM Adapter Tech Design](../llm-adapter/tech-design.md).
   - 3a. **Session Manager** (`llm/session.ts`) — Per-stage session file CRUD.
   - 3b. **Skill Resolver** (`llm/skills.ts`) — Three-layer skill cascade resolution.
   - 3c. **Refine Command** (`commands/refine.ts`) — Interactive multi-turn refinement.
4. **CLI Commands** (`commands/`) — Update draft/adapt to use new adapter layer.
5. **Plugin System** (`providers/loader.ts`) — Provider discovery and loading mechanism.
6. **Platform Providers** (`providers/*.ts`) — Dev.to and Postiz first, then Hashnode and GitHub.
7. **Content Validation** (`validators/`) — Platform-specific pre-publish checks.
8. **Media Manager** (`utils/media.ts`) — Image detection, upload, URL replacement.
9. **Watcher Daemon** — Harden existing implementation with logging and signal handling.
10. **MCP Server** (`mcp/`) — Enhance with Zod-validated tool definitions.

## Cross-Cutting Concerns

| Concern | Owner Component | Consumed By |
|---------|----------------|-------------|
| Error handling | `types/errors.ts` | All components |
| HTTP retry logic | `utils/http.ts` | All providers, media manager |
| Structured logging | `utils/logger.ts` | Watcher, CLI commands |
| YAML operations | `core/metadata.ts` | Pipeline core, commands, providers |
| Credential management | `core/config.ts` | CLI adapters, platform providers |
| Zod validation | `types/schemas.ts` | CLI commands, MCP tools, session manager |
| Child process spawning | `llm/process.ts` | All CLI adapters |
| Skill cascade resolution | `llm/skills.ts` | Draft, adapt, refine commands |
| Session persistence | `llm/session.ts` | Draft, adapt, refine commands |

---

## Multi-Article Refactor Features

> Added: 2026-03-24. See [Multi-Article Tech Design](../multi-article/tech-design.md) for architecture context.

These features refactor the pipeline from single-article-per-project to multi-article-per-project.

| # | Feature | Description | Dependencies | Priority | Status |
|---|---------|-------------|--------------|----------|--------|
| 1 | [filename-parser](filename-parser.md) | Parse/build `{article}.{platform}.md` filenames | — | P0 | ✅ implemented |
| 2 | [multi-article-metadata](multi-article-metadata.md) | Centralized multi-article meta.yaml schema | filename-parser | P0 | ✅ implemented |
| 3 | [pipeline-engine-refactor](pipeline-engine-refactor.md) | File-level pipeline operations | filename-parser, multi-article-metadata | P0 | ✅ implemented |
| 4 | [command-updates](command-updates.md) | Update all CLI commands for article param | pipeline-engine-refactor, multi-article-metadata | P0 | ✅ implemented |
| 5 | [mcp-tool-updates](mcp-tool-updates.md) | Update MCP tool schemas | command-updates | P1 | ✅ implemented |

### Execution Order

1. **filename-parser** — no dependencies, pure utility
2. **multi-article-metadata** — depends on filename-parser for constants
3. **pipeline-engine-refactor** — depends on both above
4. **command-updates** — depends on pipeline engine + metadata
5. **mcp-tool-updates** — depends on commands being updated

---

## Update Published Articles Feature

> Added: 2026-03-27. See [Update Command Tech Design](../update-command/tech-design.md) for architecture context.

New `reach update <article>` command to push content changes to already-published platforms via their update APIs.

| # | Feature | Description | Dependencies | Priority | Status |
|---|---------|-------------|--------------|----------|--------|
| 1 | [update-schema-changes](update-schema-changes.md) | Add `article_id` and `updated_at` to PlatformPublishStatus, `articleId` to PublishResult, `update()` to PlatformProvider | — | P0 | ✅ implemented |
| 2 | [update-publish-id-capture](update-publish-id-capture.md) | Capture platform article IDs in provider publish() responses and persist to meta.yaml | update-schema-changes | P0 | ✅ implemented |
| 3 | [update-provider-methods](update-provider-methods.md) | Implement update() on DevTo, Hashnode, GitHub, and Mock providers | update-schema-changes, update-publish-id-capture | P0 | ✅ implemented |
| 4 | [update-command](update-command.md) | The `reach update` command, CLI registration, MCP tool, help text | update-provider-methods | P0 | ✅ implemented |

### Execution Order

1. **update-schema-changes** -- no dependencies, additive schema changes only
2. **update-publish-id-capture** -- depends on schema changes, modifies providers and publish flow
3. **update-provider-methods** -- depends on schema + ID capture, adds update() to each provider
4. **update-command** -- depends on all above, implements the command and MCP integration

---

## New Publishing Providers

> Added: 2026-03-27. See [New Providers Tech Design](../new-providers/tech-design.md) for architecture context.

5 new platform providers expanding ReachForge's publishing reach. All follow the existing `PlatformProvider` interface pattern.

| # | Feature | Platform ID | Content Format | Auth Method | Priority | Status |
|---|---------|-------------|---------------|-------------|----------|--------|
| 1 | [provider-ghost](provider-ghost.md) | `ghost` | HTML | JWT (HS256 from admin key) | P1 | ✅ implemented |
| 2 | [provider-wordpress](provider-wordpress.md) | `wordpress` | HTML | Basic Auth (App Password) | P1 | ✅ implemented |
| 3 | [provider-telegraph](provider-telegraph.md) | `telegraph` | HTML (node JSON) | Access token | P2 | ✅ implemented |
| 4 | [provider-writeas](provider-writeas.md) | `writeas` | Markdown | Access token | P2 | ✅ implemented |
| 5 | [provider-reddit](provider-reddit.md) | `reddit` | Markdown | OAuth2 password grant | P1 | ✅ implemented |

### Execution Order

1. **Config + IDs** -- `ReachforgeConfig` fields, `PLATFORM_IDS`, display names (modify-only)
2. **Validators** -- 5 new validator files + runner registration
3. **Providers** (in order of complexity):
   - Write.as (simplest -- Markdown, token auth)
   - WordPress (HTML, Basic Auth)
   - Ghost (HTML, JWT signing)
   - Telegraph (HTML-to-nodes conversion)
   - Reddit (OAuth token flow)
4. **Loader** -- Register all providers
5. **Exports/MCP/Help** -- Update index, MCP tools, help text

### Shared Changes

| File | Change |
|------|--------|
| `src/types/pipeline.ts` | Add 13 config fields to `ReachforgeConfig` |
| `src/core/filename-parser.ts` | Add `ghost`, `wordpress`, `telegraph`, `writeas` to `PLATFORM_IDS` |
| `src/providers/loader.ts` | Import + register 5 providers, add display names/languages |
| `src/validators/runner.ts` | Register 5 new validators |

---

---

## Series Management

> Added: 2026-03-28. See [Series Management Feature Spec](series-management.md) for full specification.

Gate-controlled multi-article campaign workflow: init → outline → approve → detail → approve → draft → adapt → schedule.

| # | Command | Description | Status |
|---|---------|-------------|--------|
| 1 | `series init <topic>` | Scaffold series.yaml template | ✅ implemented |
| 2 | `series outline <name>` | AI-generate master outline + article plan | ✅ implemented |
| 3 | `series approve <name> --outline` | Gate 1: approve master outline | ✅ implemented |
| 4 | `series detail <name>` | AI-generate per-article detailed outlines | ✅ implemented |
| 5 | `series approve <name> --detail` | Gate 2: approve detail outlines | ✅ implemented |
| 6 | `series draft <name> [--all]` | Draft articles based on approved outlines | ✅ implemented |
| 7 | `series adapt <name> [-p]` | Batch adapt for platforms | ✅ implemented |
| 8 | `series schedule <name>` | Auto-calculate publish dates | ✅ implemented |
| 9 | `series status <name>` | Progress dashboard | ✅ implemented |

### Key Files

| File | Content |
|------|---------|
| `src/types/series.ts` | Zod schemas, status enum, Series types |
| `src/core/series-manager.ts` | CRUD, state transitions, schedule calc, context assembly |
| `src/commands/series.ts` | 8 command functions |

---

*Each component has a dedicated feature spec linked above with implementation-level detail.*
