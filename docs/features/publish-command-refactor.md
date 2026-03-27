# Feature Spec: Publish Command Refactor

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Feature**  | Publish Command -- Read from Adapted     |
| **Parent**   | [Tech Design](../pipeline-simplification/tech-design.md) |
| **Depends**  | [Pipeline Core](pipeline-simplification-core.md), [Schedule](schedule-metadata-only.md) |
| **Status**   | Implemented                              |
| **Date**     | 2026-03-27                               |

---

## 1. Scope

Refactor the `reach publish` command to read content from `02_adapted/` instead of `05_scheduled/` and archive published articles to `03_published/` instead of `06_sent/`. The three publish modes (batch, specific article, external file) all need stage reference updates.

### Files Affected

| File | Change Type |
|------|-------------|
| `src/commands/publish.ts` | Modify stage references throughout |
| `src/mcp/tools.ts` | Update `PublishToolSchema` description |
| `tests/unit/commands/commands.test.ts` | Update publish tests |
| `tests/integration/e2e-pipeline.test.ts` | Update E2E test |

---

## 2. Current Behavior

### Three Publish Modes

1. **Batch publish** (`reach publish`): Calls `engine.findDueArticles()` to get articles from `05_scheduled/` with due dates. Publishes each, then moves to `06_sent/`.

2. **Specific article** (`reach publish <article>`): Checks `05_scheduled/` for the named article. Publishes platform files, then moves to `06_sent/`.

3. **External file** (`reach publish ./file.md -p devto`): Reads external file, publishes directly. With `--track`, copies to `06_sent/`.

### Key Stage References

```typescript
// Batch: findDueArticles scans 05_scheduled
const dueArticles = await engine.findDueArticles();

// Specific: check existence in 05_scheduled
const articles = await engine.listArticles('05_scheduled');

// Read content from 05_scheduled
const files = await engine.getArticleFiles(article, '05_scheduled');
engine.getArticlePath('05_scheduled', article, parsed.platform);

// Archive to 06_sent
await engine.moveArticle(article, '05_scheduled', '06_sent');

// External file tracking
const sentPath = path.join(engine.projectDir, '06_sent', sentFilename);
```

---

## 3. New Behavior

### Stage Reference Changes

All occurrences of `'05_scheduled'` change to `'02_adapted'`.
All occurrences of `'06_sent'` change to `'03_published'`.

### `publishPipelineArticle()` Changes

```typescript
async function publishPipelineArticle(engine, articleName, options) {
  // BEFORE: const articles = await engine.listArticles('05_scheduled');
  // AFTER:
  const articles = await engine.listArticles('02_adapted');
  if (!articles.includes(articleName)) {
    throw new ReachforgeError(
      `Article "${articleName}" not found in 02_adapted`,
      'Article must be in the adapted stage. Use: reach status to check.',
    );
  }

  // Read content from 02_adapted
  const files = await engine.getArticleFiles(articleName, '02_adapted');
  // ...
  for (const file of files) {
    const parsed = parseArticleFilename(file, '02_adapted');
    if (parsed.platform) {
      contentByPlatform[parsed.platform] = await fs.readFile(
        engine.getArticlePath('02_adapted', articleName, parsed.platform), 'utf-8'
      );
    }
  }

  // ... publish logic unchanged ...

  // Archive to 03_published
  if (allPlatformsDone) {
    await engine.moveArticle(articleName, '02_adapted', '03_published');
    console.log(chalk.green(`Published and archived: ${articleName}`));
  }
}
```

### `publishAllDue()` Changes

```typescript
async function publishAllDue(engine, options) {
  // findDueArticles() already updated in pipeline engine to scan 02_adapted
  const dueArticles = await engine.findDueArticles();

  for (const article of dueArticles) {
    // Read from 02_adapted
    const contentByPlatform = await readScheduledContent(engine, article, platformFilter);

    // ... publish logic unchanged ...

    // Archive to 03_published
    if (anySuccess) {
      await engine.moveArticle(article, '02_adapted', '03_published');
    }
  }
}
```

### `readScheduledContent()` Changes

```typescript
// BEFORE
async function readScheduledContent(engine, article, platformFilter) {
  const files = await engine.getArticleFiles(article, '05_scheduled');
  // ...
  engine.getArticlePath('05_scheduled', article, parsed.platform);
}

// AFTER
async function readScheduledContent(engine, article, platformFilter) {
  const files = await engine.getArticleFiles(article, '02_adapted');
  // ...
  engine.getArticlePath('02_adapted', article, parsed.platform);
}
```

Consider renaming `readScheduledContent` to `readAdaptedContent` since it no longer reads from a "scheduled" directory. The function name was misleading even before since it reads platform-adapted content.

### External File Tracking Changes

```typescript
// BEFORE
const sentPath = path.join(engine.projectDir, '06_sent', sentFilename);

// AFTER
const sentPath = path.join(engine.projectDir, '03_published', sentFilename);
```

### Partial Publish Behavior

Current behavior: when some platforms succeed and others fail, the article remains in `05_scheduled` with per-platform status recorded in metadata. The user can re-run `reach publish <article>` to retry failed platforms (resume support).

