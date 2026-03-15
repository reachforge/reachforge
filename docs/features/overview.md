# Feature Overview: aphype Component Architecture

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Document** | Feature Overview v1.0                      |
| **Date**     | 2026-03-14                                 |
| **Tech Design** | [aphype Tech Design](../aphype/tech-design.md) |

---

## Component Map

aphype is decomposed into 10 functional components across 8 source directories. This document describes how they relate to each other and the order in which they should be implemented.

## Components

| # | Component | Directory | Feature Spec | Priority | Status |
|---|-----------|-----------|-------------|----------|--------|
| 1 | Pipeline Core | `src/core/` | [pipeline-core.md](pipeline-core.md) | P0 | Implemented (refactor needed) |
| 2 | CLI Commands | `src/commands/` | [cli-commands.md](cli-commands.md) | P0 | Implemented (refactor needed) |
| 3 | LLM Provider | `src/llm/` | [llm-provider.md](llm-provider.md) | P0 | Partially implemented |
| 4 | Platform Providers | `src/providers/` | [platform-providers.md](platform-providers.md) | P0/P1 | Not started |
| 5 | Content Validation | `src/validators/` | [content-validation.md](content-validation.md) | P1 | Not started |
| 6 | Media Manager | `src/utils/media.ts` | [media-manager.md](media-manager.md) | P1 | Not started |
| 7 | Watcher Daemon | `src/commands/watch.ts` | [watcher-daemon.md](watcher-daemon.md) | P1 | Basic exists |
| 8 | MCP Server | `src/mcp/` | [mcp-server.md](mcp-server.md) | P2 | Basic exists |
| 9 | Plugin System | `src/providers/loader.ts` | [plugin-system.md](plugin-system.md) | P1 | Not started |
| 10 | Shared Types | `src/types/` | (Defined across all specs) | P0 | Not started |

## Dependency Graph

```
Shared Types (types/)
  └── Pipeline Core (core/)
        ├── CLI Commands (commands/)
        │     ├── Status
        │     ├── Draft ──────── LLM Provider (llm/)
        │     ├── Adapt ──────── LLM Provider (llm/)
        │     ├── Schedule
        │     ├── Publish ─────┬── Plugin System (providers/loader.ts)
        │     │                │     └── Platform Providers (providers/*.ts)
        │     │                ├── Content Validation (validators/)
        │     │                └── Media Manager (utils/media.ts)
        │     ├── Watch ──────── (reuses Publish flow)
        │     └── MCP ────────── MCP Server (mcp/)
        │                         └── (reuses all command handlers)
        └── Config (core/config.ts)
              └── (supplies credentials to LLM + Providers)
```

## Implementation Order

The recommended implementation order follows the migration plan in the tech design:

1. **Shared Types** (`types/`) — All interfaces, Zod schemas, error classes. No behavior, just contracts.
2. **Pipeline Core** (`core/`) — Extract from monolith. Pipeline engine, metadata manager, config.
3. **LLM Provider** (`llm/`) — Extract Gemini calls behind interface. Add factory.
4. **CLI Commands** (`commands/`) — Extract command handlers from index.ts.
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
| Credential management | `core/config.ts` | LLM providers, platform providers |
| Zod validation | `types/schemas.ts` | CLI commands, MCP tools |

---

*Each component has a dedicated feature spec linked above with implementation-level detail.*
