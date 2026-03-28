# Implementation Plan: Series Management (Phase 1)

## Overview

Gate-controlled series workflow: init → outline → approve → detail → approve → draft → adapt → schedule. 6 tasks in dependency order.

## Tasks

### Task 1: Types + constants
**Files**: `src/types/series.ts` (new), `src/core/constants.ts`

- Define Zod schemas: `SeriesArticleSchema`, `SeriesScheduleSchema`, `SeriesSchema`
- Series status enum: `planned`, `outlined`, `outline_approved`, `detailed`, `detail_approved`, `drafting`, `completed`
- Export types: `Series`, `SeriesArticle`, `SeriesSchedule`
- Add `SERIES_DIR = 'series'` to constants

### Task 2: SeriesManager
**Files**: `src/core/series-manager.ts` (new)

Core class with:
- **CRUD**: `readSeries(name)`, `writeSeries(name, data)`, `listSeries()` — read/write `series/{name}.yaml`
- **State transitions**: `transitionStatus(name, from, to)` — validates prerequisite status
- **Schedule calculation**: `calculateSchedule(series)` — `start + interval × (order - 1)`, returns `Map<slug, date>`
- **Context assembly**: `assembleContext(series, articleSlug, engine)` — builds LLM prompt with:
  1. Master outline (~500 token)
  2. All article title+synopsis (~300 token)
  3. Current article detailed outline (~300 token)
  4. Previous 1-2 articles' first 200 words (~400 token)
- **Init scaffold**: `scaffoldSeries(name, topic)` — generates template series.yaml with status=planned
- **Validation**: ensure series.yaml parses, slugs unique, depends_on references valid

Dependencies: fs-extra, js-yaml, zod, PipelineEngine (for article content reading)

### Task 3: Series commands — init, outline, approve, detail
**Files**: `src/commands/series.ts` (new)

- `seriesInitCommand(projectDir, topic, options)`:
  - Generate slug from topic
  - Call `manager.scaffoldSeries(slug, topic)`
  - Create `series/` dir if needed

- `seriesOutlineCommand(engine, name, options)`:
  - Gate: status must be `planned`
  - Read series.yaml basic info (title, description, audience, tone)
  - Build prompt asking AI to generate: master outline + article list with titles/synopses
  - Parse AI output, populate series.yaml `outline` + `articles[].title/synopsis`
  - Set status = `outlined`

- `seriesApproveCommand(engine, name, options)`:
  - `--outline`: gate status=`outlined` → `outline_approved`, record timestamp
  - `--detail`: gate status=`detailed` → `detail_approved`, record timestamp

- `seriesDetailCommand(engine, name, options)`:
  - Gate: status must be `outline_approved`
  - For each article, build prompt with master outline + article synopsis → AI generates detailed outline
  - Populate each article's `outline` field
  - Set status = `detailed`

### Task 4: Series commands — draft, adapt, schedule, status
**Files**: `src/commands/series.ts` (continued)

- `seriesDraftCommand(engine, name, options)`:
  - Gate: status must be `detail_approved` or `drafting`
  - Find next undrafted article (no file in `01_drafts/`)
  - Call `manager.assembleContext()` for prompt
  - Call `draftCommand(engine, prompt, { name: slug })`
  - Set status = `drafting` (or `completed` if all done)
  - `--all`: loop through all undrafted articles sequentially

- `seriesAdaptCommand(engine, name, options)`:
  - Loop articles in order, call `adaptCommand(engine, slug, { platforms })` for each
  - Platform resolution: CLI > series.platforms > project.yaml > auto-detect
  - Skip already-adapted articles

- `seriesScheduleCommand(engine, name, options)`:
  - Call `manager.calculateSchedule(series)`
  - For each adapted article, call `scheduleCommand(engine, slug, date)`
  - Skip published articles
  - `--dry-run` support

- `seriesStatusCommand(engine, name, options)`:
  - Read series.yaml + meta.yaml for each article
  - Display: series info, status, per-article status with stage/date/platforms
  - Show progress summary

### Task 5: CLI + MCP + help + docs
**Files**: `src/index.ts`, `src/mcp/tools.ts`, `src/help.ts`, `CLAUDE.md`

- Register `series` command group with subcommands (follow `asset` pattern):
  - `series init <topic>`
  - `series outline <name>`
  - `series approve <name>` with `--outline`/`--detail` options
  - `series detail <name>`
  - `series draft <name>` with `--all` option
  - `series adapt <name>` with `-p` option
  - `series schedule <name>` with `--dry-run` option
  - `series status <name>`
- Register APCore tools for each subcommand
- MCP tool schemas (8 schemas)
- Add "Series" group to help.ts
- Update CLAUDE.md with series commands

### Task 6: Tests + verify
**Files**: `tests/unit/core/series-manager.test.ts` (new), `tests/unit/commands/series.test.ts` (new)

SeriesManager tests:
- scaffoldSeries creates valid yaml
- readSeries/writeSeries roundtrip
- transitionStatus validates gates (planned→outlined OK, planned→detailed FAIL)
- calculateSchedule computes correct dates
- assembleContext builds prompt with all sections

Command tests:
- init creates file with status=planned
- outline requires status=planned, sets outlined
- approve --outline requires outlined, sets outline_approved
- detail requires outline_approved, sets detailed
- approve --detail requires detailed, sets detail_approved
- draft requires detail_approved, creates file in 01_drafts
- status shows correct per-article stages
- wrong-state transitions throw errors

Run `npm test` to verify.

## Dependency Order

```
Task 1 (types) → Task 2 (manager) → Tasks 3,4 (commands, sequential) → Task 5 (CLI) → Task 6 (tests)
```

## Critical Files

| File | Type | Content |
|------|------|---------|
| `src/types/series.ts` | New | Zod schemas, types, status enum |
| `src/core/series-manager.ts` | New | CRUD, gates, schedule, context assembly |
| `src/commands/series.ts` | New | 8 command functions |
| `src/core/constants.ts` | Modify | SERIES_DIR |
| `src/index.ts` | Modify | Series subcommand group + APCore |
| `src/help.ts` | Modify | Series command group |
| `src/mcp/tools.ts` | Modify | 8 tool schemas |
| `CLAUDE.md` | Modify | Series documentation |
