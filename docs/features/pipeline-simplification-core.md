# Feature Spec: Pipeline Simplification Core

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Feature**  | Pipeline Simplification -- Core Changes  |
| **Parent**   | [Tech Design](../pipeline-simplification/tech-design.md) |
| **Status**   | Implemented                              |
| **Date**     | 2026-03-27                               |

---

## 1. Scope

This spec covers the foundational changes required to reduce the pipeline from 6 stages to 3 stages. These changes must be applied first, as all other feature specs depend on them.

### Files Affected

| File | Change Type |
|------|-------------|
| `src/types/pipeline.ts` | Modify type definitions |
| `src/types/schemas.ts` | Modify Zod schemas |
| `src/core/constants.ts` | Modify stage constants |
| `src/core/pipeline.ts` | Modify engine methods |
| `src/core/metadata.ts` | Minor: no structural change, but migration support |
| `src/core/filename-parser.ts` | Modify `ADAPTED_STAGES` |
| `src/commands/refine.ts` | Modify `locateArticle()` and `saveContent()` |
| `tests/unit/core/pipeline.test.ts` | Major update |
| `tests/unit/types/schemas.test.ts` | Update status values |

---

## 2. Current Behavior

### Types (`src/types/pipeline.ts`)

```typescript
export type PipelineStage =
  | '01_inbox' | '02_drafts' | '03_master'
  | '04_adapted' | '05_scheduled' | '06_sent';

export type ProjectStatus =
  | 'inbox' | 'drafted' | 'master' | 'adapted' | 'scheduled' | 'published' | 'failed';
```

### Constants (`src/core/constants.ts`)

```typescript
export const STAGES: PipelineStage[] = [
  '01_inbox', '02_drafts', '03_master',
  '04_adapted', '05_scheduled', '06_sent',
];

export const STAGE_STATUS_MAP: Record<PipelineStage, ProjectStatus> = {
  '01_inbox': 'inbox',
  '02_drafts': 'drafted',
  '03_master': 'master',
  '04_adapted': 'adapted',
  '05_scheduled': 'scheduled',
  '06_sent': 'published',
};
```

### Zod Schema (`src/types/schemas.ts`)

```typescript
export const ArticleMetaSchema = z.object({
  status: z.enum(['inbox', 'drafted', 'master', 'adapted', 'scheduled', 'published', 'failed']),
  // ...
});
```

### Filename Parser (`src/core/filename-parser.ts`)

```typescript
export const ADAPTED_STAGES: PipelineStage[] = ['04_adapted', '05_scheduled', '06_sent'];
```

### Pipeline Engine -- `findDueArticles()` (`src/core/pipeline.ts`)

```typescript
async findDueArticles(): Promise<string[]> {
  const articles = await this.listArticles('05_scheduled');
  // ...
}
```

### Refine Command -- `locateArticle()` (`src/commands/refine.ts`)

```typescript
async function locateArticle(engine, safeName) {
  const draftPath = engine.getArticlePath('02_drafts', safeName);
  if (await fs.pathExists(draftPath)) {
    return { stage: '02_drafts', filename: `${safeName}.md`, filePath: draftPath };
  }
  const masterPath = engine.getArticlePath('03_master', safeName);
  if (await fs.pathExists(masterPath)) {
    return { stage: '03_master', filename: `${safeName}.md`, filePath: masterPath };
  }
  throw new Error(`Article '${safeName}' not found in 02_drafts or 03_master`);
}
```

---

## 3. New Behavior

### Types (`src/types/pipeline.ts`)

```typescript
export type PipelineStage =
  | '01_drafts' | '02_adapted' | '03_published';

export type ProjectStatus =
  | 'drafted' | 'adapted' | 'scheduled' | 'published' | 'failed';
```

**Notes:**
- `scheduled` remains as a status but has no corresponding directory stage. An article with status `scheduled` physically resides in `02_adapted/`.
- `StageTransition`, `StageInfo`, `PipelineStatus` interfaces are unchanged structurally but now use the reduced `PipelineStage` type.
- `PipelineStatus.stages` will have 3 entries instead of 6.

### Constants (`src/core/constants.ts`)

```typescript
export const STAGES: PipelineStage[] = [
  '01_drafts', '02_adapted', '03_published',
];

export const STAGE_STATUS_MAP: Record<PipelineStage, ProjectStatus> = {
  '01_drafts': 'drafted',
  '02_adapted': 'adapted',
  '03_published': 'published',
};
```

All other constants in the file (`DATE_REGEX`, `DEFAULT_LLM_MODEL`, `META_FILENAME`, `ASSETS_DIR`, etc.) remain unchanged.

