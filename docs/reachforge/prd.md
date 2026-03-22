# Product Requirements Document: reachforge

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Document** | reachforge PRD v1.0                            |
| **Author**   | aiperceivable Product Team                   |
| **Date**     | 2026-03-14                                 |
| **Status**   | Draft                                      |
| **Version**  | 1.0                                        |

---

## 1. Executive Summary

Today, independent developers and content creators face a fragmented, manual workflow when distributing content across platforms. A single blog post destined for Dev.to, X (Twitter), and WeChat requires separate rewrites, separate logins, separate formatting, and separate scheduling. The result: creators either under-distribute (limiting reach) or spend hours on repetitive adaptation work that adds no creative value.

**reachforge** is an AI-native Social Influence Engine that eliminates this friction. It transforms a single raw idea into platform-optimized, publication-ready assets through a six-stage file-based pipeline. Users drop an idea into an inbox folder; AI generates a long-form draft; AI adapts that draft for each target platform; the user schedules it; and reach publishes automatically via direct APIs or SaaS bridges. No database, no complex setup --- directories are states, filenames are timestamps, YAML files are metadata.

reachforge is part of the **aiperceivable** ecosystem (alongside apcore and apflow), designed for developers who think in files and terminals. The MVP targets two publishing paths --- native API integration with Dev.to and SaaS-bridged publishing to X via Postiz --- to validate the hybrid distribution architecture before expanding to additional platforms.

---

## 2. Problem Statement

### The Content Distribution Tax

Independent developers and tech bloggers produce valuable content but face a "distribution tax" that scales linearly with every platform they target:

1. **Manual adaptation is time-consuming.** Reformatting a 2,000-word blog post into an X thread, a WeChat article, and a Zhihu answer takes 45-90 minutes per platform (assumption based on creator workflow surveys and anecdotal reports from developer communities).

2. **Platform-specific publishing is fragmented.** Each platform has its own dashboard, editor, formatting rules, and API quirks. There is no unified workflow for multi-platform publishing that works natively from the terminal.

3. **Existing tools are SaaS-first, not developer-first.** Buffer, Hootsuite, and ContentStudio target marketing teams with web dashboards. They do not fit the workflow of a developer who lives in VS Code, uses Git, and prefers CLIs over GUIs.

4. **AI-assisted content tools lack distribution.** ChatGPT and Claude can help write content, but the user must still manually copy, paste, format, and publish to each platform.

5. **No single tool combines AI generation, multi-platform adaptation, and automated publishing** in a file-based, CLI-native workflow. This gap means developers either accept limited reach or accept the distribution tax.

### Evidence of Pain

- Dev.to has 1M+ registered developers; most cross-post manually to personal blogs and social media.
- The "content repurposing" category has seen rapid growth in tools like Typefully, Repurpose.io, and ContentStudio, indicating market demand.
- Developer-focused distribution tools (terminal-native, file-based) are effectively nonexistent. The closest alternatives are general-purpose social media schedulers that require browser-based workflows.

---

## 3. Target Users & Personas

### Persona 1: Alex --- The Indie Dev Blogger

| Attribute         | Detail                                                        |
|-------------------|---------------------------------------------------------------|
| **Role**          | Full-stack developer, solo content creator                    |
| **Goal**          | Maximize reach for technical blog posts with minimal effort   |
| **Platforms**     | Dev.to, personal blog, X, occasionally Hashnode              |
| **Current Flow**  | Writes in VS Code, publishes to Dev.to manually, copies excerpts to X by hand |
| **Pain Points**   | Spends 30+ min per post on cross-platform formatting; forgets to post to X; has no scheduling system |
| **Tech Comfort**  | High --- uses CLI daily, comfortable with YAML, config files  |
| **Desired State** | Write once, auto-distribute everywhere from the terminal      |

### Persona 2: Mei --- The Bilingual Tech Creator

