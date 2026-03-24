# Pipeline Engine Refactor

> Feature spec for code-forge implementation planning.
> Source: extracted from docs/multi-article/tech-design.md §8
> Created: 2026-03-24

| Field | Value |
|-------|-------|
| Component | pipeline-engine-refactor |
| Priority | P0 |
| SRS Refs | — |
| Tech Design | §8.1 — pipeline-engine-refactor |
| Depends On | filename-parser, multi-article-metadata |
| Blocks | command-updates |

## Purpose

Refactor `PipelineEngine` from directory-based operations (move entire subdirectory between stages) to file-based operations (move individual `.md` files). The engine becomes multi-article aware: it can list articles in a stage, move a specific article's files, and find due articles by checking meta.yaml schedules.

## Scope

**Included:**
- `moveArticle()` — move one article's files between stages
- `listArticles()` — list articles in a stage by parsing filenames
- `findDueArticles()` — check meta.yaml schedule instead of directory name timestamps
- `readArticleContent()` / `writeArticleFile()` — file-level I/O
- `getArticlePath()` — construct path to an article file in a stage
- `rollbackArticle()` — move article back one stage

**Excluded:**
- Metadata schema changes (multi-article-metadata's job)
- Filename parsing logic (filename-parser's job)
- Command-level logic changes

## Core Responsibilities

1. **File movement** — move `.md` files between stage directories
2. **Article listing** — parse filenames in a stage to list unique articles
3. **Due detection** — find articles whose schedule time has passed
4. **File I/O** — read/write article content files

## Interfaces

### Inputs
- **articleName** (string) — article to operate on
- **fromStage / toStage** (PipelineStage) — source and target stages
- **filename** (string) — specific file to read/write
- **content** (string) — content to write

### Outputs
- **StageTransition** — `{ from, to, article, timestamp }`
- **string[]** — list of article names
- **string** — file content

### Dependencies
- **filename-parser** — `parseArticleFilename()`, `buildArticleFilename()`, `isAdaptedStage()`
- **multi-article-metadata** — `readArticleMeta()`, `writeArticleMeta()`
- **fs-extra** — filesystem operations

## Key Behaviors

### listArticles(stage: PipelineStage): Promise<string[]>

List unique article names in a stage.

**Logic steps:**
1. Read directory `{projectDir}/{stage}`
2. Filter: only `.md` files, exclude dotfiles and `.yaml`
3. Parse each filename with `parseArticleFilename(file, stage)`
4. Collect unique article names (deduplicate — one article may have multiple platform files)
5. Return sorted array

**Example:**
```
04_adapted/ contains: teaser.x.md, teaser.devto.md, deep-dive.zhihu.md
listArticles('04_adapted') → ['deep-dive', 'teaser']
```

### getArticleFiles(article: string, stage: PipelineStage): Promise<string[]>

List all files belonging to an article in a stage.

**Logic steps:**
1. Read directory `{projectDir}/{stage}`
2. Filter `.md` files
3. Parse each, keep those where `parsed.article === article`
4. Return filenames

**Example:**
```
getArticleFiles('teaser', '04_adapted') → ['teaser.x.md', 'teaser.devto.md']
getArticleFiles('teaser', '02_drafts') → ['teaser.md']
```

### moveArticle(article: string, fromStage: PipelineStage, toStage: PipelineStage): Promise<StageTransition>

Move all files for an article from one stage to another.

**Logic steps:**
1. `const files = await getArticleFiles(article, fromStage)`
2. If `files.length === 0`, throw `ProjectNotFoundError(article, fromStage)`
3. For each file:
   a. `sourcePath = path.join(projectDir, fromStage, file)`
   b. `targetPath = path.join(projectDir, toStage, file)`
   c. If target exists, throw `ReachforgeError("already exists in {toStage}")`
   d. `await fs.copy(sourcePath, targetPath)`
   e. Verify copy, then `await fs.remove(sourcePath)`
4. Update meta: `writeArticleMeta(article, { status: STAGE_STATUS_MAP[toStage] })`
5. Return `{ from: fromStage, to: toStage, article, timestamp: now }`

### findDueArticles(): Promise<string[]>

Find articles in 05_scheduled whose schedule time has passed.

**Logic steps:**
1. `const articles = await listArticles('05_scheduled')`
2. For each article:
   a. `const meta = await readArticleMeta(article)`
   b. If `meta?.schedule` and `meta.schedule <= nowIso` → article is due
   c. If no schedule field → treat as immediately due
3. Return due article names

**Key change from current**: No longer parses directory name timestamps. Uses `meta.yaml → articles.{name}.schedule` instead.

### rollbackArticle(article: string): Promise<StageTransition>

Move an article back one stage.

**Logic steps:**
1. Search stages from last to first for files matching this article
2. When found at stage `i`, if `i === 0` throw "already at first stage"
3. `prevStage = STAGES[i - 1]`
4. If moving from adapted/scheduled/sent back to pre-adapted stage: only move the base article file (without platform suffix), or throw if no base file exists
5. Call `moveArticle(article, currentStage, prevStage)`

**Special case — rollback from 04_adapted to 03_master:**
- In 04_adapted, files are `teaser.x.md`, `teaser.devto.md` — platform-specific
- In 03_master, the file should be `teaser.md` — the original master
- Strategy: if `teaser.md` (no platform) exists in 04_adapted, move it. Otherwise, this is a destructive rollback — the master was consumed during adaptation. Throw error: "Cannot rollback: no master file in adapted stage. Re-approve from drafts instead."

### readArticleContent(stage: PipelineStage, article: string, platform?: string): Promise<string>

1. `const filename = buildArticleFilename(article, platform ?? null)`
2. `const filePath = path.join(projectDir, stage, filename)`
3. If not exists, throw `ProjectNotFoundError`
4. Return `fs.readFile(filePath, 'utf-8')`

### writeArticleFile(stage: PipelineStage, article: string, content: string, platform?: string): Promise<void>

1. `const filename = buildArticleFilename(article, platform ?? null)`
2. `const filePath = path.join(projectDir, stage, filename)`
3. `await fs.writeFile(filePath, content)`

### getArticlePath(stage: PipelineStage, article: string, platform?: string): string

1. `const filename = buildArticleFilename(article, platform ?? null)`
2. Return `path.join(projectDir, stage, filename)`

## Constraints

- **File-level atomicity**: copy-then-remove for moves (existing pattern)
- **No directory creation per article**: stages are pre-created by `initPipeline()`
- **Article files only**: ignore non-.md files, dotfiles, .yaml files in stage dirs

## Acceptance Criteria

| AC-ID | Criterion | Verification Method |
|-------|-----------|---------------------|
| AC-001 | Multiple .md files coexist in stage directories | Integration test |
| AC-006 | Schedule moves platform files to 05_scheduled | Integration test |
| AC-007 | findDueArticles() uses meta.yaml schedule | Integration test |
| AC-014 | rollbackArticle moves only target article's files | Integration test |
| AC-PE-001 | listArticles deduplicates (teaser.x.md + teaser.devto.md → ["teaser"]) | Unit test |
| AC-PE-002 | moveArticle copies all platform files for an article | Integration test |
| AC-PE-003 | moveArticle throws if target file exists | Unit test |

## Error Handling

- Article not found in stage: `ProjectNotFoundError`
- Target file exists: `ReachforgeError` with guidance
- Copy verification failure: `ReachforgeError`
- Rollback from adapted without master file: `ReachforgeError` with guidance

## File Structure

```
src/
└── core/
    └── pipeline.ts           # Refactored PipelineEngine
```

## Test Module

**Test file**: `src/core/pipeline.test.ts`

**Test scope**:
- **Unit**: `listArticles()`, `getArticleFiles()`, `findDueArticles()`
- **Integration**: `moveArticle()`, `rollbackArticle()` with temp directories and real files
- **Fixtures**: Temp project directory with populated stage dirs and meta.yaml
