# ReachForge

Content publishing CLI built on the apcore ecosystem. All commands use `--key value` format (schema-driven, no positional arguments).

## Quick Reference

```
reach publish --article ./file.md --platforms devto          # Publish file to platform
reach publish --article ./file.md --platforms devto,hashnode  # Multi-platform
reach publish --article ./file.md --platforms devto --cover ./cover.png  # With cover image
reach go --prompt "write about X"                            # One-shot: prompt → published
reach status                                                 # Pipeline dashboard
reach platforms                                              # Show configured platforms
reach analytics                                              # Publishing stats (optional --from/--to)
reach asset add --file ./img.png                             # Register asset to library
reach asset list                                             # List registered assets
reach watch --interval 60                                    # Auto-publish daemon
reach init                                                   # Initialize workspace
reach new --name my-project                                  # Create project in workspace
reach workspace                                              # Show workspace info
reach mcp                                                    # Start MCP server for AI agents
```

## Pipeline Steps

```
reach draft --source "prompt or ./file.md"         # Generate AI draft
reach refine --article my-article --feedback "..."  # AI refine draft
reach adapt --article my-article --platforms devto   # draft → platform versions
reach schedule --article my-article --date 2026-04-01  # Set publish date
reach publish                                       # Publish all due articles
reach publish --article my-article                  # Publish specific article
reach update --article my-article                   # Update published article
reach rollback --article my-article                 # Move back one stage
reach refresh --article my-article                  # Copy back to drafts for re-editing
```

## Series (multi-article campaigns)

```
reach series init --topic "deep dive into X"          # Scaffold series.yaml
reach series outline --name my-series                  # AI-generate master outline
reach series approve --name my-series --outline        # Approve outline (gate 1)
reach series detail --name my-series                   # AI-generate per-article outlines
reach series approve --name my-series --detail         # Approve outlines (gate 2)
reach series draft --name my-series --all              # Draft articles based on approved outlines
reach series adapt --name my-series --platforms devto   # Batch adapt
reach series schedule --name my-series                 # Auto-calculate publish dates
reach series status --name my-series                   # Progress dashboard
```

Workflow: init → outline → approve → detail → approve → draft → adapt → schedule → publish

## Key Options

- `--platforms <list>` — comma-separated platforms with real API providers: devto, hashnode, ghost, wordpress, telegraph, writeas, reddit, x/linkedin (via Postiz), github; mock-only (no real provider): wechat, zhihu, medium
- `--provider <id>` — specify provider when multiple are configured for the same platform (e.g. `--provider postiz`)
- `--name <slug>` — explicit article name for `draft` and `go` (default: auto-generated)
- `--force` — publish even if scheduled for future / skip platforms without article_id
- `--clear` — unschedule an article (revert status to adapted)
- `--track` — opt-in pipeline tracking for external file publish
- `--cover <path>` — cover image path or URL (uploaded to platform CDN at publish time)
- `--dry-run` — preview without executing
- `--json` — JSON output envelope
- `--verbose` — show all options in help (including apcore built-in options)

Adapt is additive: `reach adapt --article X --platforms devto` after a previous adapt for x adds devto without removing x. `reach series adapt` is also additive when `--platforms` is specified — it re-runs adapt on already-adapted articles to add new platforms.

## Asset Management

```
reach asset add --file ./cover.png              # Register image to asset library
reach asset add --file ./video.mp4 --subdir videos  # Register with explicit subdir
reach asset list                                # List all assets
reach asset list --subdir images                # Filter by type
```

Assets are stored in `assets/{images,videos,audio}/` and referenced in articles via `@assets/filename`.

## Analytics & Automation

```
reach analytics                                 # Publishing stats (all time)
reach analytics --from 2026-01-01 --to 2026-03-31  # Date range
reach watch                                     # Start auto-publish daemon (default: 60 min)
reach watch --interval 30                       # Custom interval in minutes
reach watch --list                              # List running daemons
reach watch --stop my-project                   # Stop a daemon
```

## MCP Server

```
reach mcp                                       # Start MCP server (stdio, default)
reach mcp --transport sse --port 8000           # SSE transport for remote agents
```

## Project Structure

- `src/commands/` — CLI command implementations
- `src/core/` — pipeline engine, metadata, config, workspace, series-manager
- `src/providers/` — platform publish providers (devto, hashnode, github, ghost, wordpress, telegraph, writeas, reddit, postiz, mock)
- `src/validators/` — per-platform content validators
- `src/mcp/` — MCP server integration (tool schemas in `tools.ts`)
- `src/llm/` — LLM adapter layer (gemini, claude, codex)
- `src/types/` — Zod schemas, TypeScript types (pipeline, series, assets)
- `src/help.ts` — grouped help and --help --all output
- `tests/` — vitest tests (unit + integration)

## Pipeline Stages (filesystem directories)

```
01_drafts/ → 02_adapted/ → 03_published/
```

- `01_drafts/` — AI-generated drafts (`{article}.md`)
- `02_adapted/` — platform-specific versions (`{article}.{platform}.md`)
- `03_published/` — published archive

Metadata: `meta.yaml` at project root tracks article status, platforms, schedules, article IDs.

## Config Hierarchy (highest priority first)

1. Environment variables (DEVTO_API_KEY, HASHNODE_API_KEY, etc.)
2. Workspace `{ws}/.reach/config.yaml`
3. Global `~/.reach/config.yaml`

All config (API keys, LLM settings, MCP) lives in `config.yaml`. No `.env` or `credentials.yaml`.

## Testing

```
npm test                           # run full vitest suite
npx vitest run tests/unit/...      # run specific test file
```

All tests must pass before considering work complete.

## Architecture

Built on the apcore ecosystem:
- `apcore-js` — module registration (single source of truth for CLI + MCP)
- `apcore-mcp` — MCP server bridge (AI agent integration)
- `apcore-cli` — CLI generation via GroupedModuleGroup (schema → Commander.js commands)

All 27 commands registered once via `apcore.register()`, auto-wired to CLI and MCP.