| Attribute         | Detail                                                        |
|-------------------|---------------------------------------------------------------|
| **Role**          | Developer advocate at a startup, publishes in English and Chinese |
| **Goal**          | Maintain presence on both Western and Chinese platforms        |
| **Platforms**     | Dev.to, X, WeChat Official Account, Zhihu                    |
| **Current Flow**  | Writes master article in English, manually translates/adapts for Chinese platforms |
| **Pain Points**   | Each platform has different tone, length, and formatting requirements; Chinese platform APIs are poorly documented |
| **Tech Comfort**  | High --- uses Bun, familiar with MCP protocol                 |
| **Desired State** | AI handles cross-platform and cross-language adaptation; publish from one pipeline |

### Persona 3: Jordan --- The Content-First Creator

| Attribute         | Detail                                                        |
|-------------------|---------------------------------------------------------------|
| **Role**          | Tech YouTuber / newsletter writer expanding to social media   |
| **Goal**          | Repurpose long-form content into platform-native social posts |
| **Platforms**     | X, Instagram (aspirational), LinkedIn                         |
| **Current Flow**  | Uses Buffer for scheduling, but writes everything manually    |
| **Pain Points**   | Buffer does not generate content; AI tools do not publish; no unified tool does both |
| **Tech Comfort**  | Medium --- can use CLI but prefers GUI; open to MCP integration with Claude |
| **Desired State** | Drop a transcript or outline, get ready-to-publish social content for multiple platforms |

---

## 4. Market Context

The content distribution tool landscape can be segmented into three categories:

### Social Media Schedulers (Established)
Tools like **Buffer**, **Hootsuite**, and **Sprout Social** focus on scheduling and analytics for social media managers. They are web-based, team-oriented, and priced for businesses ($15-100+/month). They do not generate content or adapt it across platforms.

### AI Content Repurposing Tools (Emerging)
Tools like **Repurpose.io**, **ContentStudio**, and **Castmagic** focus on transforming content between formats (video to blog, podcast to social posts). They are SaaS products targeting creators, typically $20-50/month.

### Developer-Native Publishing Tools (Niche)
**Typefully** focuses on X/Twitter with a drafting-optimized UI. **Postiz** (open source) provides a self-hostable social media scheduler with API integrations. Neither offers AI content generation or file-based workflows.

### The Gap
No existing tool combines: (a) AI-powered content generation and adaptation, (b) multi-platform publishing via hybrid native + SaaS APIs, (c) a file-based, CLI-native, developer-friendly workflow, and (d) integration with the AI agent ecosystem via MCP. This is the space reachforge occupies.

---

## 5. Competitive Analysis

| Capability                       | Buffer      | Typefully   | Postiz (OSS) | ContentStudio | **reachforge**     |
|----------------------------------|-------------|-------------|---------------|---------------|----------------|
| Multi-platform scheduling        | Yes         | X only      | Yes           | Yes           | Yes            |
| AI content generation            | Limited     | No          | No            | Limited       | Core feature   |
| AI cross-platform adaptation     | No          | No          | No            | No            | Core feature   |
| CLI / terminal-native            | No          | No          | No            | No            | Yes            |
| File-based state (no DB)         | No          | No          | No            | No            | Yes            |
| MCP Server support               | No          | No          | No            | No            | Yes            |
| Self-hostable                    | No          | No          | Yes           | No            | Yes            |
| Dev.to / Hashnode native API     | No          | No          | Partial       | Partial       | Planned        |
| X publishing                    | Yes         | Yes         | Yes           | Yes           | Via Postiz     |
| Free tier available              | Yes (3 ch.) | Yes (1 acc.)| Yes (OSS)     | No            | Yes (OSS)      |
| Target audience                  | Marketers   | X creators  | SMB teams     | Marketers     | Developers     |

### reachforge Competitive Positioning

