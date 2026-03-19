# Implementation Plan: reachforge Refactor + Bug Fixes

| Field | Value |
|-------|-------|
| **Source** | [Tech Design](tech-design.md), [Code Review](#) |
| **Date** | 2026-03-15 |
| **Strategy** | Strangler fig: extract modules from monolith, fix bugs at each step |
| **Scope** | 7 Critical + 11 Major issues, full modular architecture |

---

## Task Overview

| Step | Task | Bug Fixes | Est. |
|------|------|-----------|------|
| 1 | Extract types, schemas, constants | Path traversal, Zod, type safety | 1 day |
| 2 | Extract core pipeline and config | Atomic moves, .env.example, logging, YAML validation | 2 days |
| 3 | Extract LLM abstraction | Parallel API calls, configurable model, testability | 1 day |
| 4 | Extract command handlers | Error handling (publish/watch/mcp), graceful shutdown, --dry-run | 1 day |
| 5 | Implement provider plugins | Mock warning, template alignment, real providers | 2 days |
| 6 | Add validators + MCP enhancement | MCP auth, content validation | 1 day |
| 7 | Remove dead code + verify | Delete Python, pin deps, tsconfig, full test pass | 0.5 day |

**Total estimated: ~8.5 days**

---

## Bug Fix Traceability

### Critical Issues (7)

| # | Issue | Fixed In | How |
|---|-------|----------|-----|
| C1 | Path traversal | Step 1 | `sanitizePath()` in `utils/path.ts` |
| C2 | Publish no try/catch | Step 4 | `commands/publish.ts` wraps in try/catch |
| C3 | Watch no shutdown | Step 4 | `commands/watch.ts` adds SIGINT/SIGTERM handler |
| C4 | MCP no try/catch | Step 4 | `commands/mcp.ts` wraps in try/catch |
| C5 | fs.move non-atomic | Step 2 | `core/pipeline.ts` uses copy+verify+remove |
| C6 | Zero tests | Steps 1-6 | TDD: tests written alongside each module |
| C7 | file: local deps | Step 7 | Resolve apcore-js/apcore-mcp references |

### Major Issues (11)

| # | Issue | Fixed In | How |
|---|-------|----------|-----|
| M1 | Parallel Gemini calls | Step 3 | `Promise.all()` in adapt |
| M2 | Zod unused | Step 1 | Schemas in `types/schemas.ts`, validated on read/write |
| M3 | Template meta mismatch | Step 5 | Providers write per-platform status |
| M4 | Dead Python code | Step 7 | Delete `scripts/adapt.py`, `pyproject.toml` |
| M5 | `as any` everywhere | Step 1 | Proper TypeScript interfaces |
| M6 | No .env.example | Step 2 | Create `.env.example` |
| M7 | Hardcoded gemini-pro | Step 3 | Config via `REACHFORGE_LLM_MODEL` |
| M8 | No --dry-run | Step 4 | Add to schedule, publish commands |
| M9 | Mock publish silent | Step 5 | MockProvider warns "MOCK MODE" |
| M10 | readdir order | Step 2 | Sort by name, prefer `main.md` > `index.md` > first .md |
| M11 | No structured logging | Step 2 | `utils/logger.ts` |

---

## Target Directory Structure

```
src/
  types/
    pipeline.ts          — Interfaces: PipelineStage, ProjectMeta, StageTransition
    schemas.ts           — Zod schemas: MetaSchema, ReceiptSchema, CredentialsSchema
    errors.ts            — Error classes: ProjectNotFoundError, PathTraversalError, etc.
    index.ts             — Re-export barrel
  core/
    constants.ts         — STAGES, regex, defaults
    pipeline.ts          — PipelineEngine class
    metadata.ts          — MetadataManager class
    config.ts            — ConfigManager class
  llm/
    types.ts             — LLMProvider interface
    gemini.ts            — GeminiProvider class
    factory.ts           — LLMFactory
    index.ts             — Re-export barrel
  commands/
    status.ts            — StatusCommand
    draft.ts             — DraftCommand
    adapt.ts             — AdaptCommand
    schedule.ts          — ScheduleCommand
    publish.ts           — PublishCommand
    rollback.ts          — RollbackCommand
    watch.ts             — WatchCommand
    mcp.ts               — MCPCommand
  providers/
    types.ts             — PlatformProvider interface
    loader.ts            — ProviderLoader class
    mock.ts              — MockProvider
    devto.ts             — DevtoProvider
    postiz.ts            — PostizProvider
  validators/
    x.ts                 — X/Twitter validator
    devto.ts             — Dev.to validator
    runner.ts            — Aggregate validator runner
  mcp/
    tools.ts             — MCP tool definitions with Zod schemas
    server.ts            — MCP server wrapper
  utils/
    path.ts              — sanitizePath()
    logger.ts            — Structured logger
    http.ts              — Retry-enabled HTTP client
  index.ts               — Slim entry: Commander setup + imports
tests/
  unit/
    core/                — Pipeline, metadata, config tests
    llm/                 — LLM provider tests
    providers/           — Provider tests
    validators/          — Validator tests
    utils/               — Path sanitization, logger tests
  integration/
    commands/            — CLI command tests
    pipeline/            — Full pipeline flow tests
```

---

## Execution Command

```bash
# Start implementing with code-forge
/code-forge:impl
```

*Each step produces a working CLI. No step should break existing functionality.*
