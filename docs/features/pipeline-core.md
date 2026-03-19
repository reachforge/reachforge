# Feature Spec: Pipeline Core

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| Pipeline Engine & State Machine             |
| **Directory**| `src/core/`                                |
| **Priority** | P0                                         |
| **SRS Refs** | FR-PIPE-001 through FR-PIPE-004, FR-LIFE-001 through FR-LIFE-005, FR-DASH-004 |
| **NFR Refs** | NFR-PERF-001, NFR-REL-001, NFR-REL-002    |

---

## 1. Purpose and Scope

The pipeline core is the foundation of reachforge. It manages the six-stage directory structure that represents the content state machine, handles project directory operations (create, list, move, rollback), and provides metadata read/write services via YAML files. Every other component depends on the pipeline core.

This module does NOT contain:
- CLI presentation logic (that belongs to `commands/`)
- LLM calls (that belongs to `llm/`)
- Platform-specific publishing (that belongs to `providers/`)

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `core/pipeline.ts` | PipelineEngine class: stage transitions, project listing, publish orchestration | 250 |
| `core/metadata.ts` | MetadataManager class: YAML read/write/merge for meta.yaml, receipt.yaml, upload_cache.yaml | 200 |
| `core/config.ts` | ConfigManager class: credential loading from .env, credentials.yaml, env vars | 150 |
| `core/constants.ts` | Stage names, regex patterns, default values | 50 |

## 3. TypeScript Interfaces

```typescript
// Already defined in types/pipeline.ts — imported by core/

export type PipelineStage =
  | '01_inbox' | '02_drafts' | '03_master'
  | '04_adapted' | '05_scheduled' | '06_sent';

export type ProjectStatus =
  | 'drafted' | 'master' | 'adapted' | 'scheduled' | 'published' | 'failed';

export interface ProjectMeta {
  article: string;
  status: ProjectStatus;
  publish_date?: string;
  adapted_platforms?: string[];
  platforms?: Record<string, PlatformStatus>;
  notes?: string;
  template?: string;
  error?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StageTransition {
  from: PipelineStage;
  to: PipelineStage;
  project: string;
  timestamp: string;
}

export interface PipelineStatus {
  stages: Record<PipelineStage, StageInfo>;
  totalProjects: number;
  dueToday: string[];
}

export interface StageInfo {
  count: number;
  items: string[];
}
```

## 4. Method Signatures

### PipelineEngine

```typescript
class PipelineEngine {
  constructor(workingDir: string);

  async initPipeline(): Promise<void>;
  async listProjects(stage: PipelineStage): Promise<string[]>;
  async getStatus(): Promise<PipelineStatus>;
  async moveProject(
    project: string,
    fromStage: PipelineStage,
    toStage: PipelineStage,
    newName?: string
  ): Promise<StageTransition>;
  async rollbackProject(project: string, fromStage: PipelineStage): Promise<StageTransition>;
  async findDueProjects(): Promise<string[]>;
  async publishProject(
    project: string,
    providers: Map<string, PlatformProvider>,
    options: PublishOptions
  ): Promise<PublishResult[]>;
  async readProjectContent(stage: PipelineStage, project: string, filename: string): Promise<string>;
  async writeProjectFile(stage: PipelineStage, project: string, filename: string, content: string): Promise<void>;
}
```

### MetadataManager

```typescript
class MetadataManager {
  constructor(workingDir: string);

  async readMeta(stage: string, project: string): Promise<ProjectMeta | null>;
  async writeMeta(stage: string, project: string, meta: Partial<ProjectMeta>): Promise<void>;
  async readReceipt(stage: string, project: string): Promise<ReceiptData | null>;
  async writeReceipt(stage: string, project: string, receipt: ReceiptData): Promise<void>;
  async readUploadCache(stage: string, project: string): Promise<UploadCache | null>;
  async writeUploadCache(stage: string, project: string, cache: UploadCache): Promise<void>;
}
```

### ConfigManager

```typescript
class ConfigManager {
  static async load(workingDir: string): Promise<ConfigManager>;

  getApiKey(service: string): string | undefined;
  getLLMProvider(): string;
  getConfig(): ReachforgeConfig;
}
```

## 5. Logic Steps

### initPipeline()

1. For each stage in `STAGES` array (`01_inbox` through `06_sent`):
   a. Compute path: `path.join(workingDir, stage)`
   b. Call `fs.ensureDir(path)` — creates if missing, no-op if exists
2. Return void (no error thrown unless filesystem permission denied)
3. On `EACCES` error: throw `FilesystemError('initialize', workingDir, error)` with message "Failed to initialize pipeline: permission denied"

### listProjects(stage)

