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

### 1. Initialize & Configure

```bash
reach init                        # Creates ~/.reach/config.yaml
```

Edit `~/.reach/config.yaml` to add API keys for your publishing platforms:

```yaml
# ~/.reach/config.yaml — add only the platforms you use
devto_api_key: your-key
hashnode_api_key: your-key
hashnode_publication_id: your-id
# ghost_url: https://myblog.com
# ghost_admin_api_key: "key_id:secret"
# wordpress_url: https://mysite.com
# wordpress_username: admin
# wordpress_app_password: "xxxx xxxx xxxx xxxx"
```

Check what's configured:

```bash
reach platforms                   # Shows which platforms have API keys
```

### 2. Publish

```bash
# Publish a markdown file directly
reach publish --article ./my-article.md --platforms devto
reach publish --article ./my-article.md --platforms devto,hashnode
reach publish --article ./my-article.md --platforms devto --cover ./cover.png
```

That's it. Write markdown, publish to any platform. No project setup needed.

### Platform Configuration Reference

| Platform | Required Keys |
|----------|--------------|
| **Dev.to** | `devto_api_key` |
| **Hashnode** | `hashnode_api_key` + `hashnode_publication_id` |
| **Ghost** | `ghost_url` + `ghost_admin_api_key` |
| **WordPress** | `wordpress_url` + `wordpress_username` + `wordpress_app_password` |
| **Telegraph** | `telegraph_access_token` |
| **Write.as** | `writeas_access_token` |
| **Reddit** | `reddit_client_id` + `reddit_client_secret` + `reddit_username` + `reddit_password` |
| **GitHub** | `github_token` + `github_owner` + `github_repo` |
| **X/Twitter** | `postiz_api_key` |

> Missing API key? `reach publish` falls back to mock mode — no error, but nothing posted. Use `reach platforms` to verify.

**Config precedence**: Environment variables > workspace `.reach/config.yaml` > global `~/.reach/config.yaml`

## Advanced: AI Pipeline

For AI-powered content generation, install an LLM CLI (Claude, Gemini, or Codex), then use the full pipeline:

```bash
# Create a workspace & project
reach init --path ~/reach-workspace && cd ~/reach-workspace
reach new --name my-project && cd my-project

# AI pipeline: draft → adapt → publish
reach draft --source "write about API standardization"       # AI generates draft
reach adapt --article my-article --platforms devto,hashnode   # AI adapts for platforms
reach publish --article my-article                           # Publish to all adapted platforms
reach update --article my-article                            # Update after edits

# Or one-shot
reach go --prompt "write about apcore framework"             # Draft → adapt → publish
reach go --prompt "write about apcore" --schedule 2026-04-01  # With scheduled date
```

### Series Management

Multi-article campaigns with gate-controlled quality:

```bash
reach series init --topic "deep dive into apcore"              # Scaffold series
reach series outline --name apcore-deep-dive                   # AI-generate master outline
reach series approve --name apcore-deep-dive --outline         # Approve outline
reach series detail --name apcore-deep-dive                    # AI-generate per-article outlines
reach series approve --name apcore-deep-dive --detail          # Approve outlines
reach series draft --name apcore-deep-dive --all               # Draft all articles
reach series adapt --name apcore-deep-dive --platforms devto    # Batch adapt
reach series schedule --name apcore-deep-dive                  # Auto-schedule
reach series status --name apcore-deep-dive                    # Progress dashboard
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

Full documentation available at the [docs site](https://reachforge.github.io/reachforge) or in the `docs/` directory:

- [User Manual](docs/user-manual.md)
- [PRD](docs/reachforge/prd.md) | [SRS](docs/reachforge/srs.md) | [Tech Design](docs/reachforge/tech-design.md)
- [Feature Specs](docs/features/overview.md)

## License

Apache-2.0
