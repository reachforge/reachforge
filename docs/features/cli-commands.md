# Feature Spec: CLI Commands

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| CLI Command Handlers                       |
| **Directory**| `src/commands/`                            |
| **Priority** | P0                                         |
| **SRS Refs** | FR-DASH-001 through FR-DASH-003, FR-DRAFT-001 through FR-DRAFT-007, FR-ADAPT-001 through FR-ADAPT-007, FR-LIFE-001 through FR-LIFE-003 |
| **NFR Refs** | NFR-PERF-002, NFR-USAB-001, NFR-USAB-002  |

---

## 1. Purpose and Scope

Command handlers are thin adapter modules that bridge Commander CLI argument parsing with core pipeline operations. Each handler:
1. Validates CLI input using Zod schemas
2. Displays progress messages (NFR-PERF-002)
3. Calls core pipeline / LLM / provider methods
4. Formats output using chalk for terminal display
5. Handles errors with user-facing messages (NFR-USAB-001)

Command handlers do NOT contain business logic. All logic lives in `core/`, `llm/`, or `providers/`.

## 2. Files

| File | Command | Max Lines |
|------|---------|-----------|
| `commands/status.ts` | `reach status` | 80 |
| `commands/draft.ts` | `reach draft <source>` | 100 |
| `commands/adapt.ts` | `reach adapt <article>` | 120 |
| `commands/schedule.ts` | `reach schedule <article> <date>` | 80 |
| `commands/publish.ts` | `reach publish` | 120 |
| `commands/watch.ts` | `reach watch` | 100 |
| `commands/mcp.ts` | `reach mcp` | 60 |
| `commands/analytics.ts` | `reach analytics` | 100 |

## 3. TypeScript Interfaces

```typescript
/**
 * Common interface for all command handlers.
 * Each command exports a function that registers itself with Commander.
 */
export interface CommandRegistrar {
  (program: Command, context: CommandContext): void;
}

export interface CommandContext {
  pipeline: PipelineEngine;
  llm: LLMProvider;
  providerLoader: ProviderLoader;
  config: ConfigManager;
}
```

## 4. Method Signatures

```typescript
// commands/status.ts
export function registerStatusCommand(program: Command, ctx: CommandContext): void;

// commands/draft.ts
export function registerDraftCommand(program: Command, ctx: CommandContext): void;

// commands/adapt.ts
export function registerAdaptCommand(program: Command, ctx: CommandContext): void;

// commands/schedule.ts
export function registerScheduleCommand(program: Command, ctx: CommandContext): void;

// commands/publish.ts
export function registerPublishCommand(program: Command, ctx: CommandContext): void;

// commands/watch.ts
export function registerWatchCommand(program: Command, ctx: CommandContext): void;

// commands/mcp.ts
export function registerMcpCommand(program: Command, ctx: CommandContext): void;

// commands/analytics.ts
export function registerAnalyticsCommand(program: Command, ctx: CommandContext): void;
```

## 5. Logic Steps

### Status Command

1. Call `pipeline.getStatus()` to get pipeline state
2. Print header: "reachforge Content Factory Dashboard" (chalk.blue.bold)
3. For each stage in STAGES:
   a. If count > 0: print green checkmark icon, stage name, yellow count
   b. If count == 0: print gray circle icon, stage name, gray "0"
   c. For each item in stage: print indented item name (chalk.dim)
4. If `dueToday.length > 0`: print "Due today: {count} items" in yellow
5. Exit 0

### Draft Command

1. Parse `source` argument from CLI
2. Validate with `DraftParamsSchema.parse({ source })` — on ZodError, print validation message to stderr, exit 1
3. Print progress: "Generating AI draft for '{source}'..." (chalk.cyan)
4. Call `pipeline.initPipeline()`
5. Resolve source path: `01_inbox/<source>`
6. Check source exists — on missing: print "Source '{source}' not found in 01_inbox", exit 1
7. Read source content:
   a. If source is a file: read file contents
   b. If source is a directory: find first `.md` or `.txt` file, read its contents
   c. If directory has no matching files: use source name as content string
8. Call `llm.generate(content, {})` — on LLMApiKeyError: print key error message, exit 1
9. Create draft directory: `02_drafts/<projectName>/`
10. Write `draft.md` with LLM response content
11. Write `meta.yaml` with `{ article: source, status: 'drafted', created_at: now }`
12. Print success: "Draft generated! Please check 02_drafts/{projectName}" (chalk.green)
13. Exit 0

### Adapt Command

1. Parse `article` argument and `--force`, `--platforms` options
2. Validate with `AdaptParamsSchema`
3. Print progress: "Starting AI adaptation for '{article}'..." (chalk.cyan)
4. Call `pipeline.initPipeline()`
5. Resolve master path: `03_master/<article>/master.md`
6. Check master exists — on missing: print error, exit 1
7. Read master content
8. Determine target platforms:
   a. If `--platforms` provided: split by comma
   b. Else if meta.yaml has `adapted_platforms`: use those
   c. Else: use default platform list from config
