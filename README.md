# aphype (AI PartnerUp Hype)

> **aphype: The Social Influence Engine for AI-Native Content.**

**aphype** is an **AI-native Social Influence Engine** for end-users. It adopts a "File-as-State" design philosophy, transforming inspiration fragments into multi-platform viral assets through a lightweight six-stage pipeline.

## Core Design Philosophy
- **Directory-based Sync**: No database required. Folders represent states, filenames act as timestamps, and YAML files store metadata.
- **Bun Driven**: Extreme execution efficiency and single-file binary distribution, perfectly suited for CLI and desktop environments.
- **Hybrid Publishing Strategy**: Supports direct local API publishing and SaaS-bridged (e.g., Postiz) publishing.
- **AI Adapter Pattern**: Automatically rewrites the master draft into optimal versions for different platforms (X, WeChat, Zhihu) via LLM.

## Directory Pipeline (01-06)
1. `📥_01_inbox`: Raw material entry.
2. `✍️_02_drafts`: AI-generated long-form drafts.
3. `🎯_03_master`: "Master draft/Source file" signed off by the Editor-in-Chief (User).
4. `🤖_04_adapted`: **Core Stage**! AI-generated multi-platform adapted version folders.
5. `📅_05_scheduled`: Confirmed schedule, awaiting automatic/manual distribution bundles.
6. `📤_06_sent`: Published history archive, including publication receipts.

## Quick Start

### 1. Install an LLM CLI

aphype uses local CLI tools for AI generation — no API keys needed. Install at least one:

| Adapter | Install | Auth |
|---------|---------|------|
| **Claude** (default) | [claude.ai/claude-code](https://docs.anthropic.com/en/docs/claude-code) | `claude` (follow prompts) |
| **Gemini** | [ai.google.dev/gemini-cli](https://ai.google.dev/gemini-cli) | `gemini` (follow prompts) |
| **Codex** | [github.com/openai/codex](https://github.com/openai/codex) | `codex` (follow prompts) |

### 2. Initialize Workspace & Configure

```bash
aphype init ~/aphype-workspace
cd ~/aphype-workspace
```

Create a `.env` file **in the workspace directory** with your API keys:

```bash
# ~/aphype-workspace/.env

# LLM adapter (claude, gemini, or codex)
APHYPE_LLM_ADAPTER=claude

# Platform API keys (for publishing)
DEVTO_API_KEY=your-key        # Dev.to: Settings > Extensions > DEV API Keys
POSTIZ_API_KEY=your-key       # Postiz (for X/Twitter): postiz.com Dashboard > API
```

You can also use different adapters for different stages:

```bash
APHYPE_DRAFT_ADAPTER=gemini   # Use Gemini for drafting
APHYPE_ADAPT_ADAPTER=claude   # Use Claude for platform adaptation
```

**Configuration precedence** (highest to lowest):

| Layer | Location | Scope |
|-------|----------|-------|
| 1 | Environment variables | Session |
| 2 | `{project}/.env` | Single project |
| 3 | `{workspace}/.env` | All projects in workspace |
| 4 | `~/.aphype/config.yaml` | Global (all workspaces) |

### 3. Create a Project & Run

```bash
aphype new my-tech-blog
cd my-tech-blog

aphype status                          # View pipeline dashboard
aphype draft my-idea.md                # Generate draft from inbox
aphype adapt my-article                # Adapt for all platforms
aphype schedule my-article 2026-03-20  # Schedule for publishing
aphype publish                         # Publish due content
aphype watch                           # Daemon mode: auto-publish on schedule
```

## Development

**aphype** recommends using [Bun](https://bun.sh/) for extreme performance and a single-file distribution experience.

```bash
# Install dependencies
bun install

# Run development version
bun dev status

# Run tests
bun test

# Compile to single-file binary (current platform)
bun run build

# Cross-compile (Windows)
bun run build:win

# Cross-compile (macOS ARM)
bun run build:macos
```

## VSCode Extension & Mobile
- **VSCode**: Core logic is fully compatible with the `VSCode Extension` TS environment, allowing direct invocation of compiled binaries via `Sidecar`.
- **Claude/Gemini**: Native support for the `MCP (Model Context Protocol)`, allowing LLMs to directly manipulate your content pipeline.
- **Mobile Future**: File processing logic layers can be reused later via `React Native`.
