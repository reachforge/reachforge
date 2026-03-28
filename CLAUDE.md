# ReachForge

Content publishing CLI. Manages articles through a 3-step pipeline: draft, adapt, publish.

## Quick Reference

```
reach go <prompt>                  # One-shot: prompt → published (requires LLM)
reach status                       # Pipeline dashboard
reach publish                      # Publish all due articles
reach publish <article>            # Publish specific article
reach publish ./file.md -p devto   # Publish external file to platform(s)
reach update <article>             # Update already-published article on platforms
```

## Pipeline Steps (manual control)

```
reach draft <input>                # Generate AI draft (input: prompt, file, or directory)
reach refine <article> -f "..."    # AI refine draft
reach adapt <article>              # draft → platform versions
reach schedule <article> [date]    # Set publish date (metadata only, no file move)
reach publish                      # Publish due articles
reach update <article>             # Update published article on platforms
reach rollback <article>           # Move back one stage
```

## Series (multi-article campaigns)

```
reach series init <topic>                # Scaffold series.yaml
reach series outline <name>              # AI-generate master outline
reach series approve <name> --outline    # Approve outline (gate 1)
reach series detail <name>               # AI-generate per-article outlines
reach series approve <name> --detail     # Approve outlines (gate 2)
reach series draft <name> [--all]        # Draft articles based on approved outlines
reach series adapt <name> [-p platforms] # Batch adapt
reach series schedule <name>             # Auto-calculate publish dates
reach series status <name>               # Progress dashboard
```

Workflow: init → outline → approve → detail → approve → draft → adapt → schedule → publish

## Key Options

- `-p, --platforms <list>` — comma-separated platforms (devto, hashnode, ghost, wordpress, telegraph, writeas, reddit, x, github, wechat, zhihu)
- `--name <slug>` — explicit article name for `draft` and `go` commands (default: auto-generated)
- `--force` — publish even if article is scheduled for a future date
- `--clear` — unschedule an article (revert status to adapted, remove schedule date)
- `--track` — opt-in pipeline tracking for external file publish (imports to 02_adapted, then publishes)
- `-c, --cover <path>` — cover image path or URL for `draft`, `publish`, and `go` commands (uploaded to platform CDN at publish time)
- `-n, --dry-run` — preview without executing
- `--json` — JSON output envelope: `{ jsonVersion, command, success, data, error? }`

Adapt is additive: running `reach adapt article -p devto` after a previous `reach adapt article -p x` adds devto without removing x.

## Project Structure

- `src/commands/` — CLI command implementations
- `src/core/` — pipeline engine, metadata, config, workspace
- `src/providers/` — platform publish providers (devto, hashnode, github, postiz, mock)
- `src/validators/` — per-platform content validators
- `src/mcp/` — MCP server integration (tool schemas in `tools.ts`)
- `src/llm/` — LLM adapter layer (gemini, claude, codex)
- `src/help.ts` — grouped help and --help --all output
- `tests/` — vitest tests (unit + integration)

## Pipeline Stages (filesystem directories)

```
01_drafts/ → 02_adapted/ → 03_published/
```

- `01_drafts/` — AI-generated drafts (`{article}.md`)
- `02_adapted/` — platform-specific versions (`{article}.{platform}.md`)
- `03_published/` — published archive

Scheduled articles stay in `02_adapted/` with `status: scheduled` in metadata.

Metadata: `meta.yaml` at project root tracks article status, platforms, schedules.

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

## MCP Integration

`reach mcp` exposes all commands as MCP tools with JSON Schema inputs.
Tool metadata defined in `src/mcp/tools.ts` (`TOOL_METADATA`).
