# ReachForge (`reach`)

> **ReachForge: The Social Influence Engine for AI-Native Content.**

**ReachForge** is an **AI-native Social Influence Engine** for end-users. It adopts a "File-as-State" design philosophy, transforming inspiration fragments into multi-platform viral assets through a lightweight six-stage pipeline.

## Core Design Philosophy
- **Directory-based Sync**: No database required. Folders represent states, filenames act as timestamps, and YAML files store metadata.
- **Bun Driven**: Extreme execution efficiency and single-file binary distribution, perfectly suited for CLI and desktop environments.
- **Hybrid Publishing Strategy**: Supports direct local API publishing and SaaS-bridged (e.g., Postiz) publishing.
- **AI Adapter Pattern**: Automatically rewrites the master draft into optimal versions for different platforms (X, WeChat, Zhihu) via LLM.

## Directory Pipeline (01-06) + Assets

1. `📥_01_inbox`: Raw material entry.
2. `✍️_02_drafts`: AI-generated long-form drafts.
3. `🎯_03_master`: "Master draft/Source file" signed off by the Editor-in-Chief (User). Use `reach approve` to promote from drafts.
4. `🤖_04_adapted`: **Core Stage**! AI-generated multi-platform adapted version folders.
5. `📅_05_scheduled`: Confirmed schedule, awaiting automatic/manual distribution bundles.
6. `📤_06_sent`: Published history archive, including publication receipts.
7. `🗂️_assets`: Shared asset library for images, videos, and audio — referenced via `@assets/` prefix in articles, never duplicated across stages.

## Quick Start

### 1. Install an LLM CLI

ReachForge uses local CLI tools for AI generation — no API keys needed. Install at least one:

| Adapter | Install | Auth |
|---------|---------|------|
| **Claude** (default) | [claude.ai/claude-code](https://docs.anthropic.com/en/docs/claude-code) | `claude` (follow prompts) |
| **Gemini** | [ai.google.dev/gemini-cli](https://ai.google.dev/gemini-cli) | `gemini` (follow prompts) |
| **Codex** | [github.com/openai/codex](https://github.com/openai/codex) | `codex` (follow prompts) |

### 2. Initialize Workspace & Configure

```bash
reach init ~/reach-workspace
cd ~/reach-workspace
```

`reach init` auto-generates a `.env` template in your workspace (all values commented out). Edit it to add keys for the platforms you use:

```bash
# ~/reach-workspace/.env

# LLM adapter (claude, gemini, or codex)
# REACHFORGE_LLM_ADAPTER=claude

# Platform API keys — only for the platforms you publish to
# DEVTO_API_KEY=your-key
# POSTIZ_API_KEY=your-key
# HASHNODE_API_KEY=your-key
# HASHNODE_PUBLICATION_ID=your-id
# GITHUB_TOKEN=your-token
# GITHUB_OWNER=your-username
# GITHUB_REPO=your-repo
```

### What needs configuration and when

| Task | Required Configuration | Without it |
|------|----------------------|------------|
| `reach draft` / `reach adapt` | None (uses local CLI) | Just install & auth the CLI (`claude`, `gemini`, or `codex`) |
| Publish to **Dev.to** | `DEVTO_API_KEY` | Falls back to mock mode — publish "succeeds" but nothing is actually posted |
| Publish to **X/Twitter** (via Postiz) | `POSTIZ_API_KEY` | Falls back to mock mode |
| Publish to **Hashnode** | `HASHNODE_API_KEY` + `HASHNODE_PUBLICATION_ID` | Falls back to mock mode (both required) |
| Publish to **GitHub Discussions** | `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` | Falls back to mock mode (all three required) |
| Gemini API mode | `GEMINI_API_KEY` | Error: `LLMNotConfiguredError` |
| MCP server auth | `MCP_AUTH_KEY` | MCP server runs without authentication |

> **Important:** When a platform API key is missing, `reach publish` silently uses a mock provider — the receipt shows "success" but no content is actually published. Use `--dry-run` or check `reach analytics` to verify real publishing.

You can also use different adapters for different stages:

```bash
REACHFORGE_DRAFT_ADAPTER=gemini   # Use Gemini for drafting
REACHFORGE_ADAPT_ADAPTER=claude   # Use Claude for platform adaptation
```

**Configuration precedence** (highest to lowest):

| Layer | Location | Scope |
|-------|----------|-------|
| 1 | Environment variables | Session |
| 2 | `{project}/.env` | Single project |
| 3 | `{workspace}/.env` | All projects in workspace |
| 4 | `~/.reach/config.yaml` | Global (all workspaces) |

### 3. Create a Project & Run

```bash
reach new my-tech-blog
cd my-tech-blog

reach status                          # View pipeline dashboard
reach asset add ./photo.jpg           # Register asset to shared library
reach asset list                      # List all registered assets
reach draft my-idea.md                # Generate draft from inbox
reach approve my-idea                 # Promote draft to master
reach adapt my-article                # Adapt for all platforms
reach schedule my-article 2026-03-20         # Schedule for a date
reach schedule my-article 2026-03-20T14:30   # Schedule for a date + time
reach schedule my-article                    # Schedule for today (immediate)
reach publish                         # Publish due content
reach watch                           # Daemon mode: auto-publish on schedule
reach analytics                       # View publishing success metrics

# Or do it all in one shot:
reach go "write about apcore framework"              # Full auto → publish now
reach go "write about apcore framework" -s 2026-04-01  # Full auto → schedule
```

## Development

**ReachForge** recommends using [Bun](https://bun.sh/) for extreme performance and a single-file distribution experience.

```bash
# Install dependencies
bun install

# Run tests
bun run test
```

### Running in Development

Use the `dev` script to run commands directly from TypeScript source (no build step required):

```bash
bun dev status                    # bun run src/index.ts status
bun dev watch --all               # bun run src/index.ts watch --all
bun dev publish --dry-run         # bun run src/index.ts publish --dry-run
```

### Building & Using the Binary

Compile to a standalone single-file binary — no Bun or Node.js runtime needed on the target machine:

```bash
# Build for current platform
bun run build                     # outputs: bin/reach

# Run the compiled binary
./bin/reach status
./bin/reach watch --all -i 15

# Install globally via symlink
sudo ln -sf "$PWD/bin/reach" /usr/local/bin/reach
reach status                      # now works anywhere
```

### Cross-compilation

```bash
bun run build:macos               # bin/reach-macos  (macOS ARM)
bun run build:win                 # bin/reach.exe    (Windows x64)
```

## VSCode Extension & Mobile
- **VSCode**: Core logic is fully compatible with the `VSCode Extension` TS environment, allowing direct invocation of compiled binaries via `Sidecar`.
- **Claude/Gemini**: Native support for the `MCP (Model Context Protocol)`, allowing LLMs to directly manipulate your content pipeline.
- **Mobile Future**: File processing logic layers can be reused later via `React Native`.


## License

Apache-2.0