### Zod Schema (`src/types/schemas.ts`)

```typescript
// Support legacy status values during migration via preprocess
const StatusEnum = z.preprocess(
  (val) => {
    if (val === 'inbox' || val === 'master') return 'drafted';
    return val;
  },
  z.enum(['drafted', 'adapted', 'scheduled', 'published', 'failed']),
);

export const ArticleMetaSchema = z.object({
  status: StatusEnum,
  // ... rest unchanged
});
```

The `z.preprocess` ensures that reading old `meta.yaml` files with `status: 'inbox'` or `status: 'master'` does not fail validation. These values are silently mapped to `'drafted'`.

### Filename Parser (`src/core/filename-parser.ts`)

```typescript
export const ADAPTED_STAGES: PipelineStage[] = ['02_adapted', '03_published'];
```

The `isAdaptedStage()`, `parseArticleFilename()`, and `buildArticleFilename()` functions are unchanged in logic -- they just operate on the updated `ADAPTED_STAGES` constant.

### Pipeline Engine (`src/core/pipeline.ts`)

#### `initPipeline()`

No logic change -- it iterates `STAGES` which now has 3 entries. Creates: `01_drafts/`, `02_adapted/`, `03_published/`.

Add migration call at the start:

```typescript
async initPipeline(): Promise<void> {
  await this.migrateLegacyPipeline();
  await Promise.all(
    STAGES.map(stage => fs.ensureDir(path.join(this.workingDir, stage)))
  );
}
```

#### `migrateLegacyPipeline()`

New method. See tech design section 4.1 for full implementation.

#### `findDueArticles()`

```typescript
async findDueArticles(): Promise<string[]> {
  const articles = await this.listArticles('02_adapted');
  if (articles.length === 0) return [];

  const meta = await this.metadata.readProjectMeta();
  const now = new Date();
  const nowIso = now.toISOString();
  const due: string[] = [];

  for (const article of articles) {
    const articleMeta = meta.articles[article];
    // Only consider articles that have been explicitly scheduled
    if (articleMeta?.status !== 'scheduled') continue;
    if (!articleMeta.schedule || articleMeta.schedule <= nowIso) {
      due.push(article);
    }
  }

  return due;
}
```

Key difference from current: current version considers ALL articles in `05_scheduled` as candidates (including those without a schedule date). New version requires `status === 'scheduled'` since `02_adapted` also contains non-scheduled articles.

#### `rollbackArticle()`

No logic change. The method iterates `STAGES` in reverse, which now has 3 entries. Rollback paths:
- `03_published` -> `02_adapted` (status becomes `adapted`)
- `02_adapted` -> `01_drafts` (status becomes `drafted`)
- `01_drafts` -> error

#### `moveArticle()`, `listArticles()`, `getArticleFiles()`, `readArticleContent()`, `writeArticleFile()`, `getArticlePath()`

No logic changes. These methods accept `PipelineStage` parameters, which TypeScript will now enforce as the 3-value union type.

### Refine Command (`src/commands/refine.ts`)

#### `locateArticle()`

```typescript
async function locateArticle(engine: PipelineEngine, safeName: string) {
  const draftPath = engine.getArticlePath('01_drafts', safeName);
  if (await fs.pathExists(draftPath)) {
    return { stage: '01_drafts' as PipelineStage, filename: `${safeName}.md`, filePath: draftPath };
  }
  throw new Error(`Article '${safeName}' not found in 01_drafts`);
}
```

#### `saveContent()`

```typescript
async function saveContent(engine, stage, article, _filename, content) {
  await engine.writeArticleFile(stage, article, content);
  await engine.metadata.writeArticleMeta(article, { status: 'drafted' });
}
```

Status is always `'drafted'` since there is only one pre-adapt stage.

---

## 4. Implementation Steps

1. **Update `src/types/pipeline.ts`**: Change `PipelineStage` and `ProjectStatus` type definitions.

2. **Update `src/types/schemas.ts`**: Change `ArticleMetaSchema` status enum, add `z.preprocess` for legacy migration.

3. **Update `src/core/constants.ts`**: Change `STAGES` and `STAGE_STATUS_MAP`.

4. **Update `src/core/filename-parser.ts`**: Change `ADAPTED_STAGES`.

5. **Update `src/core/pipeline.ts`**:
   - Add `migrateLegacyPipeline()` method.
   - Call migration from `initPipeline()`.
   - Rewrite `findDueArticles()` to filter by `status === 'scheduled'`.

6. **Update `src/commands/refine.ts`**:
   - Simplify `locateArticle()` to check only `01_drafts`.
   - Simplify `saveContent()` to always use `'drafted'` status.

