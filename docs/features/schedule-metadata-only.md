# Feature Spec: Schedule as Metadata-Only Operation

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Feature**  | Schedule Command -- Metadata Only        |
| **Parent**   | [Tech Design](../pipeline-simplification/tech-design.md) |
| **Depends**  | [Pipeline Core](pipeline-simplification-core.md) |
| **Status**   | Implemented                              |
| **Date**     | 2026-03-27                               |

---

## 1. Scope

Refactor the `reach schedule` command from a file-move operation (moving files from `04_adapted/` to `05_scheduled/`) to a pure metadata operation (setting `status: 'scheduled'` and `schedule` date in `meta.yaml`). Files remain in `02_adapted/`. The `05_scheduled/` directory is eliminated.

### Files Affected

| File | Change Type |
|------|-------------|
| `src/commands/schedule.ts` | Major rewrite (remove file move) |
| `src/mcp/tools.ts` | Update `ScheduleToolSchema` description |
| `tests/unit/commands/commands.test.ts` | Update schedule tests |

---

## 2. Current Behavior

```typescript
export async function scheduleCommand(engine, article, date, options) {
  // ... validation ...

  // Move platform files from 04_adapted to 05_scheduled
  await engine.moveArticle(safeName, '04_adapted', '05_scheduled');

  // Store schedule in meta.yaml
  await engine.metadata.writeArticleMeta(safeName, {
    status: 'scheduled',
    schedule: normalizedDate,
  });

  console.log(chalk.magenta(`Scheduled: "${safeName}" for ${normalizedDate}`));
}
```

### Key Characteristics
- Files physically move from `04_adapted/` to `05_scheduled/`.
- If the article is not in `04_adapted/`, the move fails with `ProjectNotFoundError`.
- Dry run shows what would happen but does not move.
- After scheduling, `reach publish` looks in `05_scheduled/` for due articles.

---

## 3. New Behavior

```typescript
export async function scheduleCommand(
  engine: PipelineEngine,
  article: string,
  date: string,
  options: { dryRun?: boolean; json?: boolean } = {},
): Promise<void> {
  const safeName = sanitizePath(article);

  if (!validateScheduleDate(date)) {
    throw new InvalidDateError(date);
  }

  await engine.initPipeline();
  const normalizedDate = normalizeScheduleDate(date);

  // Verify article exists in 02_adapted
  const files = await engine.getArticleFiles(safeName, '02_adapted');
  if (files.length === 0) {
    throw new ReachforgeError(
      `Article "${safeName}" not found in 02_adapted`,
      'Run reach adapt first to create platform versions.',
    );
  }

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(jsonSuccess('schedule', {
        article: safeName,
        date: normalizedDate,
        stage: '02_adapted' as const,
      }));
      return;
    }
    console.log(chalk.yellow(`[DRY RUN] Would schedule: "${safeName}" for ${normalizedDate} (metadata only)`));
    return;
  }

  // Metadata-only operation: no file move
  await engine.metadata.writeArticleMeta(safeName, {
    status: 'scheduled',
    schedule: normalizedDate,
  });

  if (options.json) {
    process.stdout.write(jsonSuccess('schedule', {
      article: safeName,
      date: normalizedDate,
      stage: '02_adapted' as const,
    }));
    return;
  }

  console.log(chalk.magenta(`Scheduled: "${safeName}" for ${normalizedDate}`));
}
```

### Key Changes

1. **No `engine.moveArticle()` call.** Files stay in `02_adapted/`.
2. **Existence check** uses `engine.getArticleFiles(safeName, '02_adapted')` instead of relying on `moveArticle()` to detect missing articles.
3. **JSON output** `stage` field is `'02_adapted'` instead of `'05_scheduled'`.
4. **Console output** remains similar but the dry run message clarifies "metadata only".

### How `reach publish` Finds Scheduled Articles

After this change, `reach publish` (batch mode) calls `engine.findDueArticles()`, which is updated in the core spec to:
1. List all articles in `02_adapted/`.
2. Filter by `meta.status === 'scheduled'` AND `meta.schedule <= now`.

