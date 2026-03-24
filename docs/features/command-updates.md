# Command Updates

> Feature spec for code-forge implementation planning.
> Source: extracted from docs/multi-article/tech-design.md §8
> Created: 2026-03-24

| Field | Value |
|-------|-------|
| Component | command-updates |
| Priority | P0 |
| SRS Refs | — |
| Tech Design | §8.1 — command-updates |
| Depends On | pipeline-engine-refactor, multi-article-metadata |
| Blocks | mcp-tool-updates |

## Purpose

Update all CLI command implementations to work with the multi-article pipeline. Commands now operate on individual article files (not subdirectories) and use the centralized meta.yaml for metadata and scheduling.

## Scope

**Included:**
- Refactor `draftCommand` — write flat file, update project-level meta.yaml
- Refactor `approveCommand` — move flat file between stages
- Refactor `adaptCommand` — read master file, write `{article}.{platform}.md` files
- Refactor `scheduleCommand` — move files, store schedule in meta.yaml (no directory rename)
- Refactor `publishCommand` — find due articles from meta.yaml, publish per-platform files, record results in meta.yaml
- Refactor `goCommand` — add `--name` option, auto-slug fallback
- Refactor `statusCommand` — show per-article breakdown
- Refactor `rollbackCommand` — article-level rollback
- Refactor `refineCommand` — operate on flat article file

**Excluded:**
- Core pipeline/metadata logic (handled by pipeline-engine-refactor and multi-article-metadata)
- MCP tool schema changes (mcp-tool-updates)
- Watch daemon (minor changes, follows publish refactor)

## Core Responsibilities

1. **Adapt all commands** to use new PipelineEngine file-level API
2. **Add article parameter** to commands that need it
3. **Remove directory-based assumptions** (no more `meta.yaml` per subdirectory, no `platform_versions/` dir, no timestamp directory names)

## Key Behaviors

### draftCommand(engine, article, options)

**Current**: Reads from `01_inbox/{name}/`, writes to `02_drafts/{name}/draft.md`
**New**: Reads from `01_inbox/{article}.md` (or `{article}/` for dir), writes to `02_drafts/{article}.md`

**Changes:**
1. Source: check for `{article}.md` file first, then `{article}/` directory (backward compat for inbox)
2. Output: `engine.writeArticleFile('02_drafts', article, content)` → creates `02_drafts/{article}.md`
3. Meta: `engine.metadata.writeArticleMeta(article, { status: 'drafted' })`
4. Remove: `DRAFT_FILENAME` constant usage (no more `draft.md` inside subdirectory)

### approveCommand(engine, article, options)

**Current**: Moves `02_drafts/{name}/` to `03_master/{name}/`, renames `draft.md` to `master.md`
**New**: Moves `02_drafts/{article}.md` to `03_master/{article}.md`

**Changes:**
1. `engine.moveArticle(article, '02_drafts', '03_master')`
2. No file rename needed — same filename in both stages
3. Meta update handled by `moveArticle()`

### adaptCommand(engine, article, options)

**Current**: Reads `03_master/{name}/master.md`, writes `04_adapted/{name}/platform_versions/{platform}.md`
**New**: Reads `03_master/{article}.md`, writes `04_adapted/{article}.{platform}.md`

**Changes:**
1. Read master: `engine.readArticleContent('03_master', article)`
2. For each platform, write: `engine.writeArticleFile('04_adapted', article, content, platform)` → creates `{article}.{platform}.md`
3. Remove: `PLATFORM_VERSIONS_DIR` constant, `MASTER_FILENAME` constant
4. Meta: `engine.metadata.writeArticleMeta(article, { status: 'adapted', adapted_platforms: platforms })`

### scheduleCommand(engine, article, date, options)

**Current**: Moves `04_adapted/{name}/` to `05_scheduled/{date}-{name}/` (timestamp in dir name)
**New**: Moves `{article}.*.md` files from `04_adapted/` to `05_scheduled/`, stores schedule in meta.yaml

**Changes:**
1. `engine.moveArticle(article, '04_adapted', '05_scheduled')` — no rename, same filenames
2. `engine.metadata.writeArticleMeta(article, { status: 'scheduled', schedule: normalizedDate })`
3. Remove: date-prefixed directory naming
4. Remove: `SCHEDULED_DIR_REGEX` usage

### publishCommand(engine, options)

