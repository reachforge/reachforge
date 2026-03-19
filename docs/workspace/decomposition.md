# Feature Decomposition: Workspace + Multi-Project

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Source**   | [Idea Draft](../../ideas/workspace/draft.md) |
| **Date**     | 2026-03-16                                 |
| **Type**     | Multi-feature (6 sub-features)             |
| **Target**   | v0.3                                       |

---

## Decomposition Verdict

**Multi-split.** The workspace architecture introduces 6 distinct sub-features with clear dependency order. The core enabler is `WorkspaceResolver` — all other features depend on it. The existing `PipelineEngine` and `ConfigManager` already accept `workingDir` injection, so the integration surface is small.

---

## Feature Manifest

### Layer 1: Core Resolution (Must Have)

| ID       | Feature                          | Dependencies | Effort | Description |
|----------|----------------------------------|-------------|--------|-------------|
| WS-001   | WorkspaceResolver                | None        | M      | Core module: find workspace root, resolve project path from cwd, 5-step context resolution logic |
| WS-002   | ProjectConfig (project.yaml)     | None        | S      | Zod schema + read/write for project.yaml (name, platforms, language, tone, tags, history) |

### Layer 2: CLI Commands (Needs Layer 1)

| ID       | Feature                          | Dependencies       | Effort | Description |
|----------|----------------------------------|--------------------|--------|-------------|
| WS-003   | `reachforge init` command            | WS-001             | S      | Create workspace: `.reachforge/config.yaml`, optional first project |
| WS-004   | `reachforge new` command             | WS-001, WS-002     | S      | Create project: `project.yaml` + 6 pipeline dirs in workspace |
| WS-005   | `reachforge workspace` command       | WS-001             | S      | Show workspace info: path, project list, active project |

### Layer 3: Integration (Needs Layer 1+2)

| ID       | Feature                          | Dependencies       | Effort | Description |
|----------|----------------------------------|--------------------|--------|-------------|
| WS-006   | Wire into existing commands      | WS-001, WS-002     | M      | Update index.ts + ConfigManager to use resolved workspace/project path instead of cwd. Add `--all` and `--project` flags to status. Backward compatible. |

---

## Dependency Graph

```
WS-001 (WorkspaceResolver) ──┬── WS-003 (init)
                              ├── WS-005 (workspace)
WS-002 (ProjectConfig)  ─────┤
                              ├── WS-004 (new)
                              └── WS-006 (Wire into existing commands)
```

---

## Critical Path

```
WS-001 + WS-002 (parallel) → WS-006 (integration) → WS-003 + WS-004 + WS-005 (parallel)
```

**Rationale**: WorkspaceResolver and ProjectConfig are independent foundations. Integration (WS-006) is the key deliverable — it makes all existing commands workspace-aware. The new CLI commands (init/new/workspace) can be built in parallel after that.

---

## Execution Order

| Sprint | Tasks | Tests |
|--------|-------|-------|
| 1 | **WS-001** WorkspaceResolver + **WS-002** ProjectConfig schema | Unit tests for resolution logic, schema validation |
| 2 | **WS-006** Wire into index.ts + ConfigManager (4-layer config) | Integration tests: existing 143 tests still pass + new workspace-aware tests |
| 3 | **WS-003** init + **WS-004** new + **WS-005** workspace commands | Command tests with temp workspace dirs |

**Estimated total: 3-4 days**

---

## Effort Legend

| Size | Estimate | Description |
|------|----------|-------------|
| S    | 0.5-1 day | Single file, simple logic |
| M    | 1-2 days  | Multiple files, integration points |

---

## Backward Compatibility Contract

1. All 143 existing tests MUST pass without modification
2. Running `reachforge status` in a directory without `.reachforge/` falls back to `cwd()` as project root
3. No existing CLI argument signatures change
4. `reachforge init` is opt-in — never required

---

*Next: `/spec-forge:tech-design` for workspace architecture, then `/code-forge:plan` → `/code-forge:impl`*
