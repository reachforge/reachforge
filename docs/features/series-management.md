# Feature Spec: Series Management

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Feature**  | Series -- Multi-Article Campaign Support |
| **Status**   | Planned                                  |
| **Date**     | 2026-03-27                               |
| **Approach** | Lightweight metadata layer (Approach A)  |

---

## 1. Overview

Series management adds the ability to organize multiple articles into a cohesive campaign with shared context, coordinated scheduling, and progress tracking. A series is a metadata layer on top of the existing 3-stage pipeline -- individual articles still flow through `01_drafts -> 02_adapted -> 03_published` independently.

### What ReachForge Does

- Scaffold a `series.yaml` with correct format (`reach series init`)
- Inject preceding article context into LLM prompts during draft generation (continuity)
- Batch operations: adapt, schedule, and publish across a series
- AI-powered series review for consistency and completeness
- Handle mid-series changes (insert, remove, reorder) with automatic schedule adjustment
- Series progress dashboard

### What ReachForge Does NOT Do

- Content strategy or topic planning -- users (or their AI tools) decide what to write
- Generate the series outline -- users create or let external AI generate `series.yaml` content
- Enforce a rigid series state machine -- articles remain independently manageable

The `series.yaml` format is the contract. Users can create it manually, via `reach series init`, or have an external AI generate it. ReachForge only consumes and operates on it.

---

## 2. Data Model

### Series Definition (`series/{name}.yaml`)