reachforge does not compete head-to-head with Buffer or Hootsuite. It occupies an adjacent niche: **developer-native, AI-first content distribution**. Its differentiation rests on three pillars:

1. **AI-native pipeline**: Content generation and adaptation are first-class operations, not bolt-on features.
2. **File-based architecture**: No database, no cloud dependency. Content is version-controllable, inspectable, and portable.
3. **MCP integration**: AI agents (Claude, Gemini) can directly operate the pipeline, enabling agentic workflows that no competitor supports.

---

## 6. Product Vision & Strategy

### North Star
**Any developer can go from idea to multi-platform publication in under 5 minutes, entirely from the terminal or through an AI agent.**

### Strategic Positioning within aiperceivable
- **apcore**: The foundational framework providing module registration, lifecycle management, and MCP server infrastructure.
- **apflow**: Workflow orchestration and task automation.
- **reachforge**: The user-facing content engine that leverages apcore for modularity and apflow for automation. reachforge is the flagship product that demonstrates the aiperceivable ecosystem's value.

### Strategy Phases
1. **Validate** (v0.2): Prove the pipeline works end-to-end with real publishing to Dev.to + X.
2. **Expand** (v0.3-0.4): Add platforms (Hashnode, GitHub, LinkedIn), improve AI quality, add media support.
3. **Automate** (v0.5+): Watcher daemon, MCP-driven agentic workflows, CI/CD integration.
4. **Distribute** (v1.0): VS Code extension, desktop app, potential SaaS offering.

---

## 7. Core Value Proposition

### Why reachforge vs. Alternatives

| Dimension               | reachforge Advantage                                                     |
|--------------------------|----------------------------------------------------------------------|
| **Workflow fit**         | CLI-native; works where developers already work                      |
| **AI integration**       | AI generates AND adapts content; competitors only schedule            |
| **Architecture**         | File-based = Git-friendly, inspectable, no vendor lock-in            |
| **Cost**                 | Open source core; only cost is LLM API usage (~$0.01-0.05/article)  |
| **Extensibility**        | apcore module system + MCP means AI agents can operate the pipeline  |

### Moat Analysis (Honest Assessment)
- **Weak moat**: The six-stage pipeline and CLI wrapper are straightforward to replicate. AI adaptation prompts can be copied.
- **Medium moat**: Integration with apcore/apflow ecosystem creates switching costs for users invested in aiperceivable. MCP server support creates value for AI agent users.
- **Potential moat**: If reachforge accumulates platform-specific prompt tuning, publishing heuristics, and a library of successful adaptation patterns, these become a knowledge moat. Community contributions to provider plugins would also strengthen defensibility.
- **Honest conclusion**: reachforge's moat is currently thin. The primary defense is execution speed and developer experience quality, not technological barriers.

---

## 8. User Stories & Use Cases

### US-001: First-Time Pipeline Run
> As Alex, I want to drop a markdown file into `01_inbox`, run three commands (`draft`, `adapt`, `publish`), and see my content live on Dev.to and X, so that I can validate the tool works end-to-end in under 10 minutes.

### US-002: Scheduled Multi-Platform Publish
> As Mei, I want to schedule an adapted article for next Tuesday and have reachforge automatically publish to all configured platforms on that date, so that I do not need to remember to publish manually.

### US-003: AI-Powered Adaptation
> As Jordan, I want to run `reach adapt my-article` and get platform-optimized versions (an X thread, a Dev.to article, a WeChat post) without writing any of them myself, so that I can focus on creating the original content.

### US-004: Dashboard Overview
> As Alex, I want to run `reach status` and see how many items are in each pipeline stage, which items are due for publishing today, so that I can manage my content queue at a glance.

### US-005: MCP Agent Integration
> As Mei, I want to connect reachforge to Claude Desktop via MCP, so that I can say "publish my latest article to all platforms" and have the AI agent operate the pipeline on my behalf.