This means articles with status `'adapted'` (not scheduled) are not picked up by batch publish. They can still be published explicitly with `reach publish <article>`.

### Reschedule

To reschedule, simply run `reach schedule <article> <new-date>` again -- it overwrites the existing schedule.

Use `--clear` to unschedule:

```
reach schedule <article> --clear
```

This resets the status to `adapted` and removes the `schedule` field from `meta.yaml`. Files remain in `02_adapted/`. Idempotent — safe to call on articles that are not scheduled.

### MCP Tool Updates

```typescript
// BEFORE
'reach.schedule': {
  description: 'Schedule a specific article for publishing. Moves platform files from 04_adapted to 05_scheduled...',
  inputSchema: jsonSchema(ScheduleToolSchema),
},

// AFTER
'reach.schedule': {
  description: 'Schedule a specific article for publishing. Sets the schedule date in meta.yaml without moving files. ' +
    'The article must be in 02_adapted. Batch publish (reach publish with no args) will pick it up when the date is due.',
  inputSchema: jsonSchema(ScheduleToolSchema),
},
```

The `ScheduleToolSchema` description updates:

```typescript
// BEFORE
export const ScheduleToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 04_adapted to schedule'),
  date: z.string().optional().describe('Publish date/time...'),
});

// AFTER
export const ScheduleToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 02_adapted to schedule'),
  date: z.string().optional().describe('Publish date/time: YYYY-MM-DD, YYYY-MM-DDTHH:MM, or YYYY-MM-DDTHH:MM:SS. Defaults to today (immediate on next batch publish)'),
  clear: z.boolean().optional().describe('If true, remove the schedule and revert status to adapted'),
});
```

---

## 4. Implementation Steps

1. **Update `src/commands/schedule.ts`**:
   - Remove `engine.moveArticle()` call.
   - Add existence check via `engine.getArticleFiles()` against `02_adapted`.
   - Update stage references in JSON output.
   - Add `--clear` option support.

2. **Update CLI registration**:
   - Add `--clear` option to the schedule command.

3. **Update `src/mcp/tools.ts`**:
   - Update `ScheduleToolSchema` to add `clear` field.
   - Update tool description.

4. **Update tests**.

---

## 5. Test Cases

### 5.1 Core Scheduling

| # | Test Case | Expected |
|---|-----------|----------|
| S1 | Schedule article that exists in `02_adapted` | `meta.yaml` updated with `status: 'scheduled'`, `schedule: date` |
| S2 | Schedule article not in `02_adapted` | Error: article not found |
| S3 | Files remain in `02_adapted` after scheduling | No file move occurred |
| S4 | Re-schedule with new date | Schedule date updated in metadata |

### 5.2 Date Validation

| # | Test Case | Expected |
|---|-----------|----------|
| S5 | Valid date `2026-04-01` | Accepted |
| S6 | Valid datetime `2026-04-01T10:00` | Accepted |
| S7 | Invalid date `not-a-date` | `InvalidDateError` |

### 5.3 Dry Run

| # | Test Case | Expected |
|---|-----------|----------|
| S8 | `--dry-run` flag | No metadata change, message shows "metadata only" |
| S9 | `--dry-run --json` | JSON output with article, date, stage |

### 5.4 Clear / Unschedule

| # | Test Case | Expected |
|---|-----------|----------|
| S10 | `--clear` on scheduled article | Status reverted to `'adapted'`, schedule removed |
| S11 | `--clear` on non-scheduled article | Status set to `'adapted'` (idempotent) |

### 5.5 JSON Output

| # | Test Case | Expected |
|---|-----------|----------|
| S12 | `--json` flag | JSON envelope with `stage: '02_adapted'` |

### 5.6 Integration with Publish

| # | Test Case | Expected |
|---|-----------|----------|
| S13 | Schedule then batch publish | `findDueArticles()` includes the scheduled article |
| S14 | Adapted but not scheduled article | Not picked up by batch publish |
| S15 | Scheduled with future date | Not picked up by batch publish until date is due |