1. Compute `dirPath = path.join(workingDir, stage)`
2. Call `fs.readdir(dirPath)` to get directory listing
3. Filter out entries that:
   a. Start with `.` (hidden files)
   b. End with `.yaml` (metadata files at stage root)
4. Return filtered array of directory names
5. Performance: No `stat()` calls per entry — relies on naming convention (NFR-PERF-001)

### getStatus()

1. Call `initPipeline()` to ensure directories exist
2. For each stage in `STAGES`:
   a. Call `listProjects(stage)` to get project names and count
   b. Store in `stages` record
3. Call `findDueProjects()` to get today's due items
4. Compute `totalProjects` as sum of all stage counts
5. Return `PipelineStatus` object

### moveProject(project, fromStage, toStage, newName?)

1. Compute `sourcePath = path.join(workingDir, fromStage, project)`
2. Compute `targetName = newName ?? project`
3. Validate `targetName` against `PROJECT_NAME_REGEX` — throw `ValidationError` if invalid
4. Compute `targetPath = path.join(workingDir, toStage, targetName)`
5. Check `sourcePath` exists via `fs.pathExists()` — throw `ProjectNotFoundError(project, fromStage)` if not
6. Check `targetPath` does NOT exist — throw `ProjectExistsError(targetName, toStage)` if it does
7. Call `fs.move(sourcePath, targetPath)` — atomic rename on same filesystem
8. Determine new status based on `toStage`:
   - `02_drafts` -> `'drafted'`
   - `03_master` -> `'master'`
   - `04_adapted` -> `'adapted'`
   - `05_scheduled` -> `'scheduled'`
   - `06_sent` -> `'published'`
9. Update meta.yaml via `MetadataManager.writeMeta(toStage, targetName, { status, updated_at })`
10. If `toStage === '05_scheduled'` and `targetName` starts with a date prefix, set `publish_date` in meta
11. Return `StageTransition` object with timestamp

### rollbackProject(project, fromStage)

1. Determine `previousStage` using `STAGE_ORDER` — if fromStage is first, throw error "Cannot rollback: project is already in the first stage."
2. Compute `newName`:
   - If rolling back from `05_scheduled`, strip the date prefix (`YYYY-MM-DD-` prefix) from the directory name
   - Otherwise, use the same project name
3. Call `moveProject(project, fromStage, previousStage, newName)`
4. Return the `StageTransition` result

### findDueProjects()

1. Compute `scheduledPath = path.join(workingDir, '05_scheduled')`
2. Call `fs.readdir(scheduledPath)` to list all entries
3. Get today's date as `YYYY-MM-DD` string
4. Filter entries where:
   a. Entry starts with `20` (year prefix sanity check)
   b. `entry.substring(0, 10)` is a valid date string
   c. `entry.substring(0, 10) <= today` (lexicographic comparison works for ISO dates)
5. Return filtered array

### publishProject(project, providers, options)

1. Read `meta.yaml` from `05_scheduled/project`
2. List files in `05_scheduled/project/platform_versions/`
3. Build publish tasks: for each platform file, pair with matching provider
4. Execute all tasks concurrently via `Promise.allSettled(tasks)` — up to MAX_CONCURRENT_PUBLISHES
5. For each task result:
   a. If fulfilled: record `PublishResult` with success status and URL
   b. If rejected: record `PublishResult` with failed status and error message
6. Build `ReceiptData` from all results
7. Write `receipt.yaml` via `MetadataManager.writeReceipt()`
8. If any result has `status: 'success'`:
   a. Move project to `06_sent` via `moveProject()`
   b. Update meta with `status: 'published'`
9. If all results have `status: 'failed'`:
   a. Leave project in `05_scheduled`
   b. Update meta with `status: 'failed'` and `error` summarizing failures
10. Return array of `PublishResult`

## 6. Field Mappings

### Stage to Status Mapping

| Stage | meta.yaml status | Trigger |
|-------|-----------------|---------|
| `01_inbox` | (no meta.yaml) | User creates content |
| `02_drafts` | `drafted` | `reach draft` |
| `03_master` | `master` | User manually moves |
| `04_adapted` | `adapted` | `reach adapt` |
| `05_scheduled` | `scheduled` | `reach schedule` |
| `06_sent` | `published` | `reach publish` |
| `05_scheduled` (on failure) | `failed` | `reach publish` (all platforms fail) |

### Config Key Mapping

