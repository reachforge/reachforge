# Project Manifest: reachforge (Social Influence Engine)

## Project Overview
`reach` is an AI-native engine designed to transform raw ideas into multi-platform social media assets using a file-based pipeline.

## Feature Manifest

### Core Orchestration — COMPLETE
- **[FEAT-001] File-Based Pipeline Core**: 6-stage directory state machine (01_inbox → 06_sent). ✅
- **[FEAT-002] CLI Dashboard (`status`)**: Real-time WIP tracking and due-today reminders. ✅
- **[FEAT-003] Project Lifecycle Management**: Move, rollback, approve, schedule across stages. ✅

### Content Intelligence — COMPLETE
- **[FEAT-004] AI Draft Generator (`draft`)**: CLI adapter layer (Claude/Gemini/Codex) with skill injection. ✅
- **[FEAT-005] AI Platform Adapter (`adapt`)**: Parallel adaptation for X, WeChat, Zhihu, Dev.to, Hashnode. ✅
- **[FEAT-EXT] Refine Command**: Interactive multi-turn LLM refinement with session persistence. ✅

### Publishing & Plugins — COMPLETE
- **[FEAT-011] Provider Plugin Architecture**: PlatformProvider interface, ProviderLoader, mock fallback. ✅
- **[FEAT-006] Native Providers**: Dev.to (REST), Hashnode (GraphQL), GitHub Discussions (GraphQL). ✅
- **[FEAT-007] SaaS Bridge Provider**: X/Twitter via Postiz with thread support. ✅
- **[FEAT-012] Content Validation**: Platform-specific pre-publish checks (char limits, frontmatter, headings). ✅
- **[FEAT-008] Media Asset Manager**: Image detection, CDN upload (Dev.to/Hashnode/GitHub), upload cache, `@assets/` references. ✅

### Automation & Ecosystem — COMPLETE
- **[FEAT-009] Watcher Mode (`watch`)**: Polling daemon with graceful shutdown. ✅
- **[FEAT-010] MCP Server**: 9 tools via stdio/SSE transports with Zod validation. ✅
- **[FEAT-EXT] Workspace Management**: Multi-project workspaces with auto-discovery. ✅

### Intelligence & Analytics — COMPLETE
- **[FEAT-013] Analytics Dashboard**: `reach analytics` with `--from`/`--to` date filtering, per-platform success rates. ✅
- **[FEAT-014] Template System**: 2-layer template resolution (project > workspace), variable interpolation, per-article override via `meta.yaml`. ✅

### Future
- **[FEAT-015] VS Code Extension**: Separate repository (`reachforge-vscode`). Not started.

## Technical Architecture
- **Runtime**: Bun (single-file binary, cross-platform)
- **Language**: TypeScript
- **State**: File system (directory = state, YAML = metadata)
- **LLM**: CLI adapter layer (Claude, Gemini, Codex) — no API keys needed
- **Security**: Local `.env` + `credentials.yaml` + `apcore` encryption
- **Tests**: 512 tests (unit + integration + e2e)
