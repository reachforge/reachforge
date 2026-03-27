# Feature Spec: Go Command Simplification

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Feature**  | Go Command -- 3-Step Flow                |
| **Parent**   | [Tech Design](../pipeline-simplification/tech-design.md) |
| **Depends**  | [Draft](draft-command-refactor.md), [Adapt](adapt-command-refactor.md), [Publish](publish-command-refactor.md) |
| **Status**   | Implemented                              |
| **Date**     | 2026-03-27                               |

---

## 1. Scope

Simplify the `reach go` command from a 6-step orchestration to a 3-step flow: draft -> adapt -> publish. Remove the inbox creation step, approve step, and the schedule-as-file-move step. The schedule option sets metadata only.

### Files Affected

| File | Change Type |
|------|-------------|
| `src/commands/go.ts` | Major rewrite |
| `src/mcp/tools.ts` | Update `GoToolSchema` description |
| `tests/unit/commands/go.test.ts` | Major update |

---

## 2. Current Behavior

```typescript
const STEPS = [
  'Creating inbox item',
  'Generating AI draft',
  'Approving draft',
  'Adapting for platforms',
  'Scheduling',
  'Publishing',
] as const;

async function goCommand(engine, prompt, options) {
  // Step 1: Create inbox item
  await engine.writeArticleFile('01_inbox', slug, prompt);

  // Step 2: Draft (inbox -> drafts)
  await draftCommand(engine, slug);

  // Step 3: Approve (drafts -> master)
  await approveCommand(engine, slug);

  // Step 4: Adapt (master -> adapted)
  await adaptCommand(engine, slug);

  // Step 5: Schedule (adapted -> scheduled)
  await scheduleCommand(engine, slug, scheduleDate);

  // Step 6: Publish (scheduled -> sent)
  if (!options.schedule) {
    await publishCommand(engine, { ... });
  }
}
```

Step counter shows `[x/6]`. Error messages reference "step X/6".

---

## 3. New Behavior

```typescript
const STEPS = [
  'Generating AI draft',
  'Adapting for platforms',
  'Publishing',
] as const;

export async function goCommand(
  engine: PipelineEngine,
  prompt: string,
  options: GoOptions = {},
): Promise<void> {
  let slug = options.name ?? slugify(prompt);
  validateArticleName(slug);

  if (options.schedule && !validateScheduleDate(options.schedule)) {
    throw new InvalidDateError(options.schedule);
  }

  await engine.initPipeline();

  // Resolve slug collision
  if (!options.name) {
    const existing = await engine.metadata.readArticleMeta(slug);
    if (existing) {
      let suffix = 2;
      while (await engine.metadata.readArticleMeta(`${slug}-${suffix}`)) {
        suffix++;
      }
      slug = `${slug}-${suffix}`;
    }
  }

  const log = (msg: string) => { if (!options.json) console.log(msg); };
  let currentStep = 0;

  const step = (i: number) => {
    currentStep = i;
    log(chalk.dim(`  [${i + 1}/3] ${STEPS[i]}...`));
  };

  log(chalk.bold(`\n  reach go: "${prompt}"\n`));

  try {
    // Step 1: Draft (directly from prompt, no inbox)
    step(0);
    await draftCommand(engine, prompt, { name: slug });

    // Step 2: Adapt (reads from 01_drafts, writes to 02_adapted)
    step(1);
    await adaptCommand(engine, slug);

    // Step 3: Publish or Schedule
    step(2);
    if (options.schedule) {
      // Schedule for later (metadata only)
      await scheduleCommand(engine, slug, options.schedule);
      log(chalk.dim(`    Scheduled for ${options.schedule}, will publish when due.`));
    } else {
      // Publish immediately (reads from 02_adapted, archives to 03_published)
      await publishCommand(engine, {
        article: slug,
        dryRun: options.dryRun,
        draft: options.draft,
        config: options.config,
      });
    }
  } catch (err) {
    const stepName = STEPS[currentStep];
    log(chalk.red(`\n  Failed at step ${currentStep + 1}/3: ${stepName}`));
    log(chalk.yellow(`  Article "${slug}" is partially created. Resume manually from this stage.`));
    throw err;
  }

  if (options.json) {
    process.stdout.write(jsonSuccess('go', {
      slug,
      prompt,
      scheduleDate: options.schedule ?? null,
      published: !options.schedule,
    }));
    return;
  }

  log('');
  if (options.schedule) {
    log(chalk.green(`  Done! "${slug}" scheduled for ${options.schedule}. Run \`reach publish\` when due.`));
  } else {
    log(chalk.green(`  Done! "${slug}" published.`));
  }
}
```

### Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| Step count | 6 | 3 |
| Inbox creation | Yes (`engine.writeArticleFile('01_inbox', ...)`) | No |
| Draft call | `draftCommand(engine, slug)` (reads from inbox) | `draftCommand(engine, prompt, { name: slug })` (prompt is input) |
| Approve call | `approveCommand(engine, slug)` | Removed |
| Adapt call | `adaptCommand(engine, slug)` | Same (but reads from `01_drafts` now) |
| Schedule call | `scheduleCommand(engine, slug, date)` (always, moves files) | Only when `options.schedule` is set (metadata only) |
| Publish call | `publishCommand(engine, { ... })` (batch, no article arg) | `publishCommand(engine, { article: slug, ... })` (explicit article) |
| Error message | "Failed at step X/6" | "Failed at step X/3" |

### Removed Import

```typescript
// BEFORE
import { approveCommand } from './approve.js';

