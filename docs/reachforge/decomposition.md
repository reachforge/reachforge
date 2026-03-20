# Project Decomposition: reachforge

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Source**   | [reachforge PRD v1.0](prd.md)                 |
| **Date**     | 2026-03-14                                 |
| **Type**     | Multi-feature project                      |
| **Features** | 16 sub-features across 4 phases            |

---

## Decomposition Verdict

**Multi-split project.** reachforge comprises 16 distinct features that span four development phases. Features have clear dependency chains — publishing (FEAT-006/007) depends on the pipeline core (FEAT-001), the provider plugin architecture (FEAT-011) should be built before expanding providers (FEAT-006b), and media management (FEAT-008) is a prerequisite for full platform support.

---

## Feature Manifest

### Phase 1: Foundation (v0.1) — COMPLETE

| ID       | Feature                      | Priority | Status      | Dependencies | Effort |
|----------|------------------------------|----------|-------------|--------------|--------|
| FEAT-001 | File-Based Pipeline Core     | P0       | Implemented | None         | S      |
| FEAT-002 | CLI Dashboard (`status`)     | P0       | Implemented | FEAT-001     | S      |
| FEAT-003 | Project Lifecycle Management | P0       | Implemented | FEAT-001     | S      |
| FEAT-004 | AI Draft Generator (`draft`) | P0       | Implemented | FEAT-001     | M      |
| FEAT-005 | AI Platform Adapter (`adapt`)| P0       | Implemented | FEAT-001     | M      |

### Phase 2: Real Publishing (v0.2) — COMPLETE

| ID       | Feature                              | Priority | Status      | Dependencies       | Effort |
|----------|--------------------------------------|----------|-------------|--------------------|--------|
| FEAT-011 | Provider Plugin Architecture         | P1       | Implemented | FEAT-001           | M      |
| FEAT-006 | Native Provider: Dev.to              | P0       | Implemented | FEAT-011           | M      |
| FEAT-007 | SaaS Bridge Provider: X via Postiz   | P0       | Implemented | FEAT-011           | M      |
| FEAT-012 | Content Quality Validation           | P1       | Implemented | FEAT-005           | S      |

### Phase 3: Platform Expansion (v0.3–v0.4) — COMPLETE

| ID       | Feature                              | Priority | Status      | Dependencies       | Effort |
|----------|--------------------------------------|----------|-------------|--------------------|--------|
| FEAT-006b| Native Provider: Hashnode + GitHub   | P1       | Implemented | FEAT-011           | M      |
| FEAT-008 | Media Asset Manager                  | P1       | Implemented | FEAT-006, FEAT-007 | L      |
| FEAT-009 | Watcher Mode v2 (Production-Ready)   | P1       | Implemented | FEAT-006, FEAT-007 | M      |
| FEAT-014 | Template System (AI Prompts)         | P2       | Implemented | FEAT-004, FEAT-005 | M      |
| FEAT-013 | Analytics & Receipts Dashboard       | P2       | Implemented | FEAT-006, FEAT-007 | S      |

### Phase 4: Ecosystem & Distribution (v0.5+)

| ID       | Feature                              | Priority | Status      | Dependencies       | Effort |
|----------|--------------------------------------|----------|-------------|--------------------|--------|
| FEAT-010 | MCP Server (Full Integration)        | P2       | Implemented | FEAT-011           | M      |
| FEAT-015 | VS Code Extension                    | P2       | Out of scope | FEAT-010           | L      |

> **Note on FEAT-015**: VS Code Extension will be implemented in a separate repository (`reachforge-vscode`), not in this CLI codebase.

### Additional Features (not in original PRD)

The following features were added during development to improve the workflow:

| ID       | Feature                              | Status      | Dependencies       |
|----------|--------------------------------------|-------------|--------------------|
| FEAT-EXT-001 | CLI Adapter Layer (Claude/Gemini/Codex) | Implemented | FEAT-004       |
| FEAT-EXT-002 | Session Manager (multi-turn LLM)    | Implemented | FEAT-EXT-001       |
| FEAT-EXT-003 | Skill Resolver (3-layer cascade)    | Implemented | FEAT-EXT-001       |
| FEAT-EXT-004 | Refine Command (interactive)        | Implemented | FEAT-EXT-001/002/003 |
| FEAT-EXT-005 | Approve Command (draft → master)    | Implemented | FEAT-001           |
| FEAT-EXT-006 | Asset Library (@assets/ + registry) | Implemented | FEAT-008           |
| FEAT-EXT-007 | Workspace Management (multi-project)| Implemented | FEAT-001           |

---

## Dependency Graph

```
FEAT-001 (Pipeline Core) ─────────────────────────────────────┐
  ├── FEAT-002 (Dashboard)                                    │
  ├── FEAT-003 (Lifecycle Mgmt)                               │
  ├── FEAT-004 (AI Draft) ──── FEAT-014 (Template System)     │
  ├── FEAT-005 (AI Adapter) ── FEAT-012 (Validation)          │
  │                             FEAT-014 (Template System)     │
  └── FEAT-011 (Plugin Arch) ─────────────────────────────────┤
        ├── FEAT-006 (Dev.to) ─┬── FEAT-008 (Media Mgr)      │
        ├── FEAT-007 (X/Postiz)┤   FEAT-013 (Analytics)       │
        ├── FEAT-006b (Hashnode/GitHub)                        │
        │                      └── FEAT-009 v2 (Watcher)      │
        └── FEAT-010 (MCP Full) ── FEAT-015 (VS Code Ext)     │
```

---

## Critical Path (MVP) — ACHIEVED

The MVP critical path has been completed:

```
FEAT-001 (done) → FEAT-011 (done) → FEAT-006 (done) + FEAT-007 (done)
```

All P0 and P1 features are implemented. The remaining work is P2 (analytics, templates).

---

## Execution History

### Sprint 1–4: COMPLETE
All P0/P1 features implemented: Pipeline Core, CLI Dashboard, Lifecycle, Draft, Adapt, Provider Architecture, Dev.to, Postiz, Validation, Hashnode, GitHub, Media Manager, Watcher, MCP Server, plus additional features (CLI Adapters, Refine, Approve, Assets, Workspace).

### Sprint 5: COMPLETE
9. **FEAT-014** — Template System for AI prompts
10. **FEAT-013** — Analytics Dashboard

### Future
11. **FEAT-015** — VS Code Extension (separate repo: `reachforge-vscode`)

---

## Effort Legend

| Size | Estimate        | Description                           |
|------|-----------------|---------------------------------------|
| S    | 1-2 days        | Single module, limited scope          |
| M    | 3-5 days        | Multiple modules, API integration     |
| L    | 1-2 weeks       | Complex system, multiple integrations |

---

## Notes

1. **All P0/P1 features are implemented.** The monolithic `src/index.ts` has been refactored into a modular architecture with `core/`, `commands/`, `providers/`, `validators/`, `llm/`, `mcp/`, `utils/`, and `types/` directories.
2. **The CLI adapter layer** (Claude/Gemini/Codex) replaced the direct GeminiProvider, enabling multi-LLM support with session persistence and skill injection.
3. **Media asset management** includes both an asset registry (`@assets/` references) and CDN upload integration for Dev.to, Hashnode, and GitHub during publishing.
4. **FEAT-015 (VS Code Extension)** will be built in a separate `reachforge-vscode` repository to keep the CLI codebase focused.
