# reachforge User Manual

**ReachForge -- The Social Influence Engine for AI-Native Content**

Version 0.3.0

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [The Content Pipeline](#the-content-pipeline)
5. [Commands Reference](#commands-reference)
6. [Configuration](#configuration)
7. [LLM Integration](#llm-integration)
8. [Platform Providers](#platform-providers)
9. [Skill System](#skill-system)
10. [Template System](#template-system)
11. [MCP Server](#mcp-server)
12. [Troubleshooting](#troubleshooting)

---

## Overview

reachforge is a CLI tool that transforms raw ideas into polished, platform-specific content through a three-stage file-based pipeline. It uses AI (Claude, Gemini, or Codex) to draft, refine, and adapt articles for multiple publishing platforms -- Dev.to, Hashnode, GitHub Discussions, and X (via Postiz).

**Key design principles:**

- **File-as-state** -- no database; flat `.md` files flow through pipeline stages, a single `meta.yaml` tracks all article states.
- **Multi-article projects** -- one project holds multiple articles, each independently targeting different platforms and schedules.
- **Multi-project workspaces** -- manage many content projects from a single workspace.
- **Pluggable LLM adapters** -- switch between Claude, Gemini, and Codex per stage.
- **Progressive publishing** -- resumable, lock-protected, with per-platform results in `meta.yaml`.

---

## Installation

**Prerequisites:** [Bun](https://bun.sh/) runtime.

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and build
git clone <repo-url>
cd reachforge
bun install
bun run build          # creates ./bin/reach
```

Cross-platform builds:

```bash
bun run build:macos    # macOS ARM64
bun run build:win      # Windows x64
```

---

## Quick Start

```bash
# 1. Create a workspace
reach init --path ~/my-workspace
cd ~/my-workspace

# 2. Create a project (one project can hold multiple articles)
reach new --name product-launch
cd product-launch

# 3. Generate drafts directly from prompts, files, or directories
reach draft --source "Why AI pair programming changes everything"
reach draft --source ./notes/ai-pairing.md --name ai-pairing
reach draft --source ./research-folder/

# 4. Refine interactively
reach refine --article ai-pairing --feedback "make the intro more concise"

# 5. Adapt for different platforms per article
reach adapt --article ai-pairing --platforms x,devto

# 6. Schedule independently
reach schedule --article ai-pairing --date 2026-04-01T09:00

# 7. Publish all due articles
reach publish

# 8. Check status
reach status                    # Dashboard: all articles across stages
reach status --article ai-pairing         # Detail view for one article

# Or do it all in one shot:
reach go --prompt "write about apcore framework"                # Full auto: draft -> adapt -> publish
reach go --prompt "write about apcore" --name teaser            # Explicit article name
```

---

## The Content Pipeline

Each project contains three stage directories. Content flows left to right:

```
01_drafts ──▸ 02_adapted ──▸ 03_published
```

| Stage | Purpose | File Pattern |
|-------|---------|-------------|
| `01_drafts` | AI-generated long-form drafts | `{article}.md` |
| `02_adapted` | Platform-specific versions, ready to publish | `{article}.{platform}.md` (e.g., `teaser.x.md`) |
| `03_published` | Published archive | `{article}.{platform}.md` (results in `meta.yaml`) |
| `assets` | Shared media library | `images/`, `videos/`, `audio/`, `.asset-registry.yaml` |

**Platform IDs:** `x`, `devto`, `hashnode`, `wechat`, `zhihu`, `github`, `linkedin`, `medium`, `reddit`

All article metadata is stored in a single `meta.yaml` at the project root, indexed by article name.

Use the `@assets/` prefix to reference shared assets in articles:

```markdown
![hero](@assets/images/hero.png)
```

Assets are stored once and never duplicated when articles move between stages. During publishing, `@assets/` references are resolved to absolute paths automatically.

**Workspace layout:**

```
~/my-workspace/
├── .reach/
│   └── config.yaml            # Workspace config
├── project-a/
│   ├── 01_drafts/
│   ├── 02_adapted/
│   ├── 03_published/
│   ├── assets/                # Shared media library
│   │   ├── images/
│   │   ├── videos/
│   │   ├── audio/
│   │   └── .asset-registry.yaml
│   ├── meta.yaml              # Multi-article state index
│   ├── project.yaml           # Project config
│   └── skills/                # Custom LLM skills (optional)
└── project-b/
    └── ...
```

---

## Commands Reference

### Global Options

```
-w, --workspace <path>    Override workspace root directory
-P, --project <name>      Select project within workspace
-V, --version             Show version
-h, --help                Show help
```

---

### `reach init [--path <path>]`

Initialize a new workspace.

```bash
reach init                    # Interactive -- defaults to ~/reach-workspace
reach init --path ~/my-workspace     # Explicit path
```

Creates the `.reach/config.yaml` directory structure. Edit `config.yaml` to add API keys for the platforms you want to publish to.

---

### `reach new --name <project-name>`

Create a new project in the current workspace.

```bash
reach new --name my-blog
```

Scaffolds the three stage directories (`01_drafts`, `02_adapted`, `03_published`), a `project.yaml`, and the `assets/` library with `images/`, `videos/`, and `audio/` subdirectories.

---

### `reach status [--article <article>]`

Show pipeline dashboard or detail for a specific article.

```bash
reach status                        # Dashboard: all articles across stages
reach status --article teaser       # Detail view for one article (status, stage, platforms, schedule)
reach status --all                  # All projects in workspace
```

Without an article name, shows per-stage item counts and articles due today. With an article name, shows that article's status, current stage, platform results, and schedule.

---

### `reach workspace`

Show workspace info and list all projects.

```bash
reach workspace
```

---

### `reach draft --source <input>`

Generate an AI draft from a prompt string, file path, or directory.

```bash
reach draft --source "Why AI pair programming changes everything"    # From prompt string
reach draft --source ./notes/my-idea.md                              # From file
reach draft --source ./research-folder/                              # From directory
reach draft --source "AI tips" --name ai-tips                        # Explicit article name
```

| Option | Description |
|--------|-------------|
| `--source <input>` | Prompt string, file path, or directory path |
| `--name <slug>` | Explicit article name (default: auto-generated slug from input) |

- **Input:** A prompt string, a file path, or a directory path (provided via `--source`).
  - If directory: reads `main.md` > `index.md` > first `.md` > first `.txt`.
- **Output:** `01_drafts/{article}.md` (flat file). Metadata updated in project-root `meta.yaml`.
- **LLM adapter:** Controlled by `REACHFORGE_DRAFT_ADAPTER` or `REACHFORGE_LLM_ADAPTER`.

---

### `reach asset add <file>`

Register a media file into the project's shared asset library.

```bash
reach asset add ./hero-image.png              # Auto-detects subdir (images)
reach asset add ./demo.mp4                     # Auto-detects (videos)
reach asset add ./podcast.mp3 --subdir audio   # Explicit subdir
```

| Option | Description |
|--------|-------------|
| `-s, --subdir <type>` | Override auto-detection (`images`, `videos`, `audio`) |

The file is copied into `assets/{subdir}/` and registered in `.asset-registry.yaml`. Use the returned `@assets/` reference in your articles.

### `reach asset list`

List all registered assets.

```bash
reach asset list                    # All assets
reach asset list --subdir images    # Only images
```

| Option | Description |
|--------|-------------|
| `-s, --subdir <type>` | Filter by subdirectory |

---

### `reach refine --article <article>`

Interactively refine a draft article with AI feedback.

```bash
reach refine --article my-idea                                    # Interactive multi-turn session
reach refine --article my-idea --feedback "make the intro more concise"   # Single-turn, non-interactive
```

| Option | Description |
|--------|-------------|
| `--article <name>` | Article to refine |
| `--feedback <text>` | Non-interactive single refinement turn -- applies the feedback, saves, and exits |

**Interactive mode** opens a session with these commands:

| Command | Action |
|---------|--------|
| _(any text)_ | Send feedback to LLM, receive refined version |
| `/save` | Save current draft and exit |
| `/quit` | Discard changes and exit |
| `/status` | Show session info (adapter, turns, session ID) |
| `/diff` | Show differences from original |

**Features:**

- Sessions are persisted in `.reach/sessions/` and automatically resumed.
- Works on articles in `01_drafts` only.
- `--feedback` mode is useful for scripting and piping (e.g., `reach refine --article my-idea --feedback "fix typos" --json`).

---

### `reach adapt --article <article>`

Generate platform-specific versions from a draft article.

```bash
reach adapt --article my-idea                              # Default platforms
reach adapt --article my-idea --platforms x,devto,hashnode  # Specific platforms
reach adapt --article my-idea --force                       # Overwrite existing
```

| Option | Description |
|--------|-------------|
| `--article <name>` | Article to adapt |
| `--platforms <list>` | Comma-separated platform names |
| `--force` | Overwrite existing platform versions |

- **Input:** `01_drafts/{article}.md`.
- **Output:** `02_adapted/{article}.{platform}.md` per platform (e.g., `teaser.x.md`, `teaser.devto.md`).
- **Default platforms:** `x`, `wechat`, `zhihu`.
- Adapts all platforms in parallel.
- **Additive:** running `reach adapt --article article --platforms devto` after a previous `reach adapt --article article --platforms x` adds devto without removing x. Platform metadata is merged, not overwritten.
- If adaptation fails for some platforms, successfully adapted ones are still saved. Retry failed platforms by running adapt again.

**Supported platforms:** `x`, `devto`, `hashnode`, `wechat`, `zhihu`, `github`, `linkedin`, `medium`, `reddit`.

---

### `reach schedule --article <article> [--date <date>]`

Set an article's schedule date in metadata. Files remain in `02_adapted/`.

```bash
reach schedule --article my-idea --date 2026-04-01           # Date only (publishes anytime on that day)
reach schedule --article my-idea --date 2026-04-01T14:30      # Date + time (publishes after 14:30)
reach schedule --article my-idea                               # Defaults to today (publish immediately on next `reach publish`)
reach schedule --article my-idea --clear                       # Unschedule (revert to adapted status)
reach schedule --article my-idea --date 2026-04-01 --dryRun
```

| Option | Description |
|--------|-------------|
| `--article <name>` | Article to schedule |
| `--date <date>` | Schedule date (defaults to today if omitted) |
| `--dryRun` | Preview what would be scheduled |
| `--clear` | Unschedule: revert status to `adapted` and remove the schedule date |

- **Date formats:** `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, or `YYYY-MM-DDTHH:MM:SS`. Defaults to today if omitted.
- Sets `status: scheduled` and the `schedule` date in project-root `meta.yaml`. No file move occurs.
- Use `--clear` to unschedule — reverts status to `adapted` and removes the schedule date.

---

### `reach publish`

Publish all scheduled content that is due (schedule date <= now).

```bash
reach publish                                        # Publish all due scheduled articles
reach publish --article my-article                   # Publish specific article (any adapted/scheduled)
reach publish --article my-article --force           # Publish even if scheduled for a future date
reach publish --dryRun
reach publish --draft
```

| Option | Description |
|--------|-------------|
| `--article <name>` | Specific article to publish |
| `--force` | Publish even if article is scheduled for a future date |
| `--dryRun` | Preview without publishing |
| `--draft` | Publish as draft (overrides `published` frontmatter field) |

**Batch mode** (`reach publish` without `--article`): Finds articles with `status: scheduled` whose schedule time <= now.

**Single-article mode** (`reach publish --article <article>`): Publishes the specified article directly. If the article is scheduled for a future date, requires `--force` to proceed.

**Publishing pipeline:**

1. Checks `meta.yaml` for articles with `status: scheduled` whose schedule time <= now.
2. Reads platform files from `02_adapted/`.
3. Validates content per platform.
4. Acquires a per-article lock (in `meta.yaml`) to prevent concurrent runs.
5. Publishes to each platform.
6. Records per-platform results (status, url, error) in `meta.yaml`.
7. On success, moves article files to `03_published/`.
8. Releases the lock.

**Resumable:** If the process crashes mid-publish, re-running `reach publish` checks `meta.yaml` for already-succeeded platforms and skips them.

---

### `reach publish --article <article>` / `reach publish --article <file>`

Publish a specific article or an external file directly.

```bash
reach publish --article my-idea                              # Publish a pipeline article
reach publish --article ./external-post.md --platforms devto          # Publish external file to platform(s)
reach publish --article ./external-post.md --platforms devto --track  # Import to pipeline first, then publish
```

| Option | Description |
|--------|-------------|
| `--article <name>` | Article name or external file path |
| `--platforms <list>` | Comma-separated platform names |
| `--track` | Import external file into `02_adapted/` and track through the pipeline |
| `--dryRun` | Preview without publishing |
| `--draft` | Publish as draft on supported platforms |

When using `--track` with an external file, the file is first imported into `02_adapted/`, then published through the normal pipeline and archived to `03_published/`.

---

### `reach rollback --article <article>`

Move an article back one pipeline stage.

```bash
reach rollback --article my-idea
```

Moves the article's files to the previous stage:

- `03_published` -> `02_adapted`
- `02_adapted` -> `01_drafts`

Cannot roll back from `01_drafts`.

---

### `reach analytics`

Show publishing analytics and per-platform success metrics.

```bash
reach analytics                              # All-time metrics
reach analytics --from 2026-03-01            # Since March 1st
reach analytics --from 2026-03-01 --to 2026-03-31  # March only
```

| Option | Description |
|--------|-------------|
| `--from <date>` | Filter from date (YYYY-MM-DD) |
| `--to <date>` | Filter to date (YYYY-MM-DD) |

Aggregates publish results from `meta.yaml` for articles in `03_published/` and displays per-platform success rates with color-coded output (green >= 80%, yellow >= 50%, red < 50%).

---

### `reach go --prompt <prompt>`

Full auto pipeline: create content from a prompt, draft, adapt, and publish -- all in one command.

```bash
reach go --prompt "write about apcore framework"                    # Immediate: full pipeline -> publish now
reach go --prompt "write about apcore" --name teaser                # Explicit article name
reach go --prompt "write about apcore framework" --schedule 2026-04-01      # Deferred: schedule for later
reach go --prompt "compare Bun vs Node.js" --dryRun                # Full pipeline but skip actual publishing
reach go --prompt "AI pair programming tips" --draft                 # Publish as draft on supported platforms
```

| Option | Description |
|--------|-------------|
| `--prompt <text>` | Content prompt |
| `--name <name>` | Explicit article name (default: auto-generated slug from prompt) |
| `--schedule <date>` | Schedule for a future date (YYYY-MM-DD) instead of publishing immediately |
| `--dryRun` | Run full pipeline but skip actual publishing |
| `--draft` | Publish as draft on supported platforms |

If `--name` is omitted, a URL-safe slug is auto-generated from the prompt. If the slug already exists, `-2`, `-3` etc. is appended.

**Pipeline steps:**

1. Generates an AI draft from the prompt (`reach draft`)
2. Adapts for all configured platforms (`reach adapt`)
3. Publishes immediately (or schedules if `--schedule` is set)

Platforms are read from `project.yaml`. If the pipeline fails mid-way, the article is left at the last completed stage -- you can resume manually from there.

---

### `reach watch`

Start a daemon that auto-publishes due content at intervals. Supports both project-level and workspace-level monitoring.

```bash
# Project mode (default)
reach watch                     # Watch current project (60m interval)
reach watch --interval 30       # Watch current project (30m interval)

# Workspace mode
reach watch --all               # Watch all projects in workspace
reach watch --all -i 15         # Watch all projects, 15m interval

# Daemon management
reach watch --list              # Show all running watch daemons
reach watch --stop              # Stop daemon for current project
reach watch --stop my-project   # Stop daemon for specific project
```

| Option | Description |
|--------|-------------|
| `-i, --interval <minutes>` | Check interval (minimum: 1, default: 60) |
| `-a, --all` | Watch all projects in workspace |
| `-l, --list` | List running watch daemons and their status |
| `--stop [project]` | Stop a running watch daemon |

**Daemon registry:** Each running daemon writes a PID file under `.reach/watch/`. Use `--list` to see all running daemons with their PID, target project/workspace, and start time. PID files are automatically cleaned up on graceful shutdown (`SIGINT` / `SIGTERM`) or when stale entries are detected.

**Workspace mode** (`--all`) re-scans projects on each tick, so newly created projects are picked up automatically without restarting the daemon.

---

### `reach mcp`

Launch reachforge as an MCP (Model Context Protocol) server.

```bash
reach mcp                             # stdio transport, port 8000
reach mcp --transport sse --port 8001
```

| Option | Description |
|--------|-------------|
| `-t, --transport <type>` | `stdio` (default) or `sse` |
| `-p, --port <number>` | Port for SSE transport (default: 8000) |

Exposes these MCP tools: `reach_status`, `reach_draft`, `reach_adapt`, `reach_refine`, `reach_schedule`, `reach_publish`, `reach_go`, `reach_rollback`, `reach_asset_add`, `reach_asset_list`, `reach_analytics`.

---

## Configuration

### Configuration Layers (highest to lowest priority)

1. **Environment variables**
2. **Workspace `config.yaml`** -- `{workspace}/.reach/config.yaml`
3. **Global `config.yaml`** -- `~/.reach/config.yaml`

All configuration -- API keys, LLM settings, MCP auth -- lives in `config.yaml`. There are no `.env` or `credentials.yaml` files.

### What Needs Configuration and When

| Task | Required Configuration | Without it |
|------|----------------------|------------|
| `reach draft` / `reach adapt` | None (uses local CLI) | Just install & auth the CLI (`claude`, `gemini`, or `codex`) |
| Publish to **Dev.to** | `DEVTO_API_KEY` | Falls back to mock mode -- publish "succeeds" but nothing is actually posted |
| Publish to **X/Twitter** (via Postiz) | `POSTIZ_API_KEY` | Falls back to mock mode |
| Publish to **Hashnode** | `HASHNODE_API_KEY` + `HASHNODE_PUBLICATION_ID` | Falls back to mock mode (both required) |
| Publish to **GitHub Discussions** | `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` | Falls back to mock mode (all three required) |
| Gemini API mode | `GEMINI_API_KEY` | Error: `LLMNotConfiguredError` |
| MCP server auth | `MCP_AUTH_KEY` | MCP server runs without authentication |

> **Important:** When a platform API key is missing, `reach publish` silently uses a mock provider -- the receipt shows "success" but no content is actually published. Always use `reach publish --dryRun` first to preview, and check `reach analytics` to verify real publishing results.

### Workspace Configuration (`config.yaml`)

Created by `reach init`, located at `{workspace}/.reach/config.yaml` (or `~/.reach/config.yaml` for global config).

```yaml
# .reach/config.yaml
default_workspace: ~/my-workspace
credentials:
  DEVTO_API_KEY: your-key
  HASHNODE_API_KEY: your-key
  HASHNODE_PUBLICATION_ID: your-publication-id
  GITHUB_TOKEN: your-token
  GITHUB_OWNER: your-username
  GITHUB_REPO: your-repo
  POSTIZ_API_KEY: your-key
  MCP_AUTH_KEY: your-key
```

| Field | Type | Description |
|-------|------|-------------|
| `default_workspace` | string (optional) | Default workspace path, used as fallback when no workspace is found via directory traversal |
| `credentials` | key-value map (optional) | API keys and secrets; keys are variable names, values are the corresponding secrets |

### LLM Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `REACHFORGE_LLM_ADAPTER` | Default adapter (`claude`, `gemini`, `codex`) | `claude` |
| `REACHFORGE_DRAFT_ADAPTER` | Override adapter for `draft` stage | -- |
| `REACHFORGE_ADAPT_ADAPTER` | Override adapter for `adapt` stage | -- |
| `REACHFORGE_LLM_MODEL` | Model name | `gemini-pro` |
| `REACHFORGE_LLM_TIMEOUT` | Timeout in seconds | `120` |
| `REACHFORGE_CLAUDE_COMMAND` | Path to Claude CLI | `claude` |
| `REACHFORGE_GEMINI_COMMAND` | Path to Gemini CLI | `gemini` |
| `REACHFORGE_CODEX_COMMAND` | Path to Codex CLI | `codex` |

### Platform API Keys

These can be set as environment variables or placed in `config.yaml` under the `credentials` section:

```yaml
# In config.yaml
credentials:
  DEVTO_API_KEY: your-key
  HASHNODE_API_KEY: your-key
  HASHNODE_PUBLICATION_ID: your-publication-id
  GITHUB_TOKEN: your-token
  GITHUB_OWNER: your-username
  GITHUB_REPO: your-repo
  GITHUB_DISCUSSION_CATEGORY: General
  POSTIZ_API_KEY: your-key
  MCP_AUTH_KEY: your-key
```

Or as environment variables:

```bash
export DEVTO_API_KEY=your-key
export HASHNODE_API_KEY=your-key
export HASHNODE_PUBLICATION_ID=your-publication-id
export GITHUB_TOKEN=your-token
export GITHUB_OWNER=your-username
export GITHUB_REPO=your-repo
export GITHUB_DISCUSSION_CATEGORY=General
export POSTIZ_API_KEY=your-key
export MCP_AUTH_KEY=your-key
```

### Project Configuration (`project.yaml`)

```yaml
name: my-blog
description: My tech blog
platforms: [x, devto, hashnode]
language: en
tone: professional
default_tags: [tech, ai]
```

### Workspace Resolution

When you run any command, reachforge resolves the workspace in this order:

1. `--workspace` flag or `REACHFORGE_WORKSPACE` env var.
2. Walk up from `cwd` looking for a `.reach/` directory.
3. Check `cwd` for `project.yaml` (treat parent as workspace).
4. Check `~/.reach/config.yaml` for `default_workspace`, or fall back to `~/reach-workspace`.
5. Fallback: treat `cwd` as the project root (backward compatible).

---

## LLM Integration

### Supported Adapters

| Adapter | CLI Tool | Setup |
|---------|----------|-------|
| Claude | `claude` | `claude login` |
| Gemini | `gemini` | `gemini login` |
| Codex | `codex` | `codex login` |

Each adapter wraps the respective CLI tool. You can mix adapters per stage -- for example, use Gemini for drafting and Claude for adaptation:

```bash
export REACHFORGE_DRAFT_ADAPTER=gemini
export REACHFORGE_ADAPT_ADAPTER=claude
```

### Token Usage

After each LLM call, reachforge reports usage:

```
Tokens: 1234 in / 5678 out ($0.02)
```

---

## Platform Providers

### Supported Platforms

| Platform | Provider | API | Content Format |
|----------|----------|-----|----------------|
| Dev.to | `DevtoProvider` | REST | Markdown with YAML frontmatter |
| Hashnode | `HashnodeProvider` | GraphQL | Markdown with H1 title |
| GitHub | `GitHubProvider` | GraphQL | Markdown with H1 title |
| X | `PostizProvider` | REST (Postiz SaaS) | Markdown thread (`---` delimited) |

### Content Validation Rules

Each platform validates content before publishing:

| Platform | Requirements |
|----------|-------------|
| **Dev.to** | Must have YAML frontmatter with `title` field |
| **Hashnode** | Must have H1 heading or frontmatter `title` |
| **GitHub** | Must have H1 heading (becomes discussion title) |
| **X** | Thread segments delimited by `---`; each segment <= 280 characters |

### Publish Result Tracking

After publishing, results are stored in project-root `meta.yaml` per article per platform:

```yaml
# meta.yaml
articles:
  my-post:
    status: published
    platforms:
      devto:
        status: success
        url: https://dev.to/user/my-post
        published_at: "2026-04-01T15:30:00Z"
      x:
        status: failed
        error: "API rate limit exceeded"
```

---

## Skill System

Skills are Markdown files that provide instructions and context to the LLM during draft and adapt stages.

### Skill Precedence (highest to lowest)

1. **Project-level** -- `{project}/skills/`
2. **Workspace-level** -- `{workspace}/skills/`
3. **Built-in** -- bundled with reachforge

### Skill Directory Structure

```
skills/
├── stages/
│   ├── draft.md        # Drafting instructions
│   └── adapt.md        # Adaptation instructions
└── platforms/
    ├── x.md            # X/Twitter-specific guidance
    ├── devto.md        # Dev.to-specific guidance
    ├── hashnode.md
    ├── github.md
    ├── wechat.md
    └── zhihu.md
```

To customize behavior, create a `skills/` directory in your project or workspace and add or override any of these files.

---

## Template System

Templates let you customize the AI prompts used for drafting and adaptation. They are YAML files stored in a `templates/` directory.

### Template Precedence (highest to lowest)

1. **Project-level** -- `{project}/templates/`
2. **Workspace-level** -- `{workspace}/templates/`
3. **Built-in defaults** -- hardcoded `DEFAULT_DRAFT_PROMPT` and `PLATFORM_PROMPTS`

### Template File Format

```yaml
# templates/tech-blog.yaml
name: tech-blog
type: draft                    # 'draft' or 'adapt'
prompt: "Write a {tone} technical blog post about {topic}. Include code examples and real-world use cases."
vars:
  tone: professional
  topic: AI
```

For platform-specific adapt templates:

```yaml
# templates/devto.yaml
name: devto-custom
type: adapt
platform: devto               # optional: restricts to this platform
prompt: "Rewrite this for Dev.to with {style} style. Include YAML frontmatter."
vars:
  style: tutorial
```

### Using Templates

**Per-article override:** Add a `template` field to your article's metadata in `meta.yaml`:

```yaml
# meta.yaml
articles:
  my-idea:
    template: tech-blog           # loads templates/tech-blog.yaml
```

**Convention-based:** Create a template named after a platform (e.g., `templates/devto.yaml`) and it will be used automatically for that platform during `reach adapt`.

**Variable interpolation:** `{varName}` patterns in the prompt are replaced with values from the template's `vars` field. Unmatched variables are left as-is.

---

## MCP Server

reachforge can run as an MCP server, making its pipeline available to AI agents and other MCP clients.

```bash
# stdio (for Claude Desktop, etc.)
reach mcp

# SSE (for networked access)
reach mcp --transport sse --port 8001
```

### Available MCP Tools

| Tool | Input | Description |
|------|-------|-------------|
| `reach_status` | `article?: string` | Pipeline dashboard or single-article detail |
| `reach_draft` | `input: string`, `name?: string` | Generate draft from prompt, file, or directory |
| `reach_adapt` | `article: string`, `platforms?: string`, `force?: boolean` | Adapt for platforms |
| `reach_schedule` | `article: string`, `date?: string` | Schedule for publishing (date defaults to today) |
| `reach_publish` | `dryRun?: boolean` | Publish all due articles |
| `reach_rollback` | `article: string` | Roll back one stage |
| `reach_refine` | `article: string`, `feedback: string` | Refine a draft with AI feedback |
| `reach_go` | `prompt: string`, `name?: string`, `schedule?: string`, `dryRun?: boolean`, `draft?: boolean` | Full auto pipeline from prompt to publish |
| `reach_asset_add` | `file: string`, `subdir?: string` | Register media asset |
| `reach_asset_list` | `subdir?: string` | List registered assets |
| `reach_analytics` | `from?: string`, `to?: string` | Publishing success metrics |

---

## Troubleshooting

### LLM not found

```
Error: claude: command not found
```

Install the CLI tool and authenticate:

```bash
# For Claude
npm install -g @anthropic-ai/claude-code && claude login

# For Gemini
npm install -g @anthropic-ai/gemini-cli && gemini login
```

Or override the command path:

```bash
export REACHFORGE_CLAUDE_COMMAND=/path/to/claude
```

### LLM timeout

```
Error: LLM call timed out
```

Increase the timeout:

```bash
export REACHFORGE_LLM_TIMEOUT=300
```

### Publish lock stuck

If a publish run was interrupted and the lock remains in `meta.yaml`:

```bash
# Verify no other publish process is running.
# The lock is in meta.yaml under _locks -- it will auto-clear
# on the next run if the PID is no longer alive.
# To force-clear, edit meta.yaml and remove the _locks entry.
```

### Session issues with `refine`

If a session becomes stale or the adapter changed, reachforge automatically archives the old session and starts fresh. Archived sessions are saved as `.bak` files in `.reach/sessions/`.

### Validation failures

Use `--dryRun` to preview issues before publishing:

```bash
reach publish --dryRun
```

Common validation issues:
- **Dev.to:** Missing YAML frontmatter or `title` field.
- **X:** A thread segment exceeds 280 characters.
- **GitHub/Hashnode:** Missing H1 heading.