**Current**: `findDueProjects()` parses directory name timestamps, reads `platform_versions/` subdir
**New**: `findDueArticles()` checks meta.yaml schedule, reads `{article}.{platform}.md` files

**Changes:**
1. `const dueArticles = await engine.findDueArticles()`
2. For each due article:
   a. `const files = await engine.getArticleFiles(article, '05_scheduled')`
   b. Parse each file to get platform: `parseArticleFilename(file, '05_scheduled')`
   c. Lock: `engine.metadata.lockArticle(article)`
   d. For each platform file, read content and publish
   e. Record result: `engine.metadata.updatePlatformStatus(article, platform, { status, url, error })`
   f. Unlock: `engine.metadata.unlockArticle(article)`
   g. If any success: move article files to `06_sent`
3. Remove: `RECEIPT_FILENAME`, `readReceipt()`, `writeReceipt()`
4. Remove: directory-name timestamp parsing for due check

### goCommand(engine, prompt, options)

**Current**: `slugify(prompt)` auto-generates name, creates inbox directory
**New**: Add `--name` option; if provided use it, else `slugify(prompt)`

**Changes:**
1. `const article = options.name ?? slugify(prompt)`
2. `validateArticleName(article)` — check not conflicting with platform ID
3. Write inbox: `engine.writeArticleFile('01_inbox', article, prompt)` → `01_inbox/{article}.md`
4. Chain: `draftCommand(engine, article)` → `approveCommand(...)` → `adaptCommand(...)` → `scheduleCommand(...)` → `publishCommand(...)`
5. CLI: `.option('--name <name>', 'Explicit article name (default: auto-generated from prompt)')`

### statusCommand(engine, options)

**Current**: Lists subdirectories per stage
**New**: Lists articles per stage (parsed from filenames), shows per-article status from meta.yaml

**Changes:**
1. For each stage: `const articles = await engine.listArticles(stage)`
2. Display unique article names with their meta.yaml status
3. Due detection from meta.yaml schedule instead of directory names
4. JSON mode: include per-article metadata in output

### rollbackCommand(engine, article, options)

**Current**: Finds subdirectory, strips date prefix if from scheduled
**New**: `engine.rollbackArticle(article)`

**Changes:**
1. No date prefix stripping needed (filenames don't have timestamps)
2. Delegates entirely to `PipelineEngine.rollbackArticle()`

### refineCommand(engine, article, options)

**Current**: Reads `{stage}/{name}/draft.md` or `master.md`
**New**: Reads `{stage}/{article}.md`

**Changes:**
1. Find article in 02_drafts or 03_master: `engine.readArticleContent(stage, article)`
2. Write refined content back: `engine.writeArticleFile(stage, article, refined)`

## Constraints

- **One command = one article** (except `publish` and `status` which are project-wide)
- **Backward compat not needed**: Remove all subdirectory-based code paths
- **JSON output**: All commands must maintain `--json` output with updated field names

## Acceptance Criteria

| AC-ID | Criterion | Verification Method |
|-------|-----------|---------------------|
| AC-002 | `reach draft teaser` creates only teaser.md | Integration test |
| AC-003 | `reach adapt teaser --platforms x,devto` creates teaser.x.md and teaser.devto.md | Integration test |
| AC-009 | `reach go "prompt"` auto-generates slug | Integration test |
| AC-010 | `reach go "prompt" --name teaser` uses explicit name | Integration test |
| AC-011 | `reach status` shows per-article breakdown | Integration test |
| AC-CMD-001 | `reach approve` moves single flat file between stages | Integration test |
| AC-CMD-002 | `reach schedule` stores date in meta.yaml, not directory name | Integration test |
| AC-CMD-003 | `reach publish` reads schedule from meta.yaml | Integration test |

## Error Handling

- Article not found: commands throw `ProjectNotFoundError` (from PipelineEngine)
- Invalid article name: commands call `validateArticleName()` early
- All error messages include the article name and stage for context

## File Structure

```
src/
└── commands/
    ├── draft.ts
    ├── approve.ts
    ├── adapt.ts
    ├── schedule.ts
    ├── publish.ts
    ├── go.ts
    ├── status.ts
    ├── rollback.ts
    └── refine.ts
```

## Test Module

**Test file**: `src/commands/*.test.ts` (one per command, or consolidated)

**Test scope**:
- **Integration**: Each command end-to-end with temp project directory
- **Unit**: `goCommand` slug generation and --name handling
- **Fixtures**: Temp project with pre-populated stages and meta.yaml