### US-006: Publish to Dev.to via Native API
> As Alex, I want reachforge to publish directly to Dev.to using my API key, without any third-party SaaS intermediary, so that I have full control and zero cost.

### US-007: Publish to X via Postiz Bridge
> As Jordan, I want reachforge to publish to X through Postiz Cloud, so that I do not need to manage X OAuth credentials myself.

---

## 9. Feature Requirements

### P0 --- Must Have for MVP (v0.2)

#### FEAT-001: File-Based Pipeline Core
- **Description**: Six-directory state machine (`01_inbox` through `06_sent`). Directories are auto-created. Folder names are unique IDs. Metadata stored in `meta.yaml`.
- **Status**: Implemented.
- **Acceptance Criteria**:
  - Running any command auto-initializes the directory structure.
  - Files move forward through stages without data loss.
  - `meta.yaml` is created/updated at each stage transition.

#### FEAT-002: CLI Dashboard (`status`)
- **Description**: Visual overview of pipeline state --- item counts per stage, items due for publishing today.
- **Status**: Implemented (basic version).
- **Acceptance Criteria**:
  - Output shows all 6 stages with item counts.
  - Items due today are highlighted.
  - Runs in under 500ms for pipelines with up to 100 items.

#### FEAT-003: Project Lifecycle Management
- **Description**: Commands and logic to move projects between pipeline stages with proper renaming and metadata updates.
- **Status**: Partially implemented (schedule command exists).
- **Acceptance Criteria**:
  - `schedule` command validates date format, moves folder, prepends date.
  - Metadata is updated to reflect stage transitions.
  - Rollback is possible (move items backward in pipeline).

#### FEAT-004: AI Draft Generator (`draft`)
- **Description**: Reads raw material from `01_inbox`, calls Gemini to generate a long-form article, saves to `02_drafts`.
- **Status**: Implemented.
- **Acceptance Criteria**:
  - Supports both file and directory inputs in `01_inbox`.
  - Generated draft is saved as `draft.md` with accompanying `meta.yaml`.
  - Error handling for missing API key, empty input, API failures.

#### FEAT-005: AI Platform Adapter (`adapt`)
- **Description**: Reads master draft from `03_master`, generates platform-specific versions for X, WeChat, and Zhihu. Saves to `04_adapted/[article]/platform_versions/`.
- **Status**: Implemented (basic prompts).
- **Acceptance Criteria**:
  - Generates distinct, platform-appropriate content for each target.
  - X output is thread-formatted (under 280 chars per tweet).
  - Platform list is configurable via `meta.yaml` or CLI flags.
  - Existing adaptations are not overwritten without `--force` flag.

#### FEAT-006: Native Provider System (Dev.to)
- **Description**: Direct API integration to publish articles to Dev.to using API key authentication.
- **Status**: Not implemented (currently mock).
- **Acceptance Criteria**:
  - User configures Dev.to API key via `.env` or `credentials.yaml`.
  - `publish` command sends adapted content to Dev.to API.
  - Response includes the live URL, stored in `receipt.yaml`.
  - Handles API errors gracefully (rate limits, auth failures, validation errors).
  - Supports draft vs. published state on Dev.to.

#### FEAT-007: SaaS Bridge Provider (X via Postiz)
- **Description**: Integration with Postiz Cloud API to publish to X (Twitter), bypassing OAuth complexity.
- **Status**: Not implemented (currently mock).
- **Acceptance Criteria**:
  - User configures Postiz API key via `.env` or `credentials.yaml`.
  - `publish` command sends adapted X thread content to Postiz.
  - Response includes the live X post URL, stored in `receipt.yaml`.
  - Handles Postiz API errors and rate limits.

### P1 --- Important, Can Ship Without