// AFTER: remove this import
```

### Publish Call Change

Previously, `go` called `publishCommand` without an article argument, relying on batch mode to find the just-scheduled article in `05_scheduled`. Now it passes the article name explicitly:

```typescript
// BEFORE
await publishCommand(engine, {
  dryRun: options.dryRun,
  draft: options.draft,
  config: options.config,
});

// AFTER
await publishCommand(engine, {
  article: slug,
  dryRun: options.dryRun,
  draft: options.draft,
  config: options.config,
});
```

This is more reliable and does not depend on the batch publish finding the article by schedule date.

### MCP Tool Updates

```typescript
// BEFORE
'reach.go': {
  description: 'Full auto pipeline: creates article from prompt, drafts via AI, approves, adapts for all configured platforms, schedules, and publishes. Use "name" param for explicit article name...',
},

// AFTER
'reach.go': {
  description: 'Full auto pipeline: generates AI draft from prompt, adapts for all configured platforms, and publishes. ' +
    '3-step flow: draft -> adapt -> publish. Use "name" for explicit article name. Use "schedule" to defer publishing.',
  inputSchema: jsonSchema(GoToolSchema),
},
```

---

## 4. Implementation Steps

1. **Update `src/commands/go.ts`**:
   - Change `STEPS` array from 6 entries to 3.
   - Remove inbox write step.
   - Remove `approveCommand` import and call.
   - Change `draftCommand` call to pass prompt as input with `name` option.
   - Remove unconditional `scheduleCommand` call; only call when `options.schedule` is set.
   - Change `publishCommand` call to pass explicit `article: slug`.
   - Update step counter from `/6` to `/3`.
   - Update error messages.

2. **Update MCP tools**: Update `reach.go` description.

3. **Update tests**.

---

## 5. Test Cases

### 5.1 Full Flow (No Schedule)

| # | Test Case | Expected |
|---|-----------|----------|
| G1 | `reach go "write about TypeScript"` | Draft in `01_drafts`, adapted in `02_adapted`, published to `03_published` |
| G2 | Step counter shows `[1/3]`, `[2/3]`, `[3/3]` | Correct step numbering |
| G3 | Success message | `Done! "write-about-typescript" published.` |

### 5.2 Scheduled Flow

| # | Test Case | Expected |
|---|-----------|----------|
| G4 | `reach go "prompt" --schedule 2026-04-01` | Draft + adapt complete, scheduled via metadata |
| G5 | Schedule deferred publish | Article in `02_adapted` with `status: 'scheduled'` |
| G6 | Success message | `Done! "..." scheduled for 2026-04-01.` |

### 5.3 Name Override

| # | Test Case | Expected |
|---|-----------|----------|
| G7 | `reach go "prompt" --name my-post` | Article name is `my-post` |
| G8 | Slug collision without `--name` | Auto-appends `-2`, `-3`, etc. |

### 5.4 Error Handling

| # | Test Case | Expected |
|---|-----------|----------|
| G9 | Draft fails (LLM error) | "Failed at step 1/3: Generating AI draft" |
| G10 | Adapt fails | "Failed at step 2/3: Adapting for platforms" |
| G11 | Publish fails | "Failed at step 3/3: Publishing" |
| G12 | Invalid schedule date | `InvalidDateError` before any steps run |

### 5.5 Options Pass-Through

| # | Test Case | Expected |
|---|-----------|----------|
| G13 | `--dry-run` flag | Publish step is dry run |
| G14 | `--draft` flag | Platforms publish as draft |
| G15 | `--json` flag | JSON envelope output |

### 5.6 Removed Behavior

| # | Test Case | Expected |
|---|-----------|----------|
| G16 | No `01_inbox` directory created | `01_inbox` does not exist after `go` |
| G17 | No `03_master` directory created | `03_master` does not exist |
| G18 | No `approveCommand` call | Approve import not used |
| G19 | No unconditional schedule | Without `--schedule`, no schedule metadata written |