| Environment Variable | credentials.yaml Key | Service |
|---------------------|---------------------|---------|
| `GEMINI_API_KEY` | `gemini_api_key` | Google Gemini LLM |
| `DEVTO_API_KEY` | `devto_api_key` | Dev.to platform |
| `POSTIZ_API_KEY` | `postiz_api_key` | Postiz / X bridge |
| `HASHNODE_API_KEY` | `hashnode_api_key` | Hashnode platform |
| `GITHUB_TOKEN` | `github_token` | GitHub platform |
| `REACHFORGE_LLM_PROVIDER` | (not in yaml) | LLM provider selection |

## 7. Error Handling

| Error Condition | Error Type | Message | Recovery |
|----------------|-----------|---------|----------|
| Working dir is read-only | `FilesystemError` | "Failed to initialize pipeline: permission denied" | User fixes permissions |
| Project not found in source stage | `ProjectNotFoundError` | "Project '{name}' not found in {stage}." | User verifies project name |
| Target already exists | `ProjectExistsError` | "Project already exists in {stage}: {name}." | User renames or removes conflict |
| Invalid project name chars | `ValidationError` | "Project name must contain only alphanumeric characters, hyphens, and underscores." | User fixes name |
| Rollback from first stage | `ValidationError` | "Cannot rollback: project is already in the first stage." | N/A |
| YAML parse failure | `FilesystemError` | "Failed to parse {file}: {yaml_error}" | User fixes corrupted YAML |
| credentials.yaml not found | (silent) | N/A — returns empty config | Expected if using .env only |

## 8. Test Scenarios

### Unit Tests (`core/__tests__/pipeline.test.ts`)

1. `initPipeline()` creates all 6 directories in an empty temp dir
2. `initPipeline()` is idempotent — calling twice does not error or overwrite
3. `initPipeline()` throws `FilesystemError` on permission denied (mock fs)
4. `listProjects()` returns correct names, excluding hidden files and .yaml files
5. `listProjects()` returns empty array for empty stage
6. `getStatus()` returns correct counts across stages with mixed data
7. `getStatus()` completes in <500ms with 100 projects (performance test)
8. `moveProject()` moves directory from source to target stage
9. `moveProject()` throws `ProjectNotFoundError` when source does not exist
10. `moveProject()` throws `ProjectExistsError` when target already exists
11. `moveProject()` updates meta.yaml with correct status after move
12. `moveProject()` with `newName` parameter renames directory during move
13. `rollbackProject()` moves project backward one stage
14. `rollbackProject()` strips date prefix when rolling back from `05_scheduled`
15. `rollbackProject()` throws error when project is in `01_inbox`
16. `findDueProjects()` returns projects with today's date or earlier
17. `findDueProjects()` does not return projects with future dates
18. `findDueProjects()` returns empty array when no due projects exist
19. `publishProject()` runs providers concurrently and collects results
20. `publishProject()` moves to `06_sent` on partial success
21. `publishProject()` stays in `05_scheduled` on total failure with error in meta

### Unit Tests (`core/__tests__/metadata.test.ts`)

1. `readMeta()` returns parsed `ProjectMeta` from valid meta.yaml
2. `readMeta()` returns null when meta.yaml does not exist
3. `readMeta()` throws on invalid YAML syntax
4. `writeMeta()` creates new meta.yaml with full fields
5. `writeMeta()` merges partial updates into existing meta.yaml
6. `writeMeta()` sets `updated_at` to current timestamp
7. `writeReceipt()` creates valid receipt.yaml
8. `readUploadCache()` returns parsed cache or null

### Unit Tests (`core/__tests__/config.test.ts`)

1. Environment variable takes precedence over .env file
2. .env file takes precedence over credentials.yaml
3. Missing credentials.yaml does not throw — returns empty config
4. `getApiKey('devto')` returns correct value from each source
5. `getLLMProvider()` defaults to 'gemini' when env var not set
6. `getLLMProvider()` reads from `REACHFORGE_LLM_PROVIDER` env var

## 9. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `types/pipeline.ts` | Imports from | Type definitions |
| `types/errors.ts` | Imports from | Error classes |
| `types/schemas.ts` | Imports from | Zod schemas for YAML validation |
| `fs-extra` | npm dependency | Filesystem operations |
| `js-yaml` | npm dependency | YAML parse/dump |
| `dotenv` | npm dependency | .env file loading |
| `commands/*` | Imported by | Command handlers use pipeline engine |
| `providers/loader.ts` | Imported by | Provider loader uses config |

---

*SRS Traceability: FR-PIPE-001 (initPipeline), FR-PIPE-002 (listProjects), FR-PIPE-003 (metadata), FR-PIPE-004 (moveProject), FR-LIFE-001 through FR-LIFE-005 (schedule/rollback), NFR-PERF-001 (status <500ms), NFR-REL-001 (no data loss), NFR-REL-002 (idempotent).*