#### FEAT-006b: Native Provider System (Hashnode, GitHub)
- **Description**: Extend native provider system to support Hashnode Articles API and GitHub Discussions/README publishing.
- **Acceptance Criteria**:
  - Hashnode: publish articles via GraphQL API with API key auth.
  - GitHub: create discussions or update repository files via GitHub API.
  - Provider selection is configurable per-article in `meta.yaml`.

#### FEAT-008: Media Asset Manager
- **Description**: Two-stage upload pipeline for images and media files. Stage 1: collect media references in content. Stage 2: upload to platform-specific CDNs and replace URLs.
- **Acceptance Criteria**:
  - Detects image references (`![alt](path)`) in adapted content.
  - Uploads local images to the target platform's image hosting.
  - Replaces local paths with CDN URLs before publishing.
  - Caches upload results in `.upload_cache.yaml` to avoid re-uploads.

#### FEAT-009: Watcher Mode (`watch`)
- **Description**: Background daemon that periodically checks `05_scheduled` for due items and auto-publishes them.
- **Status**: Implemented (basic interval-based check).
- **Acceptance Criteria**:
  - Configurable check interval (default: 60 minutes).
  - Runs as background process; logs to file.
  - Graceful shutdown on SIGTERM/SIGINT.
  - Does not re-publish already-sent items.

#### FEAT-011: Provider Plugin Architecture
- **Description**: Standardized interface for adding new platform providers. Each provider implements `validate()`, `publish()`, and `formatContent()` methods.
- **Acceptance Criteria**:
  - Provider interface is documented and typed (TypeScript interface).
  - New providers can be added without modifying core code.
  - Provider discovery via convention (`providers/[name].ts`).

#### FEAT-012: Content Quality Validation
- **Description**: Pre-publish checks that validate content meets platform requirements (character limits, image dimensions, required fields).
- **Acceptance Criteria**:
  - X posts validated for 280-char limit per tweet.
  - Dev.to articles validated for required frontmatter.
  - Validation runs automatically before `publish`; failures block publishing with actionable error messages.

### P2 --- Nice to Have / Future

#### FEAT-010: MCP Server Integration
- **Description**: Full MCP server exposing all pipeline operations as tools, enabling AI agents to operate reachforge.
- **Status**: Basic implementation exists (via apcore-mcp).
- **Acceptance Criteria**:
  - All 5 core operations (status, draft, adapt, schedule, publish) exposed as MCP tools.
  - Tool descriptions include parameter schemas (via Zod).
  - Compatible with Claude Desktop and other MCP clients.

#### FEAT-013: Analytics & Receipts Dashboard
- **Description**: Aggregate `receipt.yaml` data from `06_sent` to show publishing history, success rates, and platform-level metrics.
- **Acceptance Criteria**:
  - `reach analytics` command shows total publishes by platform, success/failure rates.
  - Supports date range filtering.

#### FEAT-014: Template System
- **Description**: User-definable prompt templates for draft generation and platform adaptation, enabling customization of AI output style and tone.
- **Acceptance Criteria**:
  - Templates stored in `templates/` directory as YAML files.
  - Users can specify template per-article in `meta.yaml`.
  - Default templates provided for each supported platform.

#### FEAT-015: VS Code Extension
- **Description**: Visual interface for the pipeline, leveraging the compiled binary via sidecar pattern.
- **Repository**: Implemented in separate `reachforge-vscode` repository (not in this CLI codebase).
- **Acceptance Criteria**:
  - Tree view showing pipeline stages and items.
  - One-click actions for draft, adapt, schedule, publish.
  - Live preview of adapted content.

---

## 10. Non-Functional Requirements

### Performance
- **NFR-001**: `reach status` must complete in under 500ms for pipelines containing up to 100 items.
- **NFR-002**: `reach draft` and `reach adapt` latency is bounded by LLM API response time (typically 5-30 seconds). The CLI must show progress indication during AI calls.
- **NFR-003**: `reach publish` must handle up to 10 simultaneous platform publications without failure.
- **NFR-004**: Compiled binary size must remain under 50MB.

