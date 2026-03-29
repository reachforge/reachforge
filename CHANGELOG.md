# Changelog

All notable changes to ReachForge are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Series Management** — gate-controlled multi-article campaigns: `series init`, `series outline`, `series approve`, `series detail`, `series draft`, `series adapt`, `series schedule`, `series status`
- **Update Command** — `reach update <article>` pushes content changes to already-published platforms (Dev.to PUT, Hashnode updatePost, GitHub updateDiscussion)
- **Article ID Capture** — publish now stores platform article IDs in meta.yaml for update support
- **5 New Providers** — Ghost (JWT auth), WordPress (Basic Auth), Telegraph (node JSON), Write.as (native Markdown), Reddit (OAuth password grant)
- **Cover Image Support** — `--cover <path|url>` on `draft`, `publish`, `go` commands; auto-upload to Hashnode CDN; frontmatter `cover_image:` extraction
- **apcore-cli Integration** — all 27 commands registered as apcore modules via `GroupedModuleGroup`; single registration drives both CLI and MCP
- **Publish Summary** — consolidated output after publish with URLs and errors
- **Slug Collision Warning** — `reach go` warns when renaming due to existing article
- **Dynamic Platform Detection** — `reach adapt` auto-detects configured platforms from API keys (removed hardcoded defaults)
- **Helpful Error Messages** — publish without `.md` extension suggests the correct command
- **Man Page Generation** — `reach --help --man` outputs roff man page; `bun run build` auto-generates `bin/reach.1`
- **Verbose Help** — `reach --help --verbose` shows all options including apcore built-in flags
- **Documentation Site** — MkDocs Material configuration for GitHub Pages deployment

### Changed
- **apcore Ecosystem Upgrade** — apcore-js 0.14.0, apcore-mcp 0.11.0, apcore-toolkit 0.4.0, apcore-cli 0.4.0
- **CLI Architecture** — replaced dual registration (apcore + Commander.js) with single apcore module registration; `GroupedModuleGroup` auto-generates CLI commands
- **Hashnode API** — migrated from deprecated `createPublicationStory`/`CreateStoryInput` to `publishPost`/`PublishPostInput`
- **Dev.to Validation** — relaxed to accept H1 heading without frontmatter (for external file publishing)
- **Title Deduplication** — Dev.to, Hashnode, Write.as strip frontmatter and H1 from body to prevent duplicate titles

### Removed
- **Hardcoded Default Platforms** — removed `['x', 'wechat', 'zhihu']` fallback; now requires explicit `--platforms` flag, project.yaml config, or configured API keys
- **Dev.to Image Upload Endpoint** — removed invalid `https://dev.to/api/images` (Dev.to has no public image upload API)

### Fixed
- **Hashnode 400 Error** — fixed GraphQL mutation and input types for current Hashnode API
- **Telegraph HTML Entities** — `htmlToTelegraphNodes` now decodes `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`

## [0.2.0] - 2026-03-25

### Added
- **Multi-Article Projects** — one project holds multiple articles with independent platforms and schedules
- **Pipeline Engine Refactor** — flat file naming `{article}.{platform}.md`, centralized `meta.yaml`
- **Filename Parser** — `parseArticleFilename` / `buildArticleFilename` for `{article}.{platform}.md` pattern
- **External File Publishing** — `reach publish ./file.md -p devto` without project context
- **Pipeline Tracking** — `--track` flag imports external files into the pipeline before publishing
- **Per-Article Status Detail** — `reach status <article>` shows single article info
- **Analytics Date Filtering** — `--from` and `--to` date range for `reach analytics`
- **YAML Configuration** — migrated from `.env` to `config.yaml` hierarchy
- **Platforms Command** — `reach platforms` shows configured publishing platforms
- **Refresh Command** — `reach refresh <article>` copies published article back to drafts
- **Pipeline Simplification** — reduced from 6 stages to 3 (`01_drafts → 02_adapted → 03_published`), removed `approve` command

### Changed
- **Testing Framework** — migrated from Jest to Vitest
- **Dependencies** — removed `dotenv` and `tsx`

## [0.1.1] - 2026-03-22

### Changed
- **Rebrand** — aipartnerup → aiperceivable organization rename

## [0.1.0] - 2026-03-21

### Added
- **Core Pipeline** — 6-stage content pipeline (`01_inbox → 06_sent`)
- **CLI Commands** — `status`, `draft`, `approve`, `adapt`, `schedule`, `publish`, `go`, `refine`, `rollback`
- **LLM Adapters** — Claude (default), Gemini, Codex CLI adapters with session management
- **Skill Resolver** — 3-layer cascade for draft/adapt prompt templates
- **Platform Providers** — Dev.to (REST), Hashnode (GraphQL), GitHub Discussions (GraphQL), X/Twitter via Postiz
- **Content Validation** — per-platform validators (X 280-char limit, Dev.to frontmatter, etc.)
- **Media Manager** — local image detection, CDN upload (Hashnode), URL replacement
- **Asset Library** — shared `assets/` directory with `@assets/` reference prefix
- **Watch Daemon** — `reach watch` auto-publishes due content on interval
- **MCP Server** — `reach mcp` exposes commands as MCP tools for AI agents
- **Workspace Management** — multi-project workspaces with config hierarchy
- **Analytics** — `reach analytics` for per-platform success rates
- **JSON Output** — `--json` flag on all commands for structured output
- **Bun Runtime** — single-file binary compilation via `bun build --compile`

[Unreleased]: https://github.com/reachforge/reachforge/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/reachforge/reachforge/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/reachforge/reachforge/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/reachforge/reachforge/releases/tag/v0.1.0