```yaml
name: apcore-deep-dive
title: "Deep Dive into APCore"
description: "A comprehensive technical series on the APCore framework"
audience: "Backend developers interested in API standardization"
tone: professional
language: en

articles:
  - slug: apcore-intro
    title: "What is APCore: A New Paradigm for Unified API Interaction"
    synopsis: "Motivation, core concepts, and problems APCore solves"
    order: 1

  - slug: apcore-architecture
    title: "APCore Architecture: From Protocol to Implementation"
    synopsis: "Layered architecture, core abstractions, and design decisions"
    order: 2
    depends_on: [apcore-intro]

  - slug: apcore-integration
    title: "Integrate APCore in 5 Minutes: Django, Flask, NestJS"
    synopsis: "Hands-on integration guide with code examples"
    order: 3
    depends_on: [apcore-architecture]

  - slug: apcore-mcp
    title: "APCore + MCP: Bridging AI Agents and APIs"
    synopsis: "How APCore's MCP bridge enables AI-native API access"
    order: 4
    depends_on: [apcore-architecture]

  - slug: apcore-testing
    title: "Testing APCore Integrations: Strategy and Tooling"
    synopsis: "Cross-language test verification and behavioral consistency"
    order: 5
    depends_on: [apcore-integration, apcore-mcp]

# Schedule configuration (applied via `reach series schedule`)
schedule:
  start: 2026-04-01           # First article publish date
  interval: 7d                # Default interval between articles
  # Per-article overrides possible via article-level schedule field

# Platform defaults for the series (per-article override allowed)
platforms: [devto, hashnode, wechat]
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where is series state stored? | `series.yaml` for definition, `meta.yaml` for article status | Series is organizational metadata; article state stays in the existing system |
| Is series a pipeline stage? | No | Series is a grouping concept, not a state transition |
| Can articles belong to multiple series? | Yes (by slug reference) | Flexible; a "best of" series could reference existing articles |
| Are platforms/schedule per-series or per-article? | Both -- series provides defaults, articles can override | Flexibility: intro article on all platforms, deep-dive only on zhihu |

### Directory Structure

```
project/
├── series/
│   ├── apcore-deep-dive.yaml
│   └── weekly-updates.yaml
├── 01_drafts/
│   ├── apcore-intro.md
│   └── apcore-architecture.md
├── 02_adapted/
├── 03_published/
├── assets/
├── meta.yaml
└── project.yaml
```

---

## 3. Commands

### `reach series init <topic>`

Scaffold a new series definition file with the correct YAML format.

```bash
reach series init "deep dive into apcore framework"
# Interactive prompts:
#   Series name (slug): apcore-deep-dive
#   Target audience: backend developers
#   Number of articles: 5
#   Tone: professional
#   Default platforms: devto,hashnode,wechat
# Creates: series/apcore-deep-dive.yaml
```

This is a scaffolding command -- it generates the YAML structure with placeholder articles. Users then edit the file to fill in titles, synopses, and ordering. No LLM involved.

---

### `reach series draft <series-name> [--all]`

Generate the next unwritten article in the series, automatically injecting context from previously written articles.

```bash
reach series draft apcore-deep-dive        # Draft the next unwritten article
reach series draft apcore-deep-dive --all  # Draft all unwritten articles sequentially
```

**Context injection logic:**

1. Read the series definition to determine article order and dependencies.
2. Identify the next article whose slug does NOT exist in `01_drafts/`.
3. Collect synopses and key content from previously drafted articles (respecting `depends_on`).
4. Build a prompt that includes:
   - The series description and audience
   - Summaries of preceding articles (truncated to fit context)
   - The current article's title and synopsis from `series.yaml`
5. Call `draftCommand` with the assembled prompt and `--name <slug>`.

**`--all` mode:** Iterates through all unwritten articles in order, drafting each one sequentially (each subsequent draft benefits from the previous ones being written).

---

### `reach series review <series-name>`

AI-powered review of the complete series for consistency, completeness, and quality.

```bash
reach series review apcore-deep-dive
```

**Review checks:**

- **Terminology consistency**: Are the same concepts named the same way across articles?
- **Cross-references**: Do articles reference each other correctly? Missing links?
- **Completeness**: Does the series cover all points outlined in the synopses?
- **Progression**: Is the difficulty/depth progressing logically?
- **Redundancy**: Are topics unnecessarily repeated across articles?
- **Gaps**: Are there missing topics that should be an article?

**Output:** A report listing findings with severity and suggested fixes. Does NOT auto-modify articles -- users decide what to act on via `reach refine`.

---

### `reach series adapt <series-name>`

Batch-adapt all drafted (but not yet adapted) articles in the series.

```bash
reach series adapt apcore-deep-dive                    # Use series-level platforms
reach series adapt apcore-deep-dive -p devto,hashnode  # Override platforms
```

Iterates through series articles in order. For each article in `01_drafts/` that is not yet in `02_adapted/`, runs `reach adapt <slug>`. Uses the series-level `platforms` as default, with per-article platform overrides from `series.yaml` taking precedence.

---

### `reach series schedule <series-name>`

Auto-calculate and apply schedule dates based on the series schedule configuration.

```bash
reach series schedule apcore-deep-dive
# Applies:
#   apcore-intro:         2026-04-01 (start)
#   apcore-architecture:  2026-04-08 (start + 7d)
#   apcore-integration:   2026-04-15 (start + 14d)
#   apcore-mcp:           2026-04-22 (start + 21d)
#   apcore-testing:       2026-04-29 (start + 28d)
```

**Rules:**
- Only schedules articles that are in `02_adapted/` (adapted but not yet scheduled/published).
- Skips already-published articles.
- Per-article `schedule` field in `series.yaml` overrides the calculated date.
- Supports `--dry-run` to preview without applying.

---

### `reach series status <series-name>`

Display series progress dashboard.

```bash
reach series status apcore-deep-dive

# Output:
#   Series: Deep Dive into APCore (5 articles)
#
#   1. [published]  apcore-intro          Published 2026-04-01  devto,hashnode
#   2. [scheduled]  apcore-architecture   Scheduled 2026-04-08  devto,hashnode,wechat
#   3. [adapted]    apcore-integration    Ready to schedule
#   4. [drafted]    apcore-mcp            Needs adaptation
#   5. [planned]    apcore-testing        Not yet drafted
#
#   Progress: 1/5 published, 1 scheduled, 1 ready, 1 drafted, 1 planned
```

Article status is read from `meta.yaml` (existing system). `planned` means the slug exists in `series.yaml` but has no corresponding file in any pipeline stage.

---

### `reach series list`

List all series in the current project.

```bash
reach series list