New behavior: identical logic, but the article remains in `02_adapted`. Resume support works the same way -- `reach publish <article>` checks existing platform statuses in metadata and skips already-succeeded platforms.

One subtle change: in the current system, a "scheduled" article is distinguishable from an "adapted" article by directory (`05_scheduled` vs `04_adapted`). In the new system, both live in `02_adapted`. The distinction is in metadata:
- `status: 'adapted'` -- ready for scheduling or direct publish.
- `status: 'scheduled'` -- has a schedule date, batch publish will pick it up.

When `reach publish <article>` is called explicitly (not batch mode), it should work for both `adapted` and `scheduled` articles. The status check in `publishPipelineArticle()` should not filter by status -- it should only check that platform files exist in `02_adapted`.

### MCP Tool Updates

```typescript
// BEFORE
'reach.publish': {
  description: '...publish all due articles from 05_scheduled...(2) article name -- publish a specific pipeline article...',
},

// AFTER
'reach.publish': {
  description: 'Publish content to platforms. Three modes: ' +
    '(1) no article -- publish all scheduled articles from 02_adapted that are due; ' +
    '(2) article name -- publish a specific article from 02_adapted with optional platform filter; ' +
    '(3) file path -- publish an external file directly. ' +
    'Published articles are archived to 03_published.',
  inputSchema: jsonSchema(PublishToolSchema),
},
```

Update `PublishToolSchema` field descriptions:

```typescript
export const PublishToolSchema = z.object({
  article: z.string().optional().describe(
    'Article name (from 02_adapted) or file path (external). Omit to publish all due scheduled articles.'
  ),
  platforms: z.string().optional().describe(
    'Comma-separated platform filter (e.g., "devto,hashnode"). Required for external files.'
  ),
  track: z.boolean().optional().describe(
    'If true, track external file in pipeline (copy to 03_published, record in meta.yaml).'
  ),
  dryRun: z.boolean().optional().describe(
    'If true, preview what would be published without sending to platforms.'
  ),
});
```

---

## 4. Implementation Steps

1. **Global find-and-replace in `src/commands/publish.ts`**:
   - `'05_scheduled'` -> `'02_adapted'` (all occurrences)
   - `'06_sent'` -> `'03_published'` (all occurrences)

2. **Rename `readScheduledContent`** to `readAdaptedContent` for clarity.

3. **Update error messages** that reference `05_scheduled` to reference `02_adapted`.

4. **Update `publishPipelineArticle()`**: Ensure it works for articles with either `adapted` or `scheduled` status. Do not filter by status -- only check file existence.

5. **Update MCP tools**: Update `PublishToolSchema` and tool description.

6. **Update console output** messages referencing old stage names.

7. **Update tests**.

---

## 5. Test Cases

### 5.1 Batch Publish

| # | Test Case | Expected |
|---|-----------|----------|
| P1 | No due articles | "No content due for publishing today" |
| P2 | One scheduled article with past date | Published and archived to `03_published` |
| P3 | Multiple due articles | All published and archived |
| P4 | Scheduled article with future date | Not published |
| P5 | Adapted but not scheduled article | Not picked up by batch publish |
| P6 | Batch publish with `--platforms` filter | Only specified platforms published |
| P7 | Dry run batch | No actual publishing, preview output |

### 5.2 Specific Article Publish

| # | Test Case | Expected |
|---|-----------|----------|
| P8 | Publish article in `02_adapted` | Published and archived to `03_published` |
| P9 | Publish article not in `02_adapted` | Error: not found |
| P10 | Publish with `--platforms devto` filter | Only devto published |
| P11 | Publish adapted article (not scheduled) | Works -- explicit publish does not require scheduling |
| P12 | Publish scheduled article explicitly | Works -- scheduling is not a gate for explicit publish |
| P13 | Partial publish (some platforms fail) | Article remains in `02_adapted`, metadata records per-platform results |
| P14 | Resume after partial publish | Already-succeeded platforms skipped |
| P15 | All platforms succeed | Article moved to `03_published` |

### 5.3 External File Publish

| # | Test Case | Expected |
|---|-----------|----------|
| P16 | External file with `--platforms` | Published directly, no pipeline involvement |
| P17 | External file with `--track` | Published and copied to `03_published` |
| P18 | External file without `--platforms` and no project config | Error: no platforms specified |

### 5.4 Locking

| # | Test Case | Expected |
|---|-----------|----------|
| P19 | Concurrent publish on same article | Second attempt sees lock, skips |
| P20 | Stale lock (dead PID) | Lock reclaimed, publish proceeds |

### 5.5 JSON Output

| # | Test Case | Expected |
|---|-----------|----------|
| P21 | `--json` batch publish | JSON envelope with published/failed/skipped arrays |
| P22 | `--json` specific article | JSON envelope with platform results |

### 5.6 Validation

| # | Test Case | Expected |
|---|-----------|----------|
| P23 | Content fails validation | Article skipped, error details shown |
| P24 | Content passes validation | Proceeds to publish |

### 5.7 Draft Mode

| # | Test Case | Expected |
|---|-----------|----------|
| P25 | `--draft` flag | Platforms that support draft mode publish as draft |
