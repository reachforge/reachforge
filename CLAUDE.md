# ReachForge

Content publishing CLI. Manages articles through a pipeline: inbox, draft, approve, refine, adapt, schedule, publish.

## Quick Reference

```
reach go <prompt>                  # One-shot: prompt → published (requires LLM)
reach status                       # Pipeline dashboard
reach publish                      # Publish all due articles
reach publish <article>            # Publish specific article
reach publish ./file.md -p devto   # Publish external file to platform(s)
```

## Pipeline Steps (manual control)

```
reach draft <source>               # inbox → draft (AI generates)
reach approve <article>            # draft → master
reach refine <article> -f "..."    # AI refine draft/master
reach adapt <article>              # master → platform versions
reach schedule <article> [date]    # adapted → scheduled
reach publish                      # scheduled → sent
reach rollback <article>           # move back one stage
```

## Key Options

- `-p, --platforms <list>` — comma-separated platforms (devto, hashnode, x, wechat, zhihu, github)
- `--track` — opt-in pipeline tracking for external file publish (default: no tracking)
- `-n, --dry-run` — preview without executing
- `--json` — JSON output envelope: `{ jsonVersion, command, success, data, error? }`

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
01_inbox/ → 02_drafts/ → 03_master/ → 04_adapted/ → 05_scheduled/ → 06_sent/
```

Adapted files use `{article}.{platform}.md` naming (e.g., `my-post.devto.md`).

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