### Security
- **NFR-005**: API keys (Gemini, Dev.to, Postiz) must never be committed to version control. Keys are stored in `.env` (gitignored) or `credentials.yaml` (gitignored).
- **NFR-006**: No telemetry or data collection. All content remains local to the user's filesystem.
- **NFR-007**: MCP server must validate tool inputs via Zod schemas to prevent injection.

### Compatibility
- **NFR-008**: Must run on macOS (ARM64), Linux (x64), and Windows (x64) via Bun compiled binaries.
- **NFR-009**: Must work with Bun >= 1.0 runtime.
- **NFR-010**: MCP server must be compatible with the MCP specification for stdio and SSE transports.

### Reliability
- **NFR-011**: Publishing failures must not cause data loss. Failed items remain in `05_scheduled` with error details appended to `meta.yaml`.
- **NFR-012**: All file operations must be idempotent. Re-running a command on already-processed content must not create duplicates.

---

## 11. Success Metrics & KPIs

### MVP Success Criteria (v0.2, target: 3 months post-start)

| Metric                                  | Target                  | Measurement Method                      |
|-----------------------------------------|-------------------------|-----------------------------------------|
| End-to-end pipeline completion rate     | >= 90%                  | Items that reach `06_sent` / items entering `01_inbox` |
| Time from idea to multi-platform publish| < 10 minutes            | Manual timing of full pipeline run      |
| Dev.to publish success rate             | >= 95%                  | `receipt.yaml` success entries          |
| X publish success rate (via Postiz)     | >= 90%                  | `receipt.yaml` success entries          |
| User can complete first run without docs| Yes                     | Usability test with 3 developers       |
| Total active pipelines (dogfooding)     | >= 20 articles          | Count of items in `06_sent`             |

### Growth Metrics (v0.3+)

| Metric                                  | Target                  |
|-----------------------------------------|-------------------------|
| GitHub stars                            | 100 in first 6 months   |
| Monthly active pipelines (community)    | 50 articles/month       |
| Number of supported platforms           | >= 5                    |
| Community-contributed providers          | >= 2                    |

---

## 12. "What If We Don't Build This?" Analysis

### If reachforge is not built:
1. **The aiperceivable ecosystem lacks a flagship user-facing product.** apcore and apflow are infrastructure; without reachforge, there is no demonstration of their value to end users.
2. **Developers continue with manual cross-posting.** The distribution tax persists. This is the status quo and is survivable --- people have lived with it for years.
3. **The MCP/agentic content workflow opportunity goes unexplored.** No existing tool provides MCP-based content pipeline control. This is a genuine first-mover opportunity in the AI agent ecosystem, but the window is time-limited as the MCP ecosystem matures.
4. **Competitors may fill the gap.** Postiz is open source and actively developed. If they add AI generation and adaptation features, the reachforge value proposition narrows significantly.

### Honest Assessment
reachforge solves a real but not urgent problem. Developers can and do cross-post manually. The tool's value is in saving 30-60 minutes per article and enabling an agentic workflow that does not yet exist elsewhere. The strongest argument for building it is strategic: it validates the aiperceivable ecosystem and establishes a presence in the AI-native developer tools space before competitors arrive.

---

## 13. Risks & Mitigations