# Output:
#   apcore-deep-dive    5 articles  1/5 published
#   weekly-updates      12 articles 8/12 published
```

---

## 4. Mid-Series Changes

### Insert an Article

```bash
reach series add apcore-deep-dive --after apcore-architecture
# Interactive: enter slug, title, synopsis
# Or: reach series add apcore-deep-dive --after apcore-architecture --slug apcore-security --title "..."
```

**Behavior:**
- Inserts a new entry into `series.yaml` after the specified article.
- `order` fields are recalculated for all subsequent articles.
- If subsequent articles are already scheduled, their dates are pushed forward by one interval.
- Already-published articles are never affected.
- Prints a summary of schedule changes and suggests `reach series review` to check continuity.

### Remove an Article

```bash
reach series remove apcore-deep-dive apcore-mcp
```

**Behavior:**
- Removes the entry from `series.yaml`.
- Does NOT delete the article files from the pipeline (they become standalone articles).
- `order` fields are recalculated.
- If subsequent articles are scheduled, their dates are pulled forward by one interval.
- Already-published articles are never affected.
- Warns if other articles have `depends_on` referencing the removed article.

### Reorder Articles

```bash
reach series reorder apcore-deep-dive
# Opens interactive reorder (or --move <slug> --to <position>)
```

**Behavior:**
- Updates `order` fields in `series.yaml`.
- Recalculates schedule dates for all un-published articles.
- Suggests `reach series review` to verify continuity after reorder.

### Schedule Adjustment Rules

| Change | Already Published | Scheduled | Not Yet Scheduled |
|--------|-------------------|-----------|-------------------|
| Insert after | No change | Push forward by 1 interval | No change (not scheduled yet) |
| Remove | No change | Pull forward by 1 interval | No change |
| Reorder | No change | Recalculate from series schedule config | No change |

---

## 5. Context Injection Detail

When `reach series draft` generates an article, the LLM prompt is assembled as:

```
You are writing article {order} of {total} in a series titled "{series.title}".

Series context:
- Audience: {series.audience}
- Tone: {series.tone}

Previously published articles in this series:
1. "{article_1.title}" - {brief summary or first 200 words}
2. "{article_2.title}" - {brief summary or first 200 words}

Your task:
Write "{current.title}": {current.synopsis}

Maintain consistent terminology and style with the preceding articles.
Reference previous articles where relevant for continuity.
```

The context window budget is managed by truncating summaries of earlier articles. The most recent 2-3 articles get full summaries; earlier articles get only their title and synopsis from `series.yaml`.

---

## 6. Relationship to Existing Pipeline

Series is purely an organizational layer. Every operation maps to existing commands:

| Series Command | Underlying Pipeline Commands |
|----------------|------------------------------|
| `series draft` | `reach draft <prompt> --name <slug>` (with context-enriched prompt) |
| `series adapt` | `reach adapt <slug>` for each article |
| `series schedule` | `reach schedule <slug> <date>` for each article |
| `series review` | LLM call with all article contents (new, no pipeline equivalent) |
| `series status` | `reach status` data + series.yaml ordering |

Individual articles remain fully manageable with standard pipeline commands. A user can `reach refine apcore-intro` or `reach publish apcore-intro` without going through series commands.

---

## 7. Files Affected (Implementation)

| File | Change |
|------|--------|
| `src/commands/series.ts` | New: all series subcommands |
| `src/types/series.ts` | New: Series, SeriesArticle types + Zod schema |
| `src/core/series-manager.ts` | New: CRUD for series.yaml, schedule calculation, context assembly |
| `src/index.ts` | Register series command group |
| `src/mcp/tools.ts` | Add series MCP tools |
| `src/help.ts` | Add series to command groups |
| `skills/stages/series-review.md` | New: review prompt template |
| `tests/unit/commands/series.test.ts` | New: series command tests |
| `tests/unit/core/series-manager.test.ts` | New: series manager tests |

---

## 8. Out of Scope

- **Series-level approval gate**: No "approve entire series" step. Each article is independently manageable.
- **Cross-series dependencies**: Series are independent of each other.
- **Series templates**: Reusable series structures (e.g., "product launch template"). Consider for future.
- **Collaborative editing**: Single-user CLI tool.
- **Auto-update published articles**: No mechanism to update already-published content on platforms.
- **Image/media generation for series**: ReachForge does not generate images. Users manage assets independently.
