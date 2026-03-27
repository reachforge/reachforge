# ReachForge (`reach`)

> **ReachForge: The Social Influence Engine for AI-Native Content.**

**ReachForge** is an **AI-native Social Influence Engine** for end-users. It adopts a "File-as-State" design philosophy, transforming inspiration fragments into multi-platform viral assets through a lightweight three-stage pipeline.

## Core Design Philosophy
- **File-as-State**: No database required. Flat `.md` files flow through 3 pipeline stages. A single `meta.yaml` at project root tracks all article states.
- **Multi-Article Projects**: One project holds multiple articles, each independently targeting different platforms and schedules.
- **Bun Driven**: Extreme execution efficiency and single-file binary distribution, perfectly suited for CLI and desktop environments.
- **Hybrid Publishing Strategy**: Supports direct local API publishing and SaaS-bridged (e.g., Postiz) publishing.
- **AI Adapter Pattern**: Automatically rewrites the draft into optimal versions for different platforms (X, WeChat, Zhihu) via LLM.

## Pipeline (01-03) + Assets

Each project contains 3 stage directories. Articles are flat `.md` files that move between stages:

| Stage | Files | Description |
|-------|-------|-------------|
| `01_drafts` | `{article}.md` | AI-generated drafts from prompt, file, or directory input |
| `02_adapted` | `{article}.{platform}.md` | Platform-specific versions (e.g., `teaser.x.md`, `teaser.devto.md`) |
| `03_published` | `{article}.{platform}.md` | Published archive (results in `meta.yaml`) |
| `assets/` | images, videos, audio | Shared asset library — referenced via `@assets/` prefix |

Platform IDs: `x`, `devto`, `hashnode`, `wechat`, `zhihu`, `github`, `linkedin`, `medium`, `reddit`

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

`reach init` creates a workspace with a `.reach/config.yaml` file. Edit it to add keys for the platforms you use:

```yaml
# ~/reach-workspace/.reach/config.yaml

# LLM adapter (claude, gemini, or codex)
# llm:
#   adapter: claude

# Platform API keys — only for the platforms you publish to
# devto:
#   apiKey: your-key
# postiz:
#   apiKey: your-key
# hashnode:
#   apiKey: your-key
#   publicationId: your-id
# github:
#   token: your-token
#   owner: your-username
#   repo: your-repo
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

```yaml
# In config.yaml
llm:
  draftAdapter: gemini    # Use Gemini for drafting
  adaptAdapter: claude    # Use Claude for platform adaptation
```

**Configuration precedence** (highest to lowest):

| Layer | Location | Scope |
|-------|----------|-------|
| 1 | Environment variables | Session |
| 2 | `{workspace}/.reach/config.yaml` | Workspace |
| 3 | `~/.reach/config.yaml` | Global (all workspaces) |

### 3. Create a Project & Run

```bash
reach new product-launch
cd product-launch

# Multiple articles in one project, each with independent platforms & schedules:
reach status                                     # View pipeline dashboard
reach status teaser                              # Detail for one article

reach draft "write a teaser about our launch"    # Generate draft from prompt
reach draft ./notes.md                           # Generate draft from file
reach draft ./research/ --name teaser            # Generate draft from directory
reach adapt teaser --platforms x,devto           # Adapt for specific platforms
reach schedule teaser 2026-03-25T09:00           # Schedule with date+time (metadata only)
reach schedule teaser                            # Schedule for now (immediate)

reach draft "deep dive into architecture"        # Another article in same project
reach adapt deep-dive --platforms zhihu,wechat   # Different platforms
reach schedule deep-dive 2026-03-28              # Different schedule

reach publish                                    # Publish all due scheduled articles
reach publish teaser                             # Publish specific article (bypasses schedule)
reach publish teaser --force                     # Publish even if scheduled for a future date
reach schedule teaser --clear                    # Unschedule (revert to adapted status)
reach adapt teaser -p hashnode                   # Add hashnode (additive — keeps existing x, devto)
reach watch                                      # Daemon mode: auto-publish
reach analytics                                  # View publishing success metrics

# Publish an external file directly:
reach publish ./file.md -p devto                 # Publish external file to platform(s)
reach publish ./file.md -p devto --track         # Import to pipeline, then publish

# Or do it all in one shot (draft -> adapt -> publish):
reach go "write about apcore framework"                    # Full auto -> publish now
reach go "write about apcore" --name teaser                # Explicit article name
reach go "write about apcore framework" -s 2026-04-01      # Full auto -> schedule
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
- **Claude/Gemini**: Native support for the `MCP (Model Context Protocol)`, allowing LLMs to directly manipulate your content pipeline. MCP tools include `draft`, `adapt`, `schedule`, `publish`, `status`, and `go`.
- **Mobile Future**: File processing logic layers can be reused later via `React Native`.


## License

Apache-2.0