| Risk                                         | Severity | Probability | Mitigation                                                       |
|----------------------------------------------|----------|-------------|------------------------------------------------------------------|
| **Gemini API changes or deprecation**        | High     | Low         | Abstract LLM calls behind provider interface; support multiple models (Gemini, Claude, local LLMs). |
| **Postiz API instability or shutdown**       | High     | Medium      | Postiz is the bridge for X; if it fails, X publishing breaks. Mitigation: implement native X OAuth as fallback (P1). |
| **Platform API breaking changes**            | Medium   | Medium      | Dev.to, Hashnode APIs may change. Mitigation: version-pin API calls, add integration tests. |
| **AI content quality insufficient for direct publishing** | Medium | Medium | Users may not trust AI-adapted content without review. Mitigation: always default to "draft" mode on platforms; add content validation (FEAT-012). |
| **Single-file architecture does not scale**  | Medium   | High        | `src/index.ts` at 290 lines is manageable now but will grow. Mitigation: refactor to modular architecture before v0.3 (providers/, commands/, core/ directories). |
| **Low adoption due to niche audience**       | Medium   | Medium      | Developer-native CLI tools have small markets. Mitigation: MCP integration broadens audience to all AI agent users; VS Code extension (P2) lowers barrier to entry. |
| **OAuth complexity for native X integration**| Low      | High        | X OAuth 2.0 is notoriously complex for CLI apps. Mitigation: use Postiz bridge (FEAT-007) as primary path; defer native X OAuth. |

---

## 14. Phased Rollout Plan

### Phase 1: Foundation (v0.1 --- Complete)
- File-based pipeline core (FEAT-001)
- CLI dashboard (FEAT-002)
- Project lifecycle management (FEAT-003)
- AI draft generation (FEAT-004)
- AI platform adaptation (FEAT-005)
- Basic watcher mode (FEAT-009)
- Basic MCP server (FEAT-010)

### Phase 2: Real Publishing (v0.2 --- MVP Target)
- Dev.to native provider (FEAT-006)
- X via Postiz bridge (FEAT-007)
- Content quality validation (FEAT-012)
- Refactor to modular provider architecture (FEAT-011)
- Improved error handling and `receipt.yaml` with real URLs
- End-to-end integration testing

### Phase 3: Platform Expansion (v0.3-v0.4)
- Hashnode and GitHub native providers (FEAT-006b)
- Media asset manager (FEAT-008)
- Template system for AI prompts (FEAT-014)
- Analytics dashboard (FEAT-013)
- Enhanced watcher mode with logging and graceful shutdown (FEAT-009 v2)

### Phase 4: Ecosystem & Distribution (v0.5+)
- Full MCP server with rich tool descriptions (FEAT-010 v2)
- VS Code extension (FEAT-015)
- Multi-LLM support (Claude, local models)
- Community provider plugin ecosystem
- Potential SaaS offering evaluation

---

## 15. Open Questions

| #  | Question                                                                                         | Owner        | Status |
|----|--------------------------------------------------------------------------------------------------|--------------|--------|
| 1  | Should reachforge support user-editable AI prompts in v0.2, or defer to v0.3 (template system)?     | Product      | Open   |
| 2  | What is the Postiz Cloud API pricing model, and does it have rate limits that affect our publish throughput? | Engineering  | Open   |
| 3  | Should `03_master` require explicit user sign-off (e.g., a flag in `meta.yaml`), or is moving the file sufficient? | Product      | Open   |
| 4  | How should credentials be managed --- `.env` only, or also support `credentials.yaml` with encryption via apcore? | Engineering  | Open   |
| 5  | Is the current single-file architecture (`src/index.ts`) acceptable for v0.2, or must refactoring happen first? | Engineering  | Open   |
| 6  | Should reach publish content as "draft" by default on platforms that support it (Dev.to), requiring manual approval? | Product      | Open   |
| 7  | What is the commercialization strategy? Open-source core + premium features? SaaS? Or pure open-source? | Business     | Open (deliberately deferred) |
| 8  | Should the Python-era artifacts (`pyproject.toml`, `scripts/adapt.py`) be removed or archived before v0.2? | Engineering  | Open   |
| 9  | What is the minimum set of platforms needed for the tool to be compelling to the target audience? | Product      | Open   |
| 10 | How should reachforge handle content that fails AI adaptation for one platform but succeeds for others? | Engineering  | Open   |

---

*This document should be reviewed and updated as decisions are made on open questions. Next review target: before v0.2 development begins.*
