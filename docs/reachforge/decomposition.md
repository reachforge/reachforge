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
| FEAT-003 | Project Lifecycle Management | P0       | Partial     | FEAT-001     | S      |
| FEAT-004 | AI Draft Generator (`draft`) | P0       | Implemented | FEAT-001     | M      |
| FEAT-005 | AI Platform Adapter (`adapt`)| P0       | Implemented | FEAT-001     | M      |
| FEAT-009 | Watcher Mode (basic)         | P1       | Basic exists | FEAT-001     | S      |
| FEAT-010 | MCP Server (basic)           | P2       | Basic exists | FEAT-001     | S      |

### Phase 2: Real Publishing (v0.2) — MVP TARGET

| ID       | Feature                              | Priority | Status         | Dependencies       | Effort |
|----------|--------------------------------------|----------|----------------|--------------------|--------|
| FEAT-011 | Provider Plugin Architecture         | P1       | Not started    | FEAT-001           | M      |
| FEAT-006 | Native Provider: Dev.to              | P0       | Not started    | FEAT-011           | M      |
| FEAT-007 | SaaS Bridge Provider: X via Postiz   | P0       | Not started    | FEAT-011           | M      |
| FEAT-012 | Content Quality Validation           | P1       | Not started    | FEAT-005           | S      |

### Phase 3: Platform Expansion (v0.3–v0.4)

| ID       | Feature                              | Priority | Status         | Dependencies       | Effort |
|----------|--------------------------------------|----------|----------------|--------------------|--------|
| FEAT-006b| Native Provider: Hashnode + GitHub   | P1       | Not started    | FEAT-011           | M      |
| FEAT-008 | Media Asset Manager                  | P1       | Not started    | FEAT-006, FEAT-007 | L      |
| FEAT-014 | Template System (AI Prompts)         | P2       | Not started    | FEAT-004, FEAT-005 | M      |
| FEAT-013 | Analytics & Receipts Dashboard       | P2       | Not started    | FEAT-006, FEAT-007 | S      |
| FEAT-009 | Watcher Mode v2 (Production-Ready)   | P1       | Basic exists   | FEAT-006, FEAT-007 | M      |

### Phase 4: Ecosystem & Distribution (v0.5+)

| ID       | Feature                              | Priority | Status         | Dependencies       | Effort |
|----------|--------------------------------------|----------|----------------|--------------------|--------|
| FEAT-010 | MCP Server (Full Integration)        | P2       | Basic exists   | FEAT-011           | M      |
| FEAT-015 | VS Code Extension                    | P2       | Not started    | FEAT-010           | L      |

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

## Critical Path (MVP)

The shortest path to a working MVP (v0.2) that validates the hybrid publishing strategy:

```
FEAT-001 (done) → FEAT-011 (Provider Architecture)
                     ├── FEAT-006 (Dev.to Native)
                     └── FEAT-007 (X via Postiz Bridge)
```

**Rationale**: FEAT-011 (Provider Plugin Architecture) is the **key enabler** for Phase 2. It must be built first to establish the provider interface that FEAT-006 and FEAT-007 implement. Without it, each provider would be hardcoded, creating technical debt before v0.3.

---

## Execution Order

Recommended implementation sequence considering dependencies and value delivery:

### Sprint 1: Provider Foundation
1. **FEAT-011** — Provider Plugin Architecture (interface, discovery, config loading)
2. **FEAT-003** — Complete Project Lifecycle Management (rollback, metadata updates)

### Sprint 2: Real Publishing
3. **FEAT-006** — Dev.to Native Provider (validates native API path)
4. **FEAT-007** — X via Postiz Bridge (validates SaaS bridge path)

### Sprint 3: Quality & Polish
5. **FEAT-012** — Content Quality Validation (pre-publish checks)
6. **FEAT-009 v2** — Production-ready Watcher Mode (logging, graceful shutdown)

### Sprint 4: Platform Expansion
7. **FEAT-006b** — Hashnode + GitHub providers
8. **FEAT-008** — Media Asset Manager

### Sprint 5: Intelligence & Ecosystem
9. **FEAT-014** — Template System for AI prompts
10. **FEAT-013** — Analytics Dashboard
11. **FEAT-010** — Full MCP Server integration

### Sprint 6: Distribution
12. **FEAT-015** — VS Code Extension

---

## Effort Legend

| Size | Estimate        | Description                           |
|------|-----------------|---------------------------------------|
| S    | 1-2 days        | Single module, limited scope          |
| M    | 3-5 days        | Multiple modules, API integration     |
| L    | 1-2 weeks       | Complex system, multiple integrations |

---

## Notes

1. **Phase 1 features (FEAT-001 through FEAT-005) are already implemented** in `src/index.ts`. The decomposition focuses on what remains to be built.
2. **FEAT-011 is promoted to Sprint 1** despite being P1 in the PRD, because it's an architectural prerequisite for all publishing features.
3. **FEAT-009 and FEAT-010 have basic implementations** that need hardening for production use.
4. **Code refactoring** (splitting `src/index.ts` into modules) should happen during FEAT-011 implementation as a natural part of establishing the provider architecture.

---

*Next steps: Run `/spec-forge:tech-design` to generate technical design for each feature, or `/spec-forge:srs` to formalize requirements with traceability.*
