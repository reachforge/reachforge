# Idea: Workspace + Multi-Project Architecture

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Date** | 2026-03-16 |
| **Priority** | v0.3 (next version) |
| **Driver** | Professional content operators run multiple projects simultaneously |

---

## 1. Problem Statement

### Current Pain
reachforge v0.1 treats `process.cwd()` as the pipeline root. This creates a fundamental conflict:

1. **Code–content coupling**: Pipeline directories (01_inbox → 06_sent) are created in the project source directory, mixing tool code with user content.
2. **No multi-project support**: A content operator managing a tech blog, company newsletter, and personal brand must run 3 separate reachforge instances in 3 directories.
3. **Git pollution**: Users who want to version-control their articles must either pollute the reachforge repo or maintain complex .gitignore rules.

### Who Feels This Pain
- **Professional content operators** running 2-5 projects with different target platforms, languages, and tones.
- **Teams** where one person manages multiple brand voices.
- **Any user** who installs reachforge globally (via npm) and expects a clean workspace elsewhere.

## 2. Proposed Solution

### Core Concept: Workspace as Content Home

Separate the **tool** (reachforge npm package) from the **workspace** (user content). A workspace contains multiple **projects**, each with an independent 6-stage pipeline.

### Directory Structure (Flat)

```
~/reach-workspace/                    ← workspace root (user's git repo)
  .reach/
    config.yaml                        ← workspace-level config (shared credentials, defaults)
  tech-blog/                           ← project 1
    01_inbox/
    02_drafts/
    03_master/
    04_adapted/
    05_scheduled/
    06_sent/
    project.yaml                       ← project config (platforms, language, tone, tags)
    .env                               ← project-level API keys (overrides workspace)
  company-news/                        ← project 2
    01_inbox/ ... 06_sent/
    project.yaml
  personal-brand/                      ← project 3
    01_inbox/ ... 06_sent/
    project.yaml
  .git/                                ← user manages their own git
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Flat (projects as top-level dirs) | Simpler, user sees projects immediately, fewer nested paths |
| Content sharing | Completely independent | Simplest, safest. Cross-project reuse via manual copy or symlink |
| Global config | `~/.reach/config.yaml` | Stores default workspace path, global credentials |
| Project isolation | Each project has own pipeline + config | Clean separation, different platforms per project |
| Season/Batch | No directory-level modeling | Project = ongoing channel. Seasons/batches managed via filename conventions (e.g., `s1-batch1-topic.md`) and `project.yaml` tags. Tool layer stays simple; operational strategy is the user's domain. |

### Configuration Hierarchy (4 layers)

```
Priority (highest → lowest):
  1. Environment variables        ← runtime override
  2. Project .env + project.yaml  ← project-specific
  3. Workspace .reach/config.yaml ← shared across projects
  4. Global ~/.reach/config.yaml  ← machine-wide defaults
```

### project.yaml Schema

```yaml
name: tech-blog
description: "Technical articles about Bun, TypeScript, and AI tooling"
platforms: [x, devto, hashnode]
language: en
tone: technical                    # used in AI prompt customization
default_tags: [bun, typescript, ai]
credentials:                        # project-level overrides (optional)
  devto_api_key: "project-specific-key"

# Operational log — free-form, not parsed by tool
history:
  - phase: "冷启动"
    period: "2026-01 ~ 2026-02"
    note: "每周3篇，试水 X + DevTo"
  - phase: "增长期"
    period: "2026-03 ~"
    note: "聚焦 DevTo，砍掉知乎，加入 Hashnode"
```

## 3. New CLI Commands

```bash
# Workspace management
reach init [path]                  # Initialize a new workspace (default: cwd)
reach new <project-name>           # Create a new project in current workspace

# Context-aware commands (detect workspace/project from cwd)
cd ~/reach-workspace/tech-blog
reach status                       # Status of current project
reach draft my-idea.md             # Works in project context

# Cross-project views
reach status --all                 # Dashboard across ALL projects
reach status --project company-news # Status of specific project

# Workspace info
reachforge workspace                    # Show current workspace path and project list
```

### Context Resolution Logic

```
1. Check REACHFORGE_WORKSPACE env var → use that workspace
2. Walk up from cwd looking for .reach/ directory → found = workspace root
3. Check if cwd contains project.yaml → cwd is a project dir
4. Check ~/.reach/config.yaml for default_workspace → use that
5. Fallback: treat cwd as a single-project workspace (backward compatible)
```

## 4. Impact on Existing Code

### Low-risk changes (well-contained):
- `PipelineEngine(workingDir)` already accepts injected path → just resolve to project dir instead of cwd
- `ConfigManager.load(workingDir)` already accepts path → add workspace layer
- `src/index.ts` — change `process.cwd()` to resolved project path

### New modules needed:
- `src/core/workspace.ts` — WorkspaceResolver class (find workspace, list projects, resolve project path)
- `src/commands/init.ts` — Initialize workspace
- `src/commands/new.ts` — Create project
- `src/commands/workspace.ts` — Show workspace info

### Backward compatibility:
- If no workspace detected, fall back to `cwd()` as project root → existing single-project usage works unchanged
- `reach init` is opt-in, not required

## 5. What If We Don't Build This?

1. **Users work around it** — create separate directories manually, run reachforge in each. Functional but clunky.
2. **Professional operators won't adopt** — managing 5 directories with 5 sets of credentials is a dealbreaker.
3. **npm global install is broken** — `reach status` in any directory creates pipeline dirs in that directory.
4. **Content can't be Git-managed cleanly** — the core "User Sovereignty" principle (§6 of DESIGN_STRATEGY) is violated.

## 6. Anti-Pseudo-Requirement Check

| Check | Result |
|-------|--------|
| Is this a real user need? | Yes — professional operators confirmed. Also solves the code/content separation problem we discovered organically. |
| Can it be solved with config alone? | Partially — `REACHFORGE_WORKSPACE` env var works but doesn't solve multi-project. |
| Is this over-engineering? | No — the core change (workspace path resolution) is ~100 lines. Project isolation reuses existing PipelineEngine. |
| Does a competitor solve this? | Hugo, Jekyll, Obsidian all separate tool from content workspace. This is standard practice. |

## 7. Competitive Reference

| Tool | Workspace Model |
|------|----------------|
| Hugo | `hugo new site mysite` creates separate content dir |
| Obsidian | Vaults are separate from app |
| Jekyll | Content in its own directory, gem installed globally |
| Postiz | SaaS, no local workspace concept |
| Buffer | SaaS, multi-brand via UI |

reachforge would be the first **CLI content engine** with native workspace + multi-project support.

## 8. MVP Scope

### In Scope (v0.3)
- `reach init [path]` — create workspace with `.reach/config.yaml`
- `reach new <name>` — create project with `project.yaml` + pipeline dirs
- Workspace path resolution (4-step logic above)
- Config hierarchy (4 layers)
- `reach status --all` — cross-project dashboard
- `reach workspace` — show workspace info
- Backward compatibility with single-project (no workspace) mode

### Out of Scope (future)
- Project templates (different project.yaml presets)
- Cross-project content references
- Workspace-level shared templates
- Team/collaboration features
- Workspace migration tool

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Existing tests pass unchanged | 143/143 (backward compat) |
| New workspace tests | ≥ 20 test cases |
| Time to init workspace + 2 projects | < 30 seconds |
| Single-project mode works without init | Yes (no regression) |

---

*Next: `/spec-forge:decompose` → `/spec-forge:tech-design` → `/code-forge:plan`*