7. **Update all test files** referencing old stage names.

---

## 5. Test Cases

### 5.1 Type / Constant Tests

| # | Test Case | Expected |
|---|-----------|----------|
| C1 | `STAGES` has exactly 3 entries | `['01_drafts', '02_adapted', '03_published']` |
| C2 | `STAGE_STATUS_MAP` maps each stage to correct status | `01_drafts -> drafted`, `02_adapted -> adapted`, `03_published -> published` |
| C3 | `PipelineStage` type rejects old values at compile time | TypeScript error on `'01_inbox'`, `'03_master'`, etc. |
| C4 | `ADAPTED_STAGES` contains `02_adapted` and `03_published` | Array has 2 elements |

### 5.2 Zod Schema Tests

| # | Test Case | Expected |
|---|-----------|----------|
| S1 | ArticleMeta with `status: 'drafted'` validates | Pass |
| S2 | ArticleMeta with `status: 'adapted'` validates | Pass |
| S3 | ArticleMeta with `status: 'scheduled'` validates | Pass |
| S4 | ArticleMeta with `status: 'published'` validates | Pass |
| S5 | ArticleMeta with `status: 'failed'` validates | Pass |
| S6 | ArticleMeta with `status: 'inbox'` validates (legacy) and maps to `'drafted'` | Pass, status becomes `'drafted'` |
| S7 | ArticleMeta with `status: 'master'` validates (legacy) and maps to `'drafted'` | Pass, status becomes `'drafted'` |
| S8 | ArticleMeta with `status: 'unknown'` rejects | Validation error |

### 5.3 Pipeline Engine Tests

| # | Test Case | Expected |
|---|-----------|----------|
| P1 | `initPipeline()` creates 3 directories | `01_drafts/`, `02_adapted/`, `03_published/` exist |
| P2 | `initPipeline()` on legacy project migrates directories | Old dirs renamed, content preserved |
| P3 | `getStatus()` returns 3-stage status object | Keys are `01_drafts`, `02_adapted`, `03_published` |
| P4 | `moveArticle('01_drafts', '02_adapted')` succeeds | File moved, metadata updated |
| P5 | `moveArticle('02_adapted', '03_published')` succeeds | File moved, metadata updated |
| P6 | `findDueArticles()` returns only scheduled articles with due dates | Articles with `status: 'adapted'` not included |
| P7 | `findDueArticles()` returns scheduled article with past date | Article included |
| P8 | `findDueArticles()` skips scheduled article with future date | Article not included |
| P9 | `rollbackArticle()` from `03_published` moves to `02_adapted` | Success |
| P10 | `rollbackArticle()` from `02_adapted` moves to `01_drafts` | Success |
| P11 | `rollbackArticle()` from `01_drafts` throws error | Error: already in first stage |

### 5.4 Migration Tests

| # | Test Case | Expected |
|---|-----------|----------|
| M1 | Fresh project: no legacy dirs | `initPipeline()` creates 3 new dirs, no migration log |
| M2 | Legacy project: all 6 dirs exist | Renamed and merged into 3 dirs |
| M3 | Legacy `01_inbox/` with files | Files moved to `01_drafts/` |
| M4 | Legacy `03_master/` with files | Files moved to `01_drafts/` |
| M5 | Legacy `05_scheduled/` with files | Files moved to `02_adapted/` |
| M6 | Metadata `status: 'inbox'` in legacy meta | Updated to `'drafted'` |
| M7 | Metadata `status: 'master'` in legacy meta | Updated to `'drafted'` |
| M8 | Migration is idempotent | Running twice produces same result |
| M9 | File collision during merge (same filename in inbox and drafts) | Inbox file skipped, drafts file preserved |

### 5.5 Refine Command Tests

| # | Test Case | Expected |
|---|-----------|----------|
| R1 | `locateArticle()` finds article in `01_drafts` | Returns correct path |
| R2 | `locateArticle()` with article not in `01_drafts` | Throws error |
| R3 | `saveContent()` sets status to `'drafted'` | Metadata updated correctly |
| R4 | Refine writes updated content to `01_drafts` | File updated in place |

### 5.6 Filename Parser Tests

| # | Test Case | Expected |
|---|-----------|----------|
| F1 | `parseArticleFilename('post.devto.md', '02_adapted')` | `{ article: 'post', platform: 'devto' }` |
| F2 | `parseArticleFilename('post.md', '01_drafts')` | `{ article: 'post', platform: null }` |
| F3 | `isAdaptedStage('02_adapted')` | `true` |
| F4 | `isAdaptedStage('03_published')` | `true` |
| F5 | `isAdaptedStage('01_drafts')` | `false` |
