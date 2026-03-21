# reachforge User Manual

**ReachForge — The Social Influence Engine for AI-Native Content**

Version 0.1.0

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
10. [MCP Server](#mcp-server)
11. [Troubleshooting](#troubleshooting)

---

## Overview

reachforge is a CLI tool that transforms raw ideas into polished, platform-specific content through a six-stage file-based pipeline. It uses AI (Claude, Gemini, or Codex) to draft, refine, and adapt articles for multiple publishing platforms — Dev.to, Hashnode, GitHub Discussions, and X (via Postiz).

**Key design principles:**

- **File-as-state** — no database; the directory structure _is_ the pipeline state.
- **Multi-project workspaces** — manage many content projects from a single workspace.
- **Pluggable LLM adapters** — switch between Claude, Gemini, and Codex per stage.
- **Progressive publishing** — resumable, lock-protected, with per-platform receipts.

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
reach init ~/my-workspace
cd ~/my-workspace

# 2. Create a project
reach new my-blog
cd my-blog

# 3. Drop an idea into the inbox
echo "Why AI pair programming changes everything..." > 01_inbox/ai-pairing.md

# 4. Generate a draft
reach draft ai-pairing.md

# 5. Refine interactively
reach refine ai-pairing

# 6. Promote to master
reach approve ai-pairing

# 7. Add shared assets (optional)
reach asset add ./hero-image.png

# 8. Adapt for platforms
reach adapt ai-pairing --platforms devto,hashnode,x

# 9. Schedule
reach schedule ai-pairing 2026-04-01

# 10. Publish
reach publish
```

---

## The Content Pipeline

Each project contains six stage directories. Content flows left to right:

```
01_inbox ──▸ 02_drafts ──▸ 03_master ──▸ 04_adapted ──▸ 05_scheduled ──▸ 06_sent
```

| Stage | Purpose | Key Files |
|-------|---------|-----------|
| `01_inbox` | Raw material — notes, sketches, ideas | Any `.md` / `.txt` |
| `02_drafts` | AI-generated long-form drafts | `draft.md`, `meta.yaml` |
| `03_master` | Editor-approved source of truth | `master.md`, `meta.yaml` |
| `04_adapted` | Platform-specific versions | `platform_versions/{platform}.md` |
| `05_scheduled` | Content awaiting publish date | `meta.yaml` (with `publish_date`) |
| `06_sent` | Published archive | `receipt.yaml` |
| `assets` | Shared media library | `images/`, `videos/`, `audio/`, `.asset-registry.yaml` |

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
│   ├── 01_inbox/
│   ├── 02_drafts/
│   ├── 03_master/
│   ├── 04_adapted/
│   ├── 05_scheduled/
│   ├── 06_sent/
│   ├── assets/                # Shared media library
│   │   ├── images/
│   │   ├── videos/
│   │   ├── audio/
│   │   └── .asset-registry.yaml
│   ├── project.yaml           # Project config
│   ├── .env                   # API keys (optional)
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

### `reach init [path]`

Initialize a new workspace.

```bash
reach init                    # Interactive — defaults to ~/reach-workspace
reach init ~/my-workspace     # Explicit path
```

Creates the `.reach/config.yaml` directory structure and a `.env` template with all configuration options commented out. Edit the `.env` file to add API keys for the platforms you want to publish to.

---

### `reach new <project-name>`

Create a new project in the current workspace.

```bash
reach new my-blog
```

Scaffolds all six stage directories, a `project.yaml`, and the `assets/` library with `images/`, `videos/`, and `audio/` subdirectories.

---

### `reach status`

Show pipeline dashboard for the current project.

```bash
reach status           # Current project
reach status --all     # All projects in workspace
```

Displays item counts per stage and items due today.

---

### `reach workspace`

Show workspace info and list all projects.

```bash
reach workspace
```

---

### `reach draft <source>`

Generate an AI draft from an inbox source.

```bash
reach draft my-idea.md
```

- **Input:** File or directory in `01_inbox/`.
  - If directory: reads `main.md` > `index.md` > first `.md` > first `.txt`.
- **Output:** `02_drafts/{name}/draft.md` + `meta.yaml`.
- **LLM adapter:** Controlled by `REACHFORGE_DRAFT_ADAPTER` or `REACHFORGE_LLM_ADAPTER`.

---

### `reach approve <article>`

Promote a draft to master stage.

```bash
reach approve my-idea
```

- Moves article from `02_drafts/` to `03_master/`.
- Automatically renames `draft.md` to `master.md`.
- Updates metadata status to `master`.

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

### `reach refine <article>`

Interactively refine a draft or master article with AI feedback.

```bash
reach refine my-idea
```

Opens an interactive session with these commands:

| Command | Action |
|---------|--------|
| _(any text)_ | Send feedback to LLM, receive refined version |
| `/save` | Save current draft and exit |
| `/quit` | Discard changes and exit |
| `/status` | Show session info (adapter, turns, session ID) |
| `/diff` | Show differences from original |

**Features:**

- Sessions are persisted in `.reach/sessions/` and automatically resumed.
- Works on articles in both `02_drafts` and `03_master`.
- Non-TTY mode: single-turn refinement from piped input.

---

### `reach adapt <article>`

Generate platform-specific versions from a master article.

```bash
reach adapt my-idea                              # Default platforms
reach adapt my-idea --platforms x,devto,hashnode  # Specific platforms
reach adapt my-idea --force                       # Overwrite existing
```

| Option | Description |
|--------|-------------|
| `-p, --platforms <list>` | Comma-separated platform names |
| `-f, --force` | Overwrite existing platform versions |

- **Input:** Article in `03_master/`.
- **Output:** `04_adapted/{article}/platform_versions/{platform}.md` per platform.
- **Default platforms:** `x`, `wechat`, `zhihu`.
- Adapts all platforms in parallel.

**Supported platforms:** `x`, `wechat`, `zhihu`, `devto`, `hashnode`, `github`.

---

### `reach schedule <article> <date>`

Move an adapted article to the scheduled stage.

```bash
reach schedule my-idea 2026-04-01
reach schedule my-idea 2026-04-01 --dry-run
```

| Option | Description |
|--------|-------------|
| `-n, --dry-run` | Preview what would be moved |

- **Date format:** `YYYY-MM-DD`.
- Creates `05_scheduled/2026-04-01-my-idea/` with a `meta.yaml` containing the publish date.

---

### `reach publish`

Publish all scheduled content that is due (date <= today).

```bash
reach publish
reach publish --dry-run
reach publish --draft
```

| Option | Description |
|--------|-------------|
| `-n, --dry-run` | Preview without publishing |
| `-d, --draft` | Publish as draft (overrides `published` frontmatter field) |

**Publishing pipeline:**

1. Scans `05_scheduled/` for items with date <= today.
2. Validates content per platform.
3. Acquires a lock (`.publish.lock`) to prevent concurrent runs.
4. Publishes to each platform (in parallel).
5. Writes progressive `receipt.yaml` tracking per-platform status.
6. On success, moves the item to `06_sent/`.
7. Releases the lock.

**Resumable:** If the process crashes mid-publish, re-running `reach publish` picks up from where it left off using the receipt file.

---

### `reach rollback <project>`

Move a project back one pipeline stage.

```bash
reach rollback my-idea
```

Moves the project to the previous stage (e.g., `05_scheduled` -> `04_adapted`). Cannot roll back from `01_inbox`.

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

Aggregates `receipt.yaml` from `06_sent/` and displays per-platform success rates (success/total) with color-coded output (green >= 80%, yellow >= 50%, red < 50%).

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

Exposes these MCP tools: `reach_status`, `reach_draft`, `reach_adapt`, `reach_approve`, `reach_schedule`, `reach_publish`, `reach_rollback`, `reach_asset_add`, `reach_asset_list`, `reach_analytics`.

---

## Configuration

### Configuration Layers (highest to lowest priority)

1. **Environment variables**
2. **Project `.env`** — `{project}/.env`
3. **Project `credentials.yaml`** — `{project}/credentials.yaml`
4. **Workspace `.env`** — `{workspace}/.env`
5. **Workspace `config.yaml`** — `{workspace}/.reach/config.yaml`
6. **Global config** — `~/.reach/config.yaml`

### What Needs Configuration and When

| Task | Required Configuration | Without it |
|------|----------------------|------------|
| `reach draft` / `reach adapt` | None (uses local CLI) | Just install & auth the CLI (`claude`, `gemini`, or `codex`) |
| Publish to **Dev.to** | `DEVTO_API_KEY` | Falls back to mock mode — publish "succeeds" but nothing is actually posted |
| Publish to **X/Twitter** (via Postiz) | `POSTIZ_API_KEY` | Falls back to mock mode |
| Publish to **Hashnode** | `HASHNODE_API_KEY` + `HASHNODE_PUBLICATION_ID` | Falls back to mock mode (both required) |
| Publish to **GitHub Discussions** | `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` | Falls back to mock mode (all three required) |
| Gemini API mode | `GEMINI_API_KEY` | Error: `LLMNotConfiguredError` |
| MCP server auth | `MCP_AUTH_KEY` | MCP server runs without authentication |

> **Important:** When a platform API key is missing, `reach publish` silently uses a mock provider — the receipt shows "success" but no content is actually published. Always use `reach publish --dry-run` first to preview, and check `reach analytics` to verify real publishing results.

### Workspace Configuration (`config.yaml`)

Created by `reach init`, located at `{workspace}/.reach/config.yaml` (or `~/.reach/config.yaml` for global config).

```yaml
# .reach/config.yaml
default_workspace: ~/my-workspace
credentials:
  DEVTO_API_KEY: your-key
  HASHNODE_API_KEY: your-key
```

| Field | Type | Description |
|-------|------|-------------|
| `default_workspace` | string (optional) | Default workspace path, used as fallback when no workspace is found via directory traversal |
| `credentials` | key-value map (optional) | API keys and secrets; keys are variable names, values are the corresponding secrets |

### LLM Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `REACHFORGE_LLM_ADAPTER` | Default adapter (`claude`, `gemini`, `codex`) | `claude` |
| `REACHFORGE_DRAFT_ADAPTER` | Override adapter for `draft` stage | — |
| `REACHFORGE_ADAPT_ADAPTER` | Override adapter for `adapt` stage | — |
| `REACHFORGE_LLM_MODEL` | Model name | `gemini-pro` |
| `REACHFORGE_LLM_TIMEOUT` | Timeout in seconds | `120` |
| `REACHFORGE_CLAUDE_COMMAND` | Path to Claude CLI | `claude` |
| `REACHFORGE_GEMINI_COMMAND` | Path to Gemini CLI | `gemini` |
| `REACHFORGE_CODEX_COMMAND` | Path to Codex CLI | `codex` |

### Platform API Keys

```bash
# Dev.to
DEVTO_API_KEY=your-key

# Hashnode
HASHNODE_API_KEY=your-key
HASHNODE_PUBLICATION_ID=your-publication-id

# GitHub Discussions
GITHUB_TOKEN=your-token
GITHUB_OWNER=your-username
GITHUB_REPO=your-repo
GITHUB_DISCUSSION_CATEGORY=General

# X (via Postiz)
POSTIZ_API_KEY=your-key

# MCP Server Auth
MCP_AUTH_KEY=your-key
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

Each adapter wraps the respective CLI tool. You can mix adapters per stage — for example, use Gemini for drafting and Claude for adaptation:

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

### Receipt Tracking

After publishing, `receipt.yaml` records the outcome:

```yaml
status: completed
published_at: 2026-04-01T15:30:00Z
items:
  - platform: devto
    status: success
    url: https://dev.to/user/my-post
  - platform: x
    status: failed
    error: "API rate limit exceeded"
```

---

## Skill System

Skills are Markdown files that provide instructions and context to the LLM during draft and adapt stages.

### Skill Precedence (highest to lowest)

1. **Project-level** — `{project}/skills/`
2. **Workspace-level** — `{workspace}/skills/`
3. **Built-in** — bundled with reachforge

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

1. **Project-level** — `{project}/templates/`
2. **Workspace-level** — `{workspace}/templates/`
3. **Built-in defaults** — hardcoded `DEFAULT_DRAFT_PROMPT` and `PLATFORM_PROMPTS`

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

**Per-article override:** Add a `template` field to your article's `meta.yaml`:

```yaml
# 01_inbox/my-idea/meta.yaml
article: my-idea
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
| `reach_status` | — | Pipeline dashboard |
| `reach_draft` | `source: string` | Generate draft from inbox item |
| `reach_adapt` | `article: string`, `platforms?: string`, `force?: boolean` | Adapt for platforms |
| `reach_schedule` | `article: string`, `date: string` | Schedule for publishing |
| `reach_publish` | `dryRun?: boolean` | Publish due content |
| `reach_rollback` | `project: string` | Roll back one stage |
| `reach_approve` | `article: string` | Promote draft to master |
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

If a publish run was interrupted and the lock file remains:

```bash
# Verify no other publish process is running, then:
rm 05_scheduled/{item}/.publish.lock
```

### Session issues with `refine`

If a session becomes stale or the adapter changed, reachforge automatically archives the old session and starts fresh. Archived sessions are saved as `.bak` files in `.reach/sessions/`.

### Validation failures

Use `--dry-run` to preview issues before publishing:

```bash
reach publish --dry-run
```

Common validation issues:
- **Dev.to:** Missing YAML frontmatter or `title` field.
- **X:** A thread segment exceeds 280 characters.
- **GitHub/Hashnode:** Missing H1 heading.
