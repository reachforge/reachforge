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

- `--platforms <list>` — comma-separated platforms (devto, hashnode, ghost, wordpress, telegraph, writeas, reddit, x, github, wechat, zhihu)
- `--name <slug>` — explicit article name for `draft` and `go` (default: auto-generated)
- `--force` — publish even if scheduled for future / skip platforms without article_id
- `--clear` — unschedule an article (revert status to adapted)
- `--track` — opt-in pipeline tracking for external file publish
- `--cover <path>` — cover image path or URL (uploaded to platform CDN at publish time)
- `--dry-run` — preview without executing
- `--json` — JSON output envelope
- `--verbose` — show all options in help (including apcore built-in options)

Adapt is additive: `reach adapt --article X --platforms devto` after a previous adapt for x adds devto without removing x.

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