9. Create adapted directory: `04_adapted/<article>/platform_versions/`
10. For each platform:
    a. Check if `<platform>.md` already exists
    b. If exists and `--force` not set: print skip message, continue
    c. Call `llm.adapt(content, { platform })` — on error: print warning, record failure, continue
    d. Write result to `platform_versions/<platform>.md`
11. Write `meta.yaml` with `{ article, status: 'adapted', adapted_platforms: [...successful] }`
12. Print success with list of adapted platforms (chalk.green)
13. Exit 0

### Schedule Command

1. Parse `article` and `date` arguments
2. Validate with `ScheduleParamsSchema` — includes calendar date validation
3. Call `pipeline.initPipeline()`
4. Compute new name: `${date}-${article}`
5. Call `pipeline.moveProject(article, '04_adapted', '05_scheduled', newName)`
6. Print confirmation: "Scheduled: '{article}' moved to 05_scheduled as '{newName}'" (chalk.magenta)
7. Exit 0

### Publish Command

1. Parse `--publish-live` option
2. Call `pipeline.initPipeline()`
3. Call `pipeline.findDueProjects()` to get due items
4. If no due items: print "No content due for publishing today." (chalk.gray), exit 0
5. Load providers via `providerLoader.listProviders()`
6. For each due project:
   a. Read project's `adapted_platforms` from meta.yaml
   b. Get matching providers via `providerLoader.getProvidersForProject(platforms)`
   c. Call `pipeline.publishProject(project, providers, { publishLive })`
   d. For each result:
      - Success: print "Published to {platform}: {url}" (chalk.green)
      - Failed: print "Failed on {platform}: {error}" (chalk.red)
7. Exit 0

### Watch Command

1. Parse `--interval` option, validate with `WatchParamsSchema`
2. Print "reachforge Daemon is now watching..." (chalk.blue.bold)
3. Register SIGTERM/SIGINT handlers:
   a. Set `shuttingDown = true`
   b. Wait for in-progress publish to complete
   c. Print "Watcher shutting down gracefully."
   d. Exit 0
4. Define `tick()` function:
   a. Print timestamp and "Checking..." (chalk.dim)
   b. Run publish logic (same as Publish Command steps 3-6)
   c. Log results to `reachforge-watcher.log`
5. Execute first `tick()` immediately
6. Set interval for subsequent ticks at configured interval
7. Run indefinitely until signal received

## 6. Error Handling

| Error | CLI Output | Exit Code |
|-------|-----------|-----------|
| Zod validation failure | "Error: {zod_error.issues[0].message}" to stderr | 1 |
| Source not found | "Error: Source '{source}' not found in 01_inbox" to stderr | 1 |
| Master not found | "Error: Master article not found at 03_master/{article}/master.md" to stderr | 1 |
| API key missing | "Error: {PROVIDER}_API_KEY is not set. Set it in your .env file or export it as an environment variable." to stderr | 1 |
| LLM API failure | "Error: AI generation failed: {details}" to stderr | 1 |
| Project not found | "Error: Project '{name}' not found in {stage}." to stderr | 1 |
| Project already exists | "Error: Project already exists in {stage}: {name}." to stderr | 1 |
| Filesystem error | "Error: Filesystem {operation} failed for {path}: {details}" to stderr | 1 |

## 7. Test Scenarios

1. `status` command outputs correct stage counts for populated pipeline
2. `status` command shows green icons for non-empty stages, gray for empty
3. `draft` command rejects empty source name with validation error
4. `draft` command reads file from 01_inbox and calls LLM
5. `draft` command reads directory, finding first .md file
6. `draft` command shows progress message before LLM call
7. `draft` command exits 1 with message when source not found
8. `draft` command exits 1 with message when API key missing
9. `adapt` command generates platform versions for default platforms
10. `adapt` command respects `--platforms` flag to limit platforms
11. `adapt` command skips existing files without `--force`
12. `adapt` command overwrites existing files with `--force`
13. `adapt` command handles partial LLM failure gracefully
14. `schedule` command moves project with date prefix
15. `schedule` command rejects invalid date format
16. `schedule` command rejects impossible dates (e.g., Feb 30)
17. `publish` command publishes due items and displays URLs
18. `publish` command shows "no content due" when nothing is scheduled
19. `publish` command handles partial platform failures
20. `watch` command runs tick at configured interval
21. `watch` command handles SIGTERM gracefully

## 8. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `core/pipeline.ts` | Imports from | Pipeline operations |
| `llm/types.ts` | Imports from | LLM provider interface |
| `providers/loader.ts` | Imports from | Provider discovery |
| `types/schemas.ts` | Imports from | Zod validation schemas |
| `types/errors.ts` | Imports from | Error type checking |
| `commander` | npm dependency | CLI framework |
| `chalk` | npm dependency | Terminal colors |
| `index.ts` | Imported by | Entry point registers all commands |

---

*SRS Traceability: FR-DASH-001 through FR-DASH-003 (status), FR-DRAFT-001 through FR-DRAFT-007 (draft), FR-ADAPT-001 through FR-ADAPT-007 (adapt), FR-LIFE-001 through FR-LIFE-003 (schedule), NFR-PERF-002 (progress indicator), NFR-USAB-001 (actionable errors), NFR-USAB-002 (help text).*
