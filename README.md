<div align="center">
  <img src="https://raw.githubusercontent.com/reachforge/reachforge/main/reachforge-logo.svg" alt="reachforge logo" width="200"/>
</div>


# ReachForge (`reach`)

> **ReachForge: The Social Influence Engine for AI-Native Content.**

**ReachForge** is an **AI-native Social Influence Engine** for end-users. It adopts a "File-as-State" design philosophy, transforming inspiration fragments into multi-platform viral assets through a lightweight three-stage pipeline.

Built on the [apcore](https://github.com/aiperceivable/apcore-typescript) ecosystem — `apcore-js` for module registration, `apcore-mcp` for AI agent integration, `apcore-cli` for CLI generation.

## Core Design Philosophy
- **File-as-State**: No database required. Flat `.md` files flow through 3 pipeline stages. A single `meta.yaml` at project root tracks all article states.
- **Multi-Article Projects**: One project holds multiple articles, each independently targeting different platforms and schedules.
- **Bun Driven**: Extreme execution efficiency and single-file binary distribution, perfectly suited for CLI and desktop environments.
- **Hybrid Publishing Strategy**: Supports direct local API publishing and SaaS-bridged (e.g., Postiz) publishing.
- **AI Adapter Pattern**: Automatically rewrites the draft into optimal versions for different platforms via LLM.
- **apcore Ecosystem**: Single module registration powers both CLI commands and MCP tools — 27 modules auto-wired.

## Pipeline (01-03) + Assets

Each project contains 3 stage directories. Articles are flat `.md` files that move between stages:

| Stage | Files | Description |
|-------|-------|-------------|
| `01_drafts` | `{article}.md` | AI-generated drafts from prompt, file, or directory input |
| `02_adapted` | `{article}.{platform}.md` | Platform-specific versions (e.g., `teaser.x.md`, `teaser.devto.md`) |
| `03_published` | `{article}.{platform}.md` | Published archive (results in `meta.yaml`) |
| `assets/` | images, videos, audio | Shared asset library — referenced via `@assets/` prefix |

## Supported Platforms

| Platform | Type | Auth | Format |
|----------|------|------|--------|
| **Dev.to** | Blog | API key | Markdown |
| **Hashnode** | Blog | PAT + Publication ID | Markdown |
| **Ghost** | Self-hosted CMS | Admin API key (JWT) | HTML |
| **WordPress** | Self-hosted (5.6+) | Application Password | HTML |
| **Telegraph** | Instant publishing | Access token | Node JSON |
| **Write.as** | Minimalist blog | Access token | Markdown |
| **Reddit** | Community | OAuth password grant | Markdown |
| **GitHub Discussions** | Developer community | PAT | Markdown |
| **X/Twitter** | Social (via Postiz) | API key | Plain text |

Platform IDs: `devto`, `hashnode`, `ghost`, `wordpress`, `telegraph`, `writeas`, `reddit`, `github`, `x`, `wechat`, `zhihu`, `linkedin`, `medium`

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

# Platform API keys — only for the platforms you publish to
# devto_api_key: your-key
# hashnode_api_key: your-key
# hashnode_publication_id: your-id
# ghost_url: https://myblog.com
# ghost_admin_api_key: "key_id:secret"
# wordpress_url: https://mysite.com
# wordpress_username: admin
# wordpress_app_password: "xxxx xxxx xxxx xxxx"
# telegraph_access_token: your-token
# writeas_access_token: your-token
# reddit_client_id: your-id
# reddit_client_secret: your-secret
# reddit_username: your-username
# reddit_password: your-password
# reddit_subreddit: programming
# github_token: your-token
# github_owner: your-username
# github_repo: your-repo
# postiz_api_key: your-key
```

### What needs configuration and when

| Task | Required Configuration | Without it |
|------|----------------------|------------|
| `reach draft` / `reach adapt` | None (uses local CLI) | Just install & auth the CLI (`claude`, `gemini`, or `codex`) |
| Publish to **Dev.to** | `devto_api_key` | Falls back to mock mode |
| Publish to **Hashnode** | `hashnode_api_key` + `hashnode_publication_id` | Falls back to mock mode |
| Publish to **Ghost** | `ghost_url` + `ghost_admin_api_key` | Falls back to mock mode |
| Publish to **WordPress** | `wordpress_url` + `wordpress_username` + `wordpress_app_password` | Falls back to mock mode |
| Publish to **Telegraph** | `telegraph_access_token` | Falls back to mock mode |
| Publish to **Write.as** | `writeas_access_token` | Falls back to mock mode |
| Publish to **Reddit** | `reddit_client_id` + `reddit_client_secret` + `reddit_username` + `reddit_password` | Falls back to mock mode |
| Publish to **GitHub** | `github_token` + `github_owner` + `github_repo` | Falls back to mock mode |
| Publish to **X/Twitter** | `postiz_api_key` | Falls back to mock mode |

> **Important:** When a platform API key is missing, `reach publish` silently uses a mock provider. Use `reach platforms` to check which platforms are configured.

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

# Pipeline workflow
reach status                                     # View pipeline dashboard
reach draft "write a teaser about our launch"    # Generate draft from prompt
reach adapt teaser --platforms devto,hashnode     # Adapt for platforms
reach schedule teaser 2026-03-25T09:00           # Schedule with date+time
reach publish                                    # Publish all due articles
reach update teaser                              # Update already-published article

# Cover image support
reach publish ./file.md -p devto --cover ./cover.png
reach draft "my article" --cover https://example.com/cover.jpg

# Publish external files directly
reach publish ./file.md -p devto                 # Direct publish
reach publish ./file.md -p devto --track         # Import to pipeline, then publish

# One-shot (draft → adapt → publish)
reach go "write about apcore framework"
reach go "write about apcore" --name teaser -s 2026-04-01
```

### Series Management

Manage multi-article campaigns with gate-controlled quality:

```bash
reach series init "deep dive into apcore"           # Scaffold series.yaml
reach series outline apcore-deep-dive                # AI-generate master outline
reach series approve apcore-deep-dive --outline      # Gate 1: approve outline
reach series detail apcore-deep-dive                 # AI-generate per-article outlines
reach series approve apcore-deep-dive --detail       # Gate 2: approve outlines
reach series draft apcore-deep-dive --all            # Draft all articles with context
reach series adapt apcore-deep-dive                  # Batch adapt
reach series schedule apcore-deep-dive               # Auto-calculate publish dates
reach series status apcore-deep-dive                 # Progress dashboard
```

## Development

**ReachForge** recommends using [Bun](https://bun.sh/) for extreme performance and a single-file distribution experience.

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Type check
bun run lint
```

### Running in Development

```bash
bun dev status                    # bun run src/index.ts status
bun dev watch --all               # bun run src/index.ts watch --all
bun dev publish --dry-run         # bun run src/index.ts publish --dry-run
```

### Building & Using the Binary

```bash
# Build for current platform (includes man page generation)
bun run build                     # outputs: bin/reach + bin/reach.1

# Run the compiled binary
./bin/reach status

# Install globally
sudo ln -sf "$PWD/bin/reach" /usr/local/bin/reach
reach status                      # now works anywhere
```

### Cross-compilation

```bash
bun run build:macos               # bin/reach-macos  (macOS ARM)
bun run build:win                 # bin/reach.exe    (Windows x64)
```

## Integrations

- **MCP Server**: `reach mcp` exposes all 27 commands as MCP tools for AI agent integration (Claude, Cursor, etc.)
- **VSCode Extension**: Core logic compatible with VSCode Extension via Sidecar binary invocation.
- **apcore Ecosystem**: Built on `apcore-js` (module registry), `apcore-mcp` (MCP bridge), `apcore-cli` (CLI generation).

## Documentation

Full documentation available at the [docs site](https://aiperceivable.github.io/reachforge) or in the `docs/` directory:

- [User Manual](docs/user-manual.md)
- [PRD](docs/reachforge/prd.md) | [SRS](docs/reachforge/srs.md) | [Tech Design](docs/reachforge/tech-design.md)
- [Feature Specs](docs/features/overview.md)

## License

Apache-2.0
