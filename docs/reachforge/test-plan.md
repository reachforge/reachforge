# Test Plan: reachforge

| Field            | Value                                              |
|------------------|----------------------------------------------------|
| **Document**     | reachforge Test Plan v1.0                              |
| **Author**       | aiperceivable QA Engineering                         |
| **Date**         | 2026-03-14                                         |
| **Status**       | Draft                                              |
| **Version**      | 1.0                                                |
| **SRS Reference**| [reachforge SRS v1.0](srs.md)                         |
| **Tech Design**  | [reachforge Technical Design v1.0](tech-design.md)     |
| **PRD Reference**| [reachforge PRD v1.0](prd.md)                         |
| **Decomposition**| [reachforge Decomposition](decomposition.md)           |
| **Standard**     | IEEE 829, ISTQB Foundation                         |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the test strategy, test environment, test cases, and quality gates for **reachforge**, an AI-native Social Influence Engine. It provides comprehensive coverage for all functional requirements (FR-xxx-NNN) and non-functional requirements (NFR-xxx-NNN) specified in the SRS, with traceability to the PRD features and Technical Design components.

### 1.2 Scope

**In scope:**
- All P0 and P1 functional requirements (pipeline core, CLI commands, AI draft/adapt, publishing providers, content validation, watcher daemon, plugin architecture)
- All P2 functional requirements (MCP server, analytics, templates) at reduced coverage
- All non-functional requirements (performance, security, compatibility, reliability)
- Unit, integration, and E2E test levels
- Mock strategy for external services (Gemini API, Dev.to, Postiz, Hashnode, GitHub)

**Out of scope:**
- VS Code extension testing (FEAT-015) --- separate test plan when extension is developed
- Load testing beyond the 100-item pipeline benchmark
- Accessibility testing (CLI-only product)

### 1.3 References

1. reachforge SRS v1.0 (`docs/reachforge/srs.md`)
2. reachforge Technical Design v1.0 (`docs/reachforge/tech-design.md`)
3. reachforge PRD v1.0 (`docs/reachforge/prd.md`)
4. reachforge Decomposition (`docs/reachforge/decomposition.md`)
5. Bun Test Runner documentation (https://bun.sh/docs/cli/test)
6. IEEE 829-2008 Standard for Software and System Test Documentation

### 1.4 Quality Objectives

- **Defect prevention**: Catch regressions before they reach users through 90%+ automated test coverage
- **Requirement coverage**: Every FR has at least one test case; every P0 FR has positive, negative, and boundary cases
- **Data integrity assurance**: File system state consistency verified after every pipeline operation
- **Confidence in external integrations**: All provider API interactions tested with deterministic mocks

---

## 2. Test Strategy

### 2.1 Test Levels

| Level       | Scope                                       | Automation | Coverage Target |
|-------------|---------------------------------------------|------------|-----------------|
| Unit        | Individual functions and classes             | 100%       | 90%+ line coverage for core/, providers/, llm/, validators/, utils/ |
| Integration | Multi-module workflows with real filesystem  | 100%       | All CLI commands: success + error paths |
| E2E         | Full pipeline, compiled binary               | Partial    | One full pipeline run per supported platform |
| Performance | NFR benchmarks (latency, binary size)        | 100%       | All NFR-PERF targets met |
| Security    | Credential handling, input sanitization      | 90%        | All NFR-SEC requirements verified |

### 2.2 Test Types

- **Functional**: Validate every FR produces the specified behavior with exact expected outputs
- **Non-functional**: Performance benchmarks, security checks, compatibility verification
- **Regression**: Full unit + integration suite runs on every commit; E2E suite on release candidates
- **Smoke**: Minimal subset (status, draft, publish) for rapid validation after deploys

### 2.3 Test Approach Per Module

| Module              | Primary Approach                | Mock Strategy                           |
|---------------------|--------------------------------|-----------------------------------------|
| `core/pipeline.ts`  | Unit with temp filesystem      | Mock `fs-extra` for error paths; real fs for happy paths |
| `core/metadata.ts`  | Unit with real YAML strings    | Mock filesystem for write failures      |
| `core/config.ts`    | Unit with env var manipulation | Mock `process.env`, mock file reads     |
| `providers/*.ts`    | Unit with mock HTTP client     | Mock `HttpClient` for all API calls     |
| `providers/loader.ts`| Unit with mock filesystem     | Mock dynamic imports, mock directory listing |
| `llm/gemini.ts`     | Unit with mock SDK             | Mock `GoogleGenerativeAI` client        |
| `validators/*.ts`   | Unit, pure functions           | No mocks needed                         |
| `utils/http.ts`     | Unit with mock `fetch`         | Mock global `fetch`                     |
| `utils/media.ts`    | Unit with mock fs + HTTP       | Mock filesystem reads, mock upload API  |
| `commands/*.ts`     | Integration with temp dir      | Mock LLM and HTTP; real filesystem      |
| `mcp/*.ts`          | Integration                    | Mock command handlers                   |

### 2.4 Automation Strategy

**Framework**: `bun:test` (Bun built-in test runner)

**Configuration** (`bunfig.toml`):
```toml
[test]
root = "tests"
preload = ["./tests/setup.ts"]
coverage = true
coverageThreshold = { line = 90, function = 85, branch = 80 }
```

**File conventions**:
- `tests/unit/<module>/<file>.test.ts` --- unit tests
- `tests/integration/<command>.test.ts` --- integration tests
- `tests/e2e/<scenario>.test.ts` --- end-to-end tests
- `tests/fixtures/` --- shared test data
- `tests/helpers/` --- test utilities (mock factories, temp dir management)
- `tests/setup.ts` --- global test setup (env var defaults, temp dir cleanup)

**Run commands**:
```bash
bun test                       # All unit + integration tests
bun test tests/unit            # Unit tests only
bun test tests/integration     # Integration tests only
E2E=true bun test tests/e2e   # E2E tests (requires API keys)
```

### 2.5 Entry/Exit Criteria

| Level       | Entry Criteria                              | Exit Criteria                           |
|-------------|---------------------------------------------|-----------------------------------------|
| Unit        | Module code compiles without errors         | 90%+ line coverage; all tests pass      |
| Integration | All unit tests pass                         | All command flows (happy + error) pass  |
| E2E         | All integration tests pass                  | Full pipeline completes for all platforms|
| Release     | All levels pass; no P0/P1 defects open      | Coverage thresholds met; quality gates pass |

---

## 3. Test Environment

### 3.1 Hardware/Software Requirements

| Component          | Requirement                                    |
|--------------------|------------------------------------------------|
| Runtime            | Bun >= 1.0                                     |
| OS                 | macOS (ARM64), Linux (x64), Windows (x64)      |
| Disk               | 100 MB free for test pipeline directories      |
| Network            | Not required for unit/integration (all mocked) |
| Environment vars   | `GEMINI_API_KEY=test-key` (mock), `E2E=true` (for E2E only) |

### 3.2 Test Directory Structure

```
tests/
  setup.ts                          -- Global setup: env defaults, temp dir helpers
  helpers/
    temp-pipeline.ts                -- Creates/destroys temp pipeline directories
    mock-llm.ts                     -- LLM provider mock factory
    mock-http.ts                    -- HTTP client mock factory
    mock-providers.ts               -- Platform provider mock factory
    fixtures.ts                     -- Loads fixture files
  fixtures/
    inbox/
      my-idea.md                    -- Sample inbox markdown
      empty-idea.md                 -- Empty file for boundary testing
    meta/
      drafted.yaml                  -- meta.yaml in drafted state
      adapted.yaml                  -- meta.yaml in adapted state
      scheduled.yaml                -- meta.yaml in scheduled state
      published.yaml                -- meta.yaml in published state
      corrupt.yaml                  -- Malformed YAML for error testing
    content/
      master-article.md             -- Sample master article
      x-thread.md                   -- Sample X thread (valid)
      x-thread-overlimit.md         -- X thread with 285-char segment
      devto-article.md              -- Sample Dev.to article with frontmatter
      devto-no-frontmatter.md       -- Dev.to article missing frontmatter
    receipts/
      success-receipt.yaml          -- Valid receipt with success items
      partial-receipt.yaml          -- Receipt with mixed success/failure
    credentials/
      valid-credentials.yaml        -- All keys present
      partial-credentials.yaml      -- Only gemini key present
    api-responses/
      devto-201.json                -- Successful Dev.to article creation
      devto-429.json                -- Rate limit response
      devto-401.json                -- Auth failure response
      postiz-201.json               -- Successful Postiz post
      gemini-success.json           -- Gemini generation response
      gemini-empty.json             -- Gemini empty response
  unit/
    core/
      pipeline.test.ts
      metadata.test.ts
      config.test.ts
      constants.test.ts
    providers/
      devto.test.ts
      postiz.test.ts
      hashnode.test.ts
      github.test.ts
      loader.test.ts
    llm/
      gemini.test.ts
      factory.test.ts
    validators/
      x.test.ts
      devto.test.ts
      hashnode.test.ts
      github.test.ts
    utils/
      http.test.ts
      media.test.ts
      logger.test.ts
  integration/
    status.test.ts
    draft.test.ts
    adapt.test.ts
    schedule.test.ts
    publish.test.ts
    watch.test.ts
    mcp.test.ts
  e2e/
    full-pipeline.test.ts
    devto-publish.test.ts
    postiz-publish.test.ts
```

### 3.3 Mock Strategy for External Services

**LLM API mocking**: A `MockLLMProvider` implements the `LLMProvider` interface, returning deterministic content for `generate()` and `adapt()` calls. Configurable to simulate errors (timeout, empty response, API key failure).

**Platform API mocking**: Each provider test uses a `MockHttpClient` that returns pre-configured JSON responses. Fixture files in `tests/fixtures/api-responses/` contain real API response shapes.

**Filesystem mocking**: Integration tests use real temporary directories (created via `mkdtemp`). Unit tests for error paths mock `fs-extra` functions.

### 3.4 Test Fixtures

**`tests/fixtures/inbox/my-idea.md`**:
```markdown
# AI-Powered Code Review Tools

Explore how AI is transforming code review processes in modern development teams.
Key topics: automated suggestions, security scanning, performance analysis.
```

**`tests/fixtures/meta/adapted.yaml`**:
```yaml
article: "my-article"
status: "adapted"
adapted_platforms:
  - x
  - devto
  - wechat
platforms:
  x:
    status: "pending"
    method: "auto"
    url: ""
  devto:
    status: "pending"
    method: "auto"
    url: ""
created_at: "2026-03-14T10:00:00Z"
updated_at: "2026-03-14T12:30:00Z"
```

**`tests/fixtures/content/x-thread.md`**:
```markdown
1/ AI code review tools are changing how dev teams work. Here's what you need to know.

---

2/ First: automated suggestions. Tools like Copilot now catch bugs before humans do.

---

3/ Second: security scanning built into the PR workflow. No more separate audit steps.
```

**`tests/fixtures/content/devto-article.md`**:
```markdown
---
title: "AI-Powered Code Review Tools: A Deep Dive"
tags: ["ai", "codereview", "devtools", "productivity"]
series: "AI in DevOps"
---

# AI-Powered Code Review Tools: A Deep Dive

Modern development teams are adopting AI-powered code review tools at an accelerating rate...
```

### 3.5 Environment Variables for Testing

| Variable           | Test Value                | Purpose                              |
|--------------------|---------------------------|--------------------------------------|
| `GEMINI_API_KEY`   | `test-gemini-key-12345`   | Mock API key for LLM tests           |
| `DEVTO_API_KEY`    | `test-devto-key-67890`    | Mock API key for Dev.to tests        |
| `POSTIZ_API_KEY`   | `test-postiz-key-abcde`   | Mock API key for Postiz tests        |
| `HASHNODE_API_KEY` | `test-hashnode-key-fghij` | Mock API key for Hashnode tests      |
| `GITHUB_TOKEN`     | `test-github-token-klmno` | Mock token for GitHub tests          |
| `E2E`             | `true`                     | Enables E2E test execution           |
| `REACHFORGE_LLM_PROVIDER` | `gemini`              | Default LLM provider for tests       |

---

## 4. Test Cases

### 4.1 Pipeline Core Tests (TC-PIPE-xxx)

**TC-PIPE-001: Pipeline directory initialization on first command**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Empty temporary directory as working directory
- **Test Steps**:
  1. Create a `PipelineEngine` instance with the temp directory as `workingDir`
  2. Call `initPipeline()`
  3. Read the directory listing of `workingDir`
- **Test Data**: Working directory path `/tmp/reachforge-test-XXXXX/`
- **Expected Result**: Six directories exist: `01_inbox`, `02_drafts`, `03_master`, `04_adapted`, `05_scheduled`, `06_sent`. Each is an empty directory. No files are created.
- **Automation**: Yes
- **Traces**: FR-PIPE-001

**TC-PIPE-002: Pipeline initialization is idempotent**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Pipeline directories already exist with content (e.g., `01_inbox/existing-project/idea.md`)
- **Test Steps**:
  1. Create pipeline directories with a project in `01_inbox`
  2. Write file `01_inbox/existing-project/idea.md` with content `"Test idea"`
  3. Call `initPipeline()` again
  4. Verify `01_inbox/existing-project/idea.md` still exists with content `"Test idea"`
- **Test Data**: File content `"Test idea"` at `01_inbox/existing-project/idea.md`
- **Expected Result**: All six directories exist. Pre-existing content is untouched. File content unchanged.
- **Automation**: Yes
- **Traces**: FR-PIPE-001, NFR-REL-002

**TC-PIPE-003: Pipeline initialization on read-only directory**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Working directory has read-only permissions (chmod 444)
- **Test Steps**:
  1. Create temp directory and set permissions to read-only
  2. Create `PipelineEngine` with that directory
  3. Call `initPipeline()`
- **Test Data**: Directory with permissions `0o444`
- **Expected Result**: Throws `FilesystemError` with message containing `"Failed to initialize pipeline: permission denied"`. Exit code 1.
- **Automation**: Yes
- **Traces**: FR-PIPE-001

**TC-PIPE-004: Project directory naming validation**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Pipeline initialized
- **Test Steps**:
  1. Attempt to create a project with name `"my-article"` (valid)
  2. Attempt to create a project with name `"my article"` (spaces)
  3. Attempt to create a project with name `"../etc/passwd"` (path traversal)
  4. Attempt to create a project with name `"valid_name-123"` (valid)
- **Test Data**: Names: `"my-article"`, `"my article"`, `"../etc/passwd"`, `"valid_name-123"`
- **Expected Result**: Names 1 and 4 accepted. Names 2 and 3 rejected with `ValidationError`.
- **Automation**: Yes
- **Traces**: FR-PIPE-002

**TC-PIPE-005: Move project between stages (happy path)**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Project `my-article` exists in `04_adapted/` with `meta.yaml` and `platform_versions/`
- **Test Steps**:
  1. Create `04_adapted/my-article/meta.yaml` with `status: "adapted"`
  2. Create `04_adapted/my-article/platform_versions/x.md`
  3. Call `moveProject("my-article", "04_adapted", "05_scheduled", "2026-03-20-my-article")`
  4. Check source and target directories
- **Test Data**: `meta.yaml` content: `article: "my-article"\nstatus: "adapted"`
- **Expected Result**: `04_adapted/my-article/` no longer exists. `05_scheduled/2026-03-20-my-article/` exists and contains `meta.yaml` (with `status: "scheduled"`) and `platform_versions/x.md`. `meta.yaml` `updated_at` is set to current time.
- **Automation**: Yes
- **Traces**: FR-PIPE-004, FR-LIFE-004

**TC-PIPE-006: Move project to stage where target already exists**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Both `04_adapted/my-article/` and `05_scheduled/2026-03-20-my-article/` exist
- **Test Steps**:
  1. Create both directories
  2. Call `moveProject("my-article", "04_adapted", "05_scheduled", "2026-03-20-my-article")`
- **Expected Result**: Throws `ProjectExistsError` with message `"Project already exists in target stage"`. Source directory unchanged.
- **Automation**: Yes
- **Traces**: FR-PIPE-004

**TC-PIPE-007: Move non-existent project**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Pipeline initialized but `04_adapted/ghost-article/` does not exist
- **Test Steps**:
  1. Call `moveProject("ghost-article", "04_adapted", "05_scheduled")`
- **Expected Result**: Throws `ProjectNotFoundError` with message `'Project "ghost-article" not found in 04_adapted.'`
- **Automation**: Yes
- **Traces**: FR-PIPE-004

**TC-PIPE-008: List projects in stage, excluding hidden files**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: `02_drafts/` contains `my-article/`, `.hidden/`, and `template_meta.yaml`
- **Test Steps**:
  1. Create directories: `02_drafts/my-article/`, `02_drafts/.hidden/`
  2. Create file: `02_drafts/template_meta.yaml`
  3. Call `listProjects("02_drafts")`
- **Expected Result**: Returns `["my-article"]`. Does not include `.hidden` or `template_meta.yaml`.
- **Automation**: Yes
- **Traces**: FR-DASH-001

**TC-PIPE-009: Find due projects in scheduled stage**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: `05_scheduled/` contains `2026-03-14-article-a/` (due today), `2026-03-10-article-b/` (past due), `2026-03-20-article-c/` (future)
- **Test Steps**:
  1. Create three project directories with date prefixes
  2. Set system date context to 2026-03-14
  3. Call `findDueProjects()`
- **Expected Result**: Returns `["2026-03-14-article-a", "2026-03-10-article-b"]`. Does not include future-dated `article-c`.
- **Automation**: Yes
- **Traces**: FR-WATCH-001

**TC-PIPE-010: Empty pipeline (zero projects across all stages)**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Pipeline initialized with all empty directories
- **Test Steps**:
  1. Call `listProjects()` for each stage
  2. Call `findDueProjects()`
- **Expected Result**: All `listProjects()` calls return empty arrays. `findDueProjects()` returns empty array.
- **Automation**: Yes
- **Traces**: FR-DASH-001

**TC-PIPE-011: Pipeline with 100+ projects (performance boundary)**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Create 100 project directories distributed across 6 stages
- **Test Steps**:
  1. Create 20 directories in each of `01_inbox` through `05_scheduled`
  2. Measure time to list all projects across all stages
- **Test Data**: Project names `project-001` through `project-100`
- **Expected Result**: Total listing time is under 500ms. All 100 projects returned correctly.
- **Automation**: Yes
- **Traces**: FR-DASH-004, NFR-PERF-001

**TC-PIPE-012: Metadata CRUD operations**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Project directory `02_drafts/my-article/` exists
- **Test Steps**:
  1. Call `writeMeta("02_drafts", "my-article", { article: "my-article", status: "drafted", created_at: "2026-03-14T10:00:00Z" })`
  2. Call `readMeta("02_drafts", "my-article")`
  3. Call `writeMeta("02_drafts", "my-article", { status: "master", updated_at: "2026-03-14T12:00:00Z" })` (partial update)
  4. Call `readMeta("02_drafts", "my-article")` again
- **Expected Result**: Step 2 returns `{ article: "my-article", status: "drafted", created_at: "2026-03-14T10:00:00Z" }`. Step 4 returns merged object with `status: "master"`, `updated_at` set, and `article` and `created_at` preserved.
- **Automation**: Yes
- **Traces**: FR-PIPE-003

**TC-PIPE-013: Read corrupt meta.yaml**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: `02_drafts/my-article/meta.yaml` contains invalid YAML: `"status: [unclosed bracket"`
- **Test Steps**:
  1. Write corrupt YAML to meta.yaml
  2. Call `readMeta("02_drafts", "my-article")`
- **Test Data**: File content: `"article: my-article\nstatus: [unclosed"`
- **Expected Result**: Returns `null` or throws a descriptive error. Does not crash the process.
- **Automation**: Yes
- **Traces**: FR-PIPE-003

### 4.2 CLI Command Tests (TC-CLI-xxx)

**TC-CLI-001: `status` command with populated pipeline**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Pipeline with 2 items in `01_inbox`, 1 in `02_drafts`, 0 in others
- **Test Steps**:
  1. Create `01_inbox/idea-a/`, `01_inbox/idea-b/`, `02_drafts/article-c/`
  2. Run `reach status`
  3. Capture stdout output
- **Expected Result**: Output contains all 6 stage names. `01_inbox` shows count 2 with names `idea-a`, `idea-b`. `02_drafts` shows count 1 with name `article-c`. Other stages show count 0. Exit code 0.
- **Automation**: Yes
- **Traces**: FR-DASH-001, FR-DASH-002

**TC-CLI-002: `status` command on empty pipeline**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Empty working directory (no pipeline dirs)
- **Test Steps**:
  1. Run `reach status` in empty temp directory
  2. Check stdout and filesystem
- **Expected Result**: Six pipeline directories are auto-created. Output shows all stages with count 0. Exit code 0.
- **Automation**: Yes
- **Traces**: FR-PIPE-001, FR-DASH-001

**TC-CLI-003: `schedule` command with valid date**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `04_adapted/my-article/meta.yaml` exists with `status: "adapted"`
- **Test Steps**:
  1. Create adapted project with meta.yaml and platform_versions/
  2. Run `reach schedule my-article 2026-03-20`
  3. Check filesystem state
- **Expected Result**: `04_adapted/my-article/` is gone. `05_scheduled/2026-03-20-my-article/` exists. `meta.yaml` inside contains `status: "scheduled"` and `publish_date: "2026-03-20"`. Exit code 0.
- **Automation**: Yes
- **Traces**: FR-LIFE-001, FR-LIFE-003, FR-LIFE-004

**TC-CLI-004: `schedule` command with invalid date format**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `04_adapted/my-article/` exists
- **Test Steps**:
  1. Run `reach schedule my-article 03-20-2026`
  2. Run `reach schedule my-article not-a-date`
  3. Run `reach schedule my-article 2026-02-30` (invalid calendar date)
- **Expected Result**: All three commands output error containing `"Date must be in YYYY-MM-DD format"` (or `"valid calendar date"` for the third). Exit code 1. No files moved.
- **Automation**: Yes
- **Traces**: FR-LIFE-002

**TC-CLI-005: `schedule` command with non-existent article**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Pipeline initialized but `04_adapted/ghost/` does not exist
- **Test Steps**:
  1. Run `reach schedule ghost 2026-03-20`
- **Expected Result**: Stderr contains `"Article 'ghost' not found in 04_adapted"` or equivalent. Exit code 1.
- **Automation**: Yes
- **Traces**: FR-LIFE-001

**TC-CLI-006: `draft` command with missing API key**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `01_inbox/my-idea.md` exists. `GEMINI_API_KEY` is unset.
- **Test Steps**:
  1. Unset `GEMINI_API_KEY` from environment
  2. Run `reach draft my-idea.md`
- **Expected Result**: Stderr contains `"GEMINI_API_KEY is not set"`. Exit code 1. No files created in `02_drafts/`.
- **Automation**: Yes
- **Traces**: FR-DRAFT-005

**TC-CLI-007: `draft` command with non-existent source**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `01_inbox/` is empty
- **Test Steps**:
  1. Run `reach draft nonexistent`
- **Expected Result**: Stderr contains `'Source "nonexistent" not found in 01_inbox'`. Exit code non-zero.
- **Automation**: Yes
- **Traces**: FR-DRAFT-006

**TC-CLI-008: `adapt` command with `--force` flag**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `03_master/my-article/master.md` exists. `04_adapted/my-article/platform_versions/x.md` already exists with content `"old content"`.
- **Test Steps**:
  1. Run `reach adapt my-article` (without --force)
  2. Verify `x.md` still contains `"old content"`
  3. Run `reach adapt my-article --force`
  4. Verify `x.md` now contains new AI-generated content
- **Expected Result**: Step 1 skips existing `x.md` with informational message. Step 3 overwrites `x.md` with new content.
- **Automation**: Yes
- **Traces**: FR-ADAPT-005

**TC-CLI-009: `adapt` command with `--platforms` filter**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `03_master/my-article/master.md` exists
- **Test Steps**:
  1. Run `reach adapt my-article --platforms x,devto`
  2. List files in `04_adapted/my-article/platform_versions/`
- **Expected Result**: Only `x.md` and `devto.md` exist in `platform_versions/`. No `wechat.md` or `zhihu.md`. `meta.yaml` contains `adapted_platforms: ["x", "devto"]`.
- **Automation**: Yes
- **Traces**: FR-ADAPT-007

**TC-CLI-010: `publish` command with no due items**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `05_scheduled/` contains only `2026-12-31-future-article/`
- **Test Steps**:
  1. Run `reach publish` (system date is 2026-03-14)
- **Expected Result**: Stdout contains `"No content due for publishing today."`. Exit code 1. No items moved.
- **Automation**: Yes
- **Traces**: FR-PUB-001

**TC-CLI-011: Rollback from scheduled to adapted**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `05_scheduled/2026-03-20-my-article/` exists with `meta.yaml` status `"scheduled"`
- **Test Steps**:
  1. Execute rollback operation to move project back to `04_adapted`
  2. Check filesystem state
- **Expected Result**: `05_scheduled/2026-03-20-my-article/` is gone. `04_adapted/my-article/` exists (date prefix removed). `meta.yaml` status updated to `"adapted"`.
- **Automation**: Yes
- **Traces**: FR-LIFE-005

### 4.3 AI Draft Generator Tests (TC-DRAFT-xxx)

**TC-DRAFT-001: Successful draft generation from file**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: `01_inbox/my-idea.md` exists with content. Mock LLM returns `"# Generated Article\n\nContent here..."`
- **Test Steps**:
  1. Set up mock LLM to return `"# Generated Article\n\nThis is an AI-generated article about code review tools."`
  2. Call draft command handler with source `"my-idea.md"`
  3. Check `02_drafts/my-idea/`
- **Test Data**: Input: fixture `my-idea.md`. Mock LLM output: 150-word generated article.
- **Expected Result**: `02_drafts/my-idea/draft.md` exists with the mock LLM content. `02_drafts/my-idea/meta.yaml` contains `article: "my-idea"`, `status: "drafted"`, and a valid `created_at` timestamp.
- **Automation**: Yes
- **Traces**: FR-DRAFT-001, FR-DRAFT-003, FR-DRAFT-004

**TC-DRAFT-002: Draft generation from directory source**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: `01_inbox/my-project/` directory exists containing `notes.md` and `outline.txt`
- **Test Steps**:
  1. Create directory with `notes.md` (content: `"# Notes\nSome content"`)
  2. Call draft command with source `"my-project"`
  3. Verify the first `.md` file was read as input
- **Expected Result**: Mock LLM receives content from `notes.md`. `02_drafts/my-project/draft.md` created.
- **Automation**: Yes
- **Traces**: FR-DRAFT-001

**TC-DRAFT-003: Draft generation from directory with no text files**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: `01_inbox/empty-dir/` exists containing only `image.png`
- **Test Steps**:
  1. Create directory with only non-text files
  2. Call draft command with source `"empty-dir"`
- **Expected Result**: System uses the directory name `"empty-dir"` as content input to LLM. Draft is still generated.
- **Automation**: Yes
- **Traces**: FR-DRAFT-001

**TC-DRAFT-004: LLM API timeout during draft**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock LLM configured to throw timeout error
- **Test Steps**:
  1. Configure mock to reject with `new Error("Request timed out")`
  2. Call draft command with valid source
- **Expected Result**: Error message `"AI generation failed: request timed out"` displayed. No files created in `02_drafts/`. Source remains in `01_inbox/`.
- **Automation**: Yes
- **Traces**: FR-DRAFT-002, FR-DRAFT-006

**TC-DRAFT-005: LLM returns empty response**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Mock LLM returns `{ content: "" }`
- **Test Steps**:
  1. Configure mock to return empty content string
  2. Call draft command
- **Expected Result**: Error indicating empty AI response. No `draft.md` with empty content is saved.
- **Automation**: Yes
- **Traces**: FR-DRAFT-003

**TC-DRAFT-006: Progress indication displayed during generation**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: Valid source and mock LLM with 100ms delay
- **Test Steps**:
  1. Capture stdout during draft command execution
  2. Verify progress message appears before LLM response
- **Expected Result**: Stdout contains `"Generating AI draft for my-idea.md..."` before the result message.
- **Automation**: Yes
- **Traces**: FR-DRAFT-007, NFR-PERF-002

**TC-DRAFT-007: Prompt construction sends source content to LLM**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Source file contains `"Explore AI in code reviews"`
- **Test Steps**:
  1. Call `GeminiProvider.generate()` with content `"Explore AI in code reviews"`
  2. Capture the prompt sent to the mock Gemini SDK
- **Expected Result**: Prompt string contains `"Explore AI in code reviews"`. Prompt includes system instruction for Markdown output.
- **Automation**: Yes
- **Traces**: FR-DRAFT-002

### 4.4 AI Platform Adapter Tests (TC-ADAPT-xxx)

**TC-ADAPT-001: Successful multi-platform adaptation**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: `03_master/my-article/master.md` exists with 500-word article. Mock LLM returns platform-specific content.
- **Test Steps**:
  1. Configure mock LLM to return distinct content per platform
  2. Call adapt command for `"my-article"` with default platforms (x, wechat, zhihu)
  3. Check `04_adapted/my-article/platform_versions/`
- **Expected Result**: Three files created: `x.md`, `wechat.md`, `zhihu.md`. Each contains the mock LLM output for that platform. `meta.yaml` contains `adapted_platforms: ["x", "wechat", "zhihu"]` and `status: "adapted"`.
- **Automation**: Yes
- **Traces**: FR-ADAPT-002, FR-ADAPT-003, FR-ADAPT-004

**TC-ADAPT-002: Adaptation with missing master article**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: `03_master/ghost/` does not exist
- **Test Steps**:
  1. Call adapt command for `"ghost"`
- **Expected Result**: Error `"Master article not found at 03_master/ghost/master.md"`. No directories created in `04_adapted/`.
- **Automation**: Yes
- **Traces**: FR-ADAPT-001

**TC-ADAPT-003: Partial adaptation failure (one platform fails)**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock LLM succeeds for `x` and `wechat` but throws error for `zhihu`
- **Test Steps**:
  1. Configure mock to fail on `zhihu` platform
  2. Call adapt for all three platforms
  3. Check filesystem and meta.yaml
- **Expected Result**: `x.md` and `wechat.md` created. `zhihu.md` not created. `meta.yaml` contains `adapted_platforms: ["x", "wechat"]`. Warning message mentions `zhihu` failure.
- **Automation**: Yes
- **Traces**: FR-ADAPT-002

**TC-ADAPT-004: X adaptation produces thread under 280 chars per segment**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock LLM returns properly formatted X thread
- **Test Steps**:
  1. Configure mock to return: `"1/ Short tweet here.\n---\n2/ Another short tweet."`
  2. Parse the output and measure each segment
- **Expected Result**: Each segment after splitting by `---` delimiter is 280 characters or fewer.
- **Automation**: Yes
- **Traces**: FR-ADAPT-006

**TC-ADAPT-005: Adaptation of empty master content**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: `03_master/empty-article/master.md` exists but is empty (0 bytes)
- **Test Steps**:
  1. Call adapt for `"empty-article"`
- **Expected Result**: LLM is called with empty string or error raised before LLM call indicating empty master content.
- **Automation**: Yes
- **Traces**: FR-ADAPT-001

**TC-ADAPT-006: Adaptation of very long content (10,000+ words)**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Master article is 10,000 words
- **Test Steps**:
  1. Create master.md with 10,000 words of lorem ipsum
  2. Call adapt command
- **Expected Result**: All platform versions generated without truncation errors. Each platform file is non-empty.
- **Automation**: Yes
- **Traces**: FR-ADAPT-002

**TC-ADAPT-007: Content with special characters (emoji, CJK, HTML entities)**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Master content contains `"Hello <script>alert('xss')</script>"`
- **Test Steps**:
  1. Create master.md with mixed character content
  2. Call adapt command
- **Expected Result**: Adapt completes without error. Special characters preserved in output (not escaped or corrupted).
- **Automation**: Yes
- **Traces**: FR-ADAPT-002

### 4.5 Provider Plugin Tests (TC-PROV-xxx)

**TC-PROV-001: Plugin discovery scans providers directory**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: `providers/` directory contains `devto.ts`, `postiz.ts`, `types.ts`, `loader.ts`
- **Test Steps**:
  1. Mock directory listing to return `["devto.ts", "postiz.ts", "types.ts", "loader.ts"]`
  2. Call `discoverProviders()`
  3. Check registered providers
- **Expected Result**: Two providers registered: `devto` and `x` (from postiz.ts). `types.ts` and `loader.ts` are excluded.
- **Automation**: Yes
- **Traces**: FR-PLUG-002

**TC-PROV-002: Plugin with missing required interface method**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Mock provider file exports a class missing `validate()` method
- **Test Steps**:
  1. Mock dynamic import to return incomplete provider class
  2. Call `discoverProviders()`
- **Expected Result**: Throws `ProviderLoadError` with message identifying the non-conforming file. Other providers still load.
- **Automation**: Yes
- **Traces**: FR-PLUG-002

**TC-PROV-003: Provider configuration precedence (env > .env > yaml)**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: `DEVTO_API_KEY=env-key-111` in environment. `credentials.yaml` contains `devto_api_key: "yaml-key-222"`
- **Test Steps**:
  1. Set environment variable `DEVTO_API_KEY=env-key-111`
  2. Create `credentials.yaml` with `devto_api_key: "yaml-key-222"`
  3. Call `ConfigManager.load()` and `getApiKey("devto")`
- **Expected Result**: Returns `"env-key-111"` (environment variable takes precedence).
- **Automation**: Yes
- **Traces**: FR-PLUG-003

**TC-PROV-004: Validation gates publish**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Mock provider where `validate()` returns `{ valid: false, errors: ["Title too long"] }`
- **Test Steps**:
  1. Call `publishProject()` with the mock provider
  2. Check if `publish()` was called
- **Expected Result**: `publish()` is never called. Result contains `status: "failed"` and error `"Title too long"` for that provider.
- **Automation**: Yes
- **Traces**: FR-PLUG-004

**TC-PROV-005: Provider manifest returns correct metadata**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: `DevtoProvider` instantiated with API key
- **Test Steps**:
  1. Call `manifest()` on DevtoProvider
- **Expected Result**: Returns `{ id: "devto", name: "Dev.to", type: "native", platforms: ["devto"], requiredCredentials: ["devto_api_key"], supportedFeatures: ["articles", "draft-mode", "tags", "series"] }`.
- **Automation**: Yes
- **Traces**: FR-PLUG-001

**TC-PROV-006: Filter providers by project adapted_platforms**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Three providers loaded (devto, x, hashnode). Project meta has `adapted_platforms: ["devto", "hashnode"]`
- **Test Steps**:
  1. Call `getProvidersForProject(["devto", "hashnode"])`
- **Expected Result**: Returns map with 2 entries: `devto` and `hashnode`. Does not include `x`.
- **Automation**: Yes
- **Traces**: FR-PROV-003

### 4.6 Publishing Tests (TC-PUB-xxx)

**TC-PUB-001: Dev.to successful publish (draft mode)**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock HTTP returns `{ status: 201, data: { id: 12345, url: "https://dev.to/user/my-article-abc123" } }`
- **Test Steps**:
  1. Call `DevtoProvider.publish(devtoArticleContent, { publishLive: false })`
  2. Capture the request body sent to mock HTTP
- **Expected Result**: Request body contains `{ article: { title: "AI-Powered Code Review Tools: A Deep Dive", body_markdown: "...", published: false, tags: ["ai", "codereview", "devtools", "productivity"] } }`. Returns `{ platform: "devto", status: "success", url: "https://dev.to/user/my-article-abc123" }`.
- **Automation**: Yes
- **Traces**: FR-PUB-002, FR-PUB-004

**TC-PUB-002: Dev.to publish with --publish-live flag**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Same as TC-PUB-001 but `publishLive: true`
- **Test Steps**:
  1. Call `DevtoProvider.publish(content, { publishLive: true })`
  2. Check request body
- **Expected Result**: Request body contains `published: true`.
- **Automation**: Yes
- **Traces**: FR-PUB-004

**TC-PUB-003: Dev.to API rate limit (429) with retry**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock HTTP returns 429 on first two attempts, 201 on third
- **Test Steps**:
  1. Configure mock to return sequence: 429, 429, 201
  2. Call `DevtoProvider.publish()`
  3. Verify retry timing
- **Expected Result**: Three requests made total. Delays approximately 1s, 2s between retries. Final result is success with URL.
- **Automation**: Yes
- **Traces**: FR-PUB-005

**TC-PUB-004: Dev.to API rate limit exhausted (all retries fail)**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock HTTP returns 429 on all three attempts
- **Test Steps**:
  1. Configure mock to always return 429
  2. Call `DevtoProvider.publish()`
- **Expected Result**: Throws `HttpRetryExhaustedError` after 3 attempts. Message: `"Request to /articles failed after 3 attempts. Last status: 429."`.
- **Automation**: Yes
- **Traces**: FR-PUB-005

**TC-PUB-005: Dev.to authentication failure (401)**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock HTTP returns `{ status: 401 }`
- **Test Steps**:
  1. Configure mock to return 401
  2. Call `DevtoProvider.publish()`
- **Expected Result**: Throws `AuthenticationError` immediately with no retry. Message: `"Dev.to authentication failed. Verify your API key."`.
- **Automation**: Yes
- **Traces**: FR-PUB-005

**TC-PUB-006: Dev.to API key not configured**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: No `DEVTO_API_KEY` in environment or credentials
- **Test Steps**:
  1. Run publish command with a due item
- **Expected Result**: Dev.to publishing is skipped with log message `"Dev.to API key not configured; skipping Dev.to publishing."`. Other providers proceed.
- **Automation**: Yes
- **Traces**: FR-PUB-001

**TC-PUB-007: Postiz successful X thread publish**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock HTTP returns `{ status: 201, data: { id: "post-789", postUrl: "https://x.com/user/status/123456789" } }`
- **Test Steps**:
  1. Call `PostizProvider.publish(xThreadContent, { publishLive: true })`
  2. Check request body
- **Expected Result**: Request body contains `{ platform: "twitter", content: ["1/ Short tweet...", "2/ Another tweet..."], type: "thread" }` (note: `"twitter"` is the Postiz API's external convention). Returns `{ platform: "x", status: "success", url: "https://x.com/user/status/123456789" }`.
- **Automation**: Yes
- **Traces**: FR-PUB-007, FR-PUB-008

**TC-PUB-008: Postiz retry on transient failures (500, 502, 503)**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Mock HTTP returns 502 twice, then 201
- **Test Steps**:
  1. Configure mock to return sequence: 502, 502, 201
  2. Call `PostizProvider.publish()`
- **Expected Result**: Three requests made. Final result is success.
- **Automation**: Yes
- **Traces**: FR-PUB-009

**TC-PUB-009: Receipt generation after successful publish**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Due item in `05_scheduled/` with mock providers returning success
- **Test Steps**:
  1. Configure mock Dev.to (URL: `https://dev.to/user/article-1`) and mock Postiz (URL: `https://x.com/user/status/999`)
  2. Run publish command
  3. Read `receipt.yaml` from `06_sent/` directory
- **Expected Result**: `receipt.yaml` contains `published_at` (valid ISO 8601), and `items` array with: `{ platform: "devto", status: "success", url: "https://dev.to/user/article-1" }` and `{ platform: "x", status: "success", url: "https://x.com/user/status/999" }`.
- **Automation**: Yes
- **Traces**: FR-PUB-003, FR-PUB-008

**TC-PUB-010: Partial publish (one platform succeeds, one fails)**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Mock Dev.to returns success, mock Postiz returns 500 (all retries fail)
- **Test Steps**:
  1. Run publish for a due item
  2. Check project location and receipt.yaml
- **Expected Result**: Project moved to `06_sent/`. `receipt.yaml` contains one success item (devto) and one failed item (x) with error message. `meta.yaml` status is `"published"`.
- **Automation**: Yes
- **Traces**: NFR-REL-001

**TC-PUB-011: Total publish failure (all platforms fail)**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: All mock providers return errors
- **Test Steps**:
  1. Run publish for a due item
  2. Check project location
- **Expected Result**: Project remains in `05_scheduled/`. `meta.yaml` updated with `status: "failed"` and `error` field containing summary. No `receipt.yaml` in `06_sent/`.
- **Automation**: Yes
- **Traces**: NFR-REL-001

**TC-PUB-012: Idempotency - re-publishing already sent content**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Project already in `06_sent/` from previous publish
- **Test Steps**:
  1. Move a project to `06_sent/`
  2. Run publish command
- **Expected Result**: The already-sent project is not re-published. No duplicate entries. The publish command only processes items in `05_scheduled/`.
- **Automation**: Yes
- **Traces**: NFR-REL-002

### 4.7 Content Validation Tests (TC-VALID-xxx)

**TC-VALID-001: X thread segment exactly at 280 characters**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: X content with one segment of exactly 280 characters
- **Test Steps**:
  1. Create content: `"a".repeat(280)`
  2. Call `PostizProvider.validate(content)` or X validator
- **Expected Result**: Returns `{ valid: true, errors: [] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-001

**TC-VALID-002: X thread segment at 281 characters**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: X content with one segment of 281 characters
- **Test Steps**:
  1. Create content: `"a".repeat(281)`
  2. Call validator
- **Expected Result**: Returns `{ valid: false, errors: ["X post segment 1 exceeds 280 character limit (found: 281)."] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-001

**TC-VALID-003: X thread with multiple segments, one over limit**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Two segments: first is 200 chars, second is 285 chars
- **Test Steps**:
  1. Create content: `"a".repeat(200) + "\n---\n" + "b".repeat(285)`
  2. Call validator
- **Expected Result**: Returns `{ valid: false, errors: ["X post segment 2 exceeds 280 character limit (found: 285)."] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-001, FR-VALID-004

**TC-VALID-004: X content is empty**
- **Priority**: P1
- **Type**: Unit
- **Test Steps**: Call validator with empty string `""`
- **Expected Result**: Returns `{ valid: false, errors: ["X content is empty --- no thread segments found."] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-001

**TC-VALID-005: Dev.to article with valid frontmatter**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Content from fixture `devto-article.md`
- **Test Steps**:
  1. Call `DevtoProvider.validate(devtoArticleContent)`
- **Expected Result**: Returns `{ valid: true, errors: [] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-002

**TC-VALID-006: Dev.to article missing frontmatter**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Content is `"# Just a heading\n\nNo frontmatter here."`
- **Test Steps**:
  1. Call validator with content lacking `---` frontmatter block
- **Expected Result**: Returns `{ valid: false, errors: ["Dev.to article missing required frontmatter block (---...---)."] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-002

**TC-VALID-007: Dev.to article with frontmatter but missing title**
- **Priority**: P0
- **Type**: Unit
- **Preconditions**: Content is `"---\ntags: ['ai']\n---\n\nContent without title."`
- **Test Steps**:
  1. Call validator
- **Expected Result**: Returns `{ valid: false, errors: ["Dev.to article missing required frontmatter field: title."] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-002

**TC-VALID-008: Dev.to article with empty content**
- **Priority**: P1
- **Type**: Unit
- **Test Steps**: Call validator with `""`
- **Expected Result**: Returns `{ valid: false, errors: ["Dev.to article content is empty."] }`.
- **Automation**: Yes
- **Traces**: FR-VALID-002

**TC-VALID-009: Validation blocks publish for failing platform only**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Due item with valid Dev.to content but invalid X content (segment over 280 chars)
- **Test Steps**:
  1. Set up project with valid `devto.md` and invalid `x.md` (300-char segment)
  2. Run publish
  3. Check receipt.yaml
- **Expected Result**: Dev.to published successfully. X recorded as failed with validation error. `receipt.yaml` contains both entries.
- **Automation**: Yes
- **Traces**: FR-VALID-003

**TC-VALID-010: Validation error messages are actionable**
- **Priority**: P1
- **Type**: Unit
- **Test Steps**:
  1. Trigger X validation failure with 300-char segment
  2. Check error message format
- **Expected Result**: Error contains (1) platform name `"X"`, (2) constraint `"280 character limit"`, (3) actual value `"found: 300"`.
- **Automation**: Yes
- **Traces**: FR-VALID-004

### 4.8 Media Manager Tests (TC-MEDIA-xxx)

**TC-MEDIA-001: Detect local image references in markdown**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Content contains `"![arch diagram](./images/arch.png)"` and `"![photo](https://cdn.example.com/photo.jpg)"`
- **Test Steps**:
  1. Call `detectLocalImages(content)`
- **Expected Result**: Returns `["./images/arch.png"]`. Does not include the `https://` URL.
- **Automation**: Yes
- **Traces**: FR-MEDIA-001

**TC-MEDIA-002: No local images in content**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Content contains only remote URLs or no images
- **Test Steps**:
  1. Call `detectLocalImages("No images here. ![remote](https://example.com/img.png)")`
- **Expected Result**: Returns empty array.
- **Automation**: Yes
- **Traces**: FR-MEDIA-001

**TC-MEDIA-003: Upload and URL replacement**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Mock upload API returns `{ cdn_url: "https://cdn.devto.com/uploads/abc123.png" }`
- **Test Steps**:
  1. Content: `"![diagram](./images/arch.png)"`
  2. Call media processing pipeline
- **Expected Result**: Output content: `"![diagram](https://cdn.devto.com/uploads/abc123.png)"`. Upload cache updated.
- **Automation**: Yes
- **Traces**: FR-MEDIA-002, FR-MEDIA-003

**TC-MEDIA-004: Upload cache prevents re-upload**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: `.upload_cache.yaml` contains entry for `./images/arch.png`
- **Test Steps**:
  1. Create cache entry: `{ "./images/arch.png": { cdn_url: "https://cdn.devto.com/cached.png", platform: "devto", uploaded_at: "2026-03-14T10:00:00Z", size_bytes: 245760 } }`
  2. Process same content again
  3. Count upload API calls
- **Expected Result**: Zero upload API calls made. CDN URL from cache used for replacement.
- **Automation**: Yes
- **Traces**: FR-MEDIA-004

**TC-MEDIA-005: Broken image path (file not found)**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: Content references `./images/missing.png` which does not exist on filesystem
- **Test Steps**:
  1. Call media processing
- **Expected Result**: Warning logged: `"Image not found: ./images/missing.png"`. Processing continues. Other images still processed.
- **Automation**: Yes
- **Traces**: FR-MEDIA-002

### 4.9 Watcher Daemon Tests (TC-WATCH-xxx)

**TC-WATCH-001: Watcher detects due items and publishes**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: `05_scheduled/2026-03-14-test-article/` exists with mock providers
- **Test Steps**:
  1. Start watcher with interval 1 (minute) in test mode
  2. Wait for one check cycle
  3. Stop watcher
- **Expected Result**: Due item is published and moved to `06_sent/`. `receipt.yaml` created.
- **Automation**: Yes
- **Traces**: FR-WATCH-001, FR-WATCH-003

**TC-WATCH-002: Watcher configurable interval**
- **Priority**: P1
- **Type**: Unit
- **Preconditions**: None
- **Test Steps**:
  1. Parse `--interval 30` flag
  2. Validate against `WatchParamsSchema`
- **Expected Result**: Interval set to 30 minutes. Default (no flag) is 60.
- **Automation**: Yes
- **Traces**: FR-WATCH-002

**TC-WATCH-003: Watcher does not re-publish sent items**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: Item published on first cycle and moved to `06_sent/`
- **Test Steps**:
  1. Run watcher for two check cycles
  2. Count total publish operations
- **Expected Result**: Exactly one publish operation executed (on first cycle). Second cycle finds no due items.
- **Automation**: Yes
- **Traces**: FR-WATCH-004

**TC-WATCH-004: Watcher graceful shutdown on SIGINT**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: Watcher running with an in-progress publish
- **Test Steps**:
  1. Start watcher
  2. Trigger publish for a due item
  3. Send SIGINT during publish
  4. Wait for process to exit
- **Expected Result**: In-progress publish completes. Process exits with code 0. No partially-moved directories.
- **Automation**: Partial (requires signal handling test)
- **Traces**: FR-WATCH-005

**TC-WATCH-005: Watcher writes log entries**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: Watcher runs one check cycle
- **Test Steps**:
  1. Run watcher for one cycle
  2. Read `reachforge-watcher.log`
- **Expected Result**: Log file contains entry with ISO 8601 timestamp, number of due items found, and publish outcome.
- **Automation**: Yes
- **Traces**: FR-WATCH-006

**TC-WATCH-006: Watcher with no due items**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: `05_scheduled/` is empty
- **Test Steps**:
  1. Run watcher for one cycle
- **Expected Result**: Log shows `"Check cycle: 0 due items found"`. No publish operations.
- **Automation**: Yes
- **Traces**: FR-WATCH-001

### 4.10 MCP Server Tests (TC-MCP-xxx)

**TC-MCP-001: MCP server registers 5 core tools**
- **Priority**: P2
- **Type**: Integration
- **Preconditions**: MCP server started
- **Test Steps**:
  1. Send MCP `tools/list` request
  2. Parse response
- **Expected Result**: Response contains at least 5 tools: `reachforge.status`, `reachforge.draft`, `reachforge.adapt`, `reachforge.schedule`, `reachforge.publish`. Each has `name`, `description`, and `inputSchema`.
- **Automation**: Yes
- **Traces**: FR-MCP-001, FR-MCP-002

**TC-MCP-002: MCP tool input validation via Zod**
- **Priority**: P2
- **Type**: Unit
- **Preconditions**: MCP tool definitions loaded
- **Test Steps**:
  1. Call `reachforge.draft` tool with `{ source: "" }` (empty string)
  2. Call `reachforge.schedule` tool with `{ article: "test", date: "invalid" }`
- **Expected Result**: Both return MCP error responses with validation messages. No pipeline operations invoked.
- **Automation**: Yes
- **Traces**: FR-MCP-003, NFR-SEC-003

**TC-MCP-003: MCP tool execution returns pipeline data**
- **Priority**: P2
- **Type**: Integration
- **Preconditions**: Pipeline with 2 items in inbox
- **Test Steps**:
  1. Call `reachforge.status` tool via MCP
- **Expected Result**: Response contains `stages` object with `01_inbox: { count: 2, items: [...] }` and other stages.
- **Automation**: Yes
- **Traces**: FR-MCP-002

**TC-MCP-004: MCP transport selection (stdio vs SSE)**
- **Priority**: P2
- **Type**: Integration
- **Test Steps**:
  1. Start MCP with `--transport stdio`
  2. Verify JSON-RPC communication on stdin/stdout
  3. Start MCP with `--transport sse --port 8000`
  4. Verify HTTP server on port 8000
- **Expected Result**: Both transports functional. stdio uses stdin/stdout. SSE binds to `127.0.0.1:8000`.
- **Automation**: Partial (manual verification for Claude Desktop compatibility)
- **Traces**: FR-MCP-004

### 4.11 Data Integrity Tests (TC-DATA-xxx)

**TC-DATA-001: meta.yaml schema validation (valid document)**
- **Priority**: P0
- **Type**: Unit
- **Test Steps**:
  1. Validate fixture `adapted.yaml` against `MetaSchema`
- **Test Data**: Fixture from Section 3.4
- **Expected Result**: Zod validation passes. All fields parsed correctly.
- **Automation**: Yes
- **Traces**: FR-PIPE-003

**TC-DATA-002: meta.yaml schema validation (missing required field)**
- **Priority**: P0
- **Type**: Unit
- **Test Steps**:
  1. Validate YAML: `"status: adapted"` (missing `article` field)
- **Expected Result**: Zod validation fails with error referencing `article` field.
- **Automation**: Yes
- **Traces**: FR-PIPE-003

**TC-DATA-003: meta.yaml schema validation (invalid status value)**
- **Priority**: P0
- **Type**: Unit
- **Test Steps**:
  1. Validate YAML: `"article: test\nstatus: invalid-status"`
- **Expected Result**: Zod validation fails. `status` must be one of: `drafted`, `master`, `adapted`, `scheduled`, `published`, `failed`.
- **Automation**: Yes
- **Traces**: FR-PIPE-003

**TC-DATA-004: receipt.yaml completeness after publish**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Successful publish to two platforms
- **Test Steps**:
  1. Read `receipt.yaml` from `06_sent/` project
  2. Validate against `ReceiptSchema`
- **Expected Result**: `published_at` is valid ISO 8601 datetime. `items` array has 2 entries. Each item has `platform`, `status`, and `url` (for success) or `error` (for failure).
- **Automation**: Yes
- **Traces**: FR-PUB-003

**TC-DATA-005: No orphaned files after failed publish**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: All platforms fail during publish
- **Test Steps**:
  1. Run publish (all mocks fail)
  2. Check `05_scheduled/` for the project
  3. Check `06_sent/` is empty
- **Expected Result**: Project directory intact in `05_scheduled/`. No partial directory in `06_sent/`. All original files preserved.
- **Automation**: Yes
- **Traces**: NFR-REL-001

**TC-DATA-006: No duplicate projects after repeated draft command**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: `01_inbox/my-idea.md` exists
- **Test Steps**:
  1. Run `reach draft my-idea.md` (creates `02_drafts/my-idea/`)
  2. Run `reach draft my-idea.md` again
  3. List contents of `02_drafts/`
- **Expected Result**: Single `my-idea/` directory in `02_drafts/`. No `my-idea-1/` or similar duplicates. Second run either overwrites or displays message about existing draft.
- **Automation**: Yes
- **Traces**: NFR-REL-002

**TC-DATA-007: Concurrent access safety**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: Two scheduled items due for publish
- **Test Steps**:
  1. Trigger publish for both items concurrently (simulating watcher + manual publish)
  2. Check final state
- **Expected Result**: Both items published without data corruption. No directory collisions. Each has its own receipt.yaml.
- **Automation**: Yes
- **Traces**: NFR-REL-001

**TC-DATA-008: File system state consistency after schedule**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: Project in `04_adapted/`
- **Test Steps**:
  1. Schedule the project
  2. List `04_adapted/` and `05_scheduled/`
- **Expected Result**: Project exists in exactly one location (`05_scheduled/`). Zero copies remain in `04_adapted/`.
- **Automation**: Yes
- **Traces**: FR-PIPE-004

### 4.12 Analytics Tests (TC-ANAL-xxx)

**TC-ANAL-001: Analytics command output with published history**
- **Priority**: P2
- **Type**: Integration
- **Preconditions**: `06_sent/` contains 3 published projects each with a valid `receipt.yaml` recording publishes to x, devto, wechat
- **Test Steps**:
  1. Run `reach analytics`
  2. Parse stdout output
- **Test Data**: 3 receipt files: 2 with all-success, 1 with x=success, devto=failed
- **Expected Result**: Output displays: `Total publishes: 3`, `devto: 2 success / 1 failed`, `x: 3 success / 0 failed`, `wechat: 2 success / 0 failed`. Exit code 0.
- **Automation**: Yes
- **Traces**: FR-ANAL-001

**TC-ANAL-002: Analytics with date range filter**
- **Priority**: P2
- **Type**: Unit
- **Preconditions**: `06_sent/` contains projects published on 2026-01-15, 2026-02-10, 2026-03-05
- **Test Steps**:
  1. Run `reach analytics --from 2026-02-01 --to 2026-02-28`
- **Expected Result**: Only the 2026-02-10 project is included in counts. Exit code 0.
- **Automation**: Yes
- **Traces**: FR-ANAL-002

**TC-ANAL-003: Analytics on empty publishing history**
- **Priority**: P2
- **Type**: Unit
- **Preconditions**: `06_sent/` is empty
- **Test Steps**:
  1. Run `reach analytics`
- **Expected Result**: Output displays "No publishing history found." Exit code 0.
- **Automation**: Yes
- **Traces**: FR-ANAL-003

### 4.13 Template Tests (TC-TMPL-xxx)

**TC-TMPL-001: Custom template loading for draft generation**
- **Priority**: P2
- **Type**: Integration
- **Preconditions**: `templates/tech-blog.yaml` exists with content: `prompt: "Write a detailed technical blog post about: {{topic}}"`. Mock LLM configured.
- **Test Steps**:
  1. Create `01_inbox/my-idea/idea.md` with content "Bun vs Deno"
  2. Run `reach draft my-idea --template tech-blog`
- **Test Data**: Template file at `templates/tech-blog.yaml`, inbox content "Bun vs Deno"
- **Expected Result**: The LLM is called with a prompt containing "Write a detailed technical blog post about:" instead of the default prompt. Draft saved to `02_drafts/my-idea/draft.md`.
- **Automation**: Yes
- **Traces**: FR-TMPL-001

**TC-TMPL-002: Default platform templates exist**
- **Priority**: P2
- **Type**: Unit
- **Preconditions**: Fresh reachforge installation
- **Test Steps**:
  1. Check `templates/` directory for default template files
- **Expected Result**: Default templates exist: `templates/default-draft.yaml`, `templates/default-x.yaml`, `templates/default-wechat.yaml`, `templates/default-zhihu.yaml`, `templates/default-devto.yaml`.
- **Automation**: Yes
- **Traces**: FR-TMPL-002

**TC-TMPL-003: Invalid template reference error**
- **Priority**: P2
- **Type**: Unit
- **Preconditions**: No file at `templates/nonexistent.yaml`
- **Test Steps**:
  1. Run `reach draft my-idea --template nonexistent`
- **Expected Result**: Error message: `Template 'nonexistent' not found in templates/`. Exit code 1. No draft created.
- **Automation**: Yes
- **Traces**: FR-TMPL-003

**TC-TMPL-004: Per-article template via meta.yaml**
- **Priority**: P2
- **Type**: Integration
- **Preconditions**: `03_master/my-article/meta.yaml` contains `template: "tech-blog"`. `templates/tech-blog.yaml` exists. Mock LLM configured.
- **Test Steps**:
  1. Run `reach adapt my-article`
- **Expected Result**: Adaptation uses the tech-blog template prompts instead of defaults. Platform version files created in `04_adapted/my-article/platform_versions/`.
- **Automation**: Yes
- **Traces**: FR-TMPL-004

### 4.14 Hashnode and GitHub Provider Tests (TC-PUB-013, TC-PUB-014)

**TC-PUB-013: Hashnode GraphQL publish**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: `HASHNODE_API_KEY` and `HASHNODE_PUBLICATION_ID` configured. Mock GraphQL server intercepting `api.hashnode.com`.
- **Test Steps**:
  1. Prepare adapted content at `05_scheduled/2026-03-20-hashnode-test/platform_versions/hashnode.md` with title and body
  2. Execute publish for hashnode platform
  3. Verify GraphQL mutation sent: `createPublicationStory` with `title`, `contentMarkdown`, `publicationId`
  4. Mock returns `{ data: { createPublicationStory: { post: { slug: "test-post" } } } }`
- **Test Data**: Content: "# Test Article\n\nBody content for Hashnode." Publication ID: `test-pub-id-12345`
- **Expected Result**: `receipt.yaml` contains `{ platform: "hashnode", status: "success", url: "https://hashnode.com/post/test-post" }`.
- **Automation**: Yes
- **Traces**: FR-PROV-001

**TC-PUB-014: GitHub Discussions publish**
- **Priority**: P1
- **Type**: Integration
- **Preconditions**: `GITHUB_TOKEN` configured. `github.owner`, `github.repo`, `github.discussionCategory` set. Mock GraphQL server intercepting `api.github.com`.
- **Test Steps**:
  1. Prepare adapted content at `05_scheduled/2026-03-20-gh-test/platform_versions/github.md`
  2. Execute publish for github platform
  3. Verify GraphQL mutation sent: `createDiscussion` with `repositoryId`, `categoryId`, `title`, `body`
  4. Mock returns `{ data: { createDiscussion: { discussion: { url: "https://github.com/owner/repo/discussions/42" } } } }`
- **Test Data**: Content: "# Discussion Title\n\nBody." Owner: `testowner`, Repo: `testrepo`, Category: `General`
- **Expected Result**: `receipt.yaml` contains `{ platform: "github", status: "success", url: "https://github.com/owner/repo/discussions/42" }`.
- **Automation**: Yes
- **Traces**: FR-PROV-002

### 4.15 End-to-End Tests (TC-E2E-xxx)

**TC-E2E-001: Full pipeline - inbox to sent (mock APIs)**
- **Priority**: P0
- **Type**: E2E
- **Preconditions**: Clean working directory. Mock LLM and mock platform APIs configured. All API keys set.
- **Test Steps**:
  1. Create `01_inbox/e2e-test-article/idea.md` with content: `"Write about Bun runtime performance vs Node.js"`
  2. Run `reach draft e2e-test-article`
  3. Verify `02_drafts/e2e-test-article/draft.md` exists and is non-empty
  4. Copy `02_drafts/e2e-test-article/` to `03_master/e2e-test-article/`, rename `draft.md` to `master.md`
  5. Run `reach adapt e2e-test-article --platforms x,devto`
  6. Verify `04_adapted/e2e-test-article/platform_versions/x.md` and `devto.md` exist
  7. Run `reach schedule e2e-test-article 2026-03-14`
  8. Verify `05_scheduled/2026-03-14-e2e-test-article/` exists
  9. Run `reach publish`
  10. Verify `06_sent/2026-03-14-e2e-test-article/` exists with `receipt.yaml`
- **Test Data**: Inbox content: `"Write about Bun runtime performance vs Node.js"`. Schedule date: `2026-03-14`.
- **Expected Result**: Project traverses all 6 stages. Final `receipt.yaml` contains success entries for devto and x. No files remain in intermediate stages for this project.
- **Automation**: Yes
- **Traces**: UC-001, All FR-PIPE-*, FR-DRAFT-*, FR-ADAPT-*, FR-LIFE-*, FR-PUB-*

**TC-E2E-002: Full pipeline with partial publish failure**
- **Priority**: P0
- **Type**: E2E
- **Preconditions**: Same as TC-E2E-001 but Postiz mock returns 500
- **Test Steps**:
  1. Follow steps 1-8 from TC-E2E-001
  2. Configure Postiz mock to fail
  3. Run `reach publish`
  4. Check final state
- **Expected Result**: Project moved to `06_sent/`. `receipt.yaml` has `devto: success` and `x: failed`. Project is not stuck in `05_scheduled/`.
- **Automation**: Yes
- **Traces**: UC-004 (exception flow), NFR-REL-001

**TC-E2E-003: MCP-driven pipeline**
- **Priority**: P2
- **Type**: E2E
- **Preconditions**: MCP server running. Mock APIs configured.
- **Test Steps**:
  1. Call `reachforge.status` tool --- verify inbox has items
  2. Call `reachforge.draft` tool with source name
  3. Call `reachforge.adapt` tool with article name
  4. Call `reachforge.schedule` tool with date
  5. Call `reachforge.publish` tool
- **Expected Result**: All MCP tool calls succeed. Pipeline state changes match CLI behavior exactly.
- **Automation**: Partial
- **Traces**: UC-005, FR-MCP-002

---

## 5. Non-Functional Test Cases

### 5.1 Performance Tests (TC-PERF-xxx)

**TC-PERF-001: Status command latency with 100 projects**
- **Priority**: P0
- **Type**: Performance
- **Preconditions**: 100 projects distributed across pipeline stages
- **Test Steps**:
  1. Create 100 project directories (20 per stage for 5 stages)
  2. Run `reach status` 10 times consecutively
  3. Measure wall clock time for each run
- **Expected Result**: p95 latency is under 500ms.
- **Automation**: Yes
- **Traces**: NFR-PERF-001

**TC-PERF-002: Compiled binary size**
- **Priority**: P0
- **Type**: Performance
- **Preconditions**: Project compiled with `bun build`
- **Test Steps**:
  1. Run `bun build --compile --target=bun-darwin-arm64 src/index.ts`
  2. Measure output file size
- **Expected Result**: Binary size is under 52,428,800 bytes (50 MB).
- **Automation**: Yes
- **Traces**: NFR-PERF-004

**TC-PERF-003: Concurrent publish to 10 platforms**
- **Priority**: P1
- **Type**: Performance
- **Preconditions**: 10 mock providers each with 200ms latency
- **Test Steps**:
  1. Configure 10 mock providers
  2. Run publish for one project
  3. Measure total wall time
- **Expected Result**: Total wall time < 2x single provider latency (under 600ms). All 10 results returned.
- **Automation**: Yes
- **Traces**: NFR-PERF-003

### 5.2 Security Tests (TC-SEC-xxx)

**TC-SEC-001: API keys not accepted via CLI arguments**
- **Priority**: P0
- **Type**: Unit
- **Test Steps**:
  1. Verify no CLI command defines a `--api-key` option
  2. Verify Commander configuration has no argument for API keys
- **Expected Result**: No CLI parameter accepts API key values. Keys are only loaded from environment or files.
- **Automation**: Yes
- **Traces**: NFR-SEC-001

**TC-SEC-002: .gitignore contains credential files**
- **Priority**: P0
- **Type**: Unit
- **Test Steps**:
  1. Read `.gitignore` from project root
  2. Check for entries: `.env`, `credentials.yaml`
- **Expected Result**: Both `.env` and `credentials.yaml` are present in `.gitignore`.
- **Automation**: Yes
- **Traces**: NFR-SEC-001

**TC-SEC-003: Path traversal prevention in project names**
- **Priority**: P0
- **Type**: Unit
- **Test Steps**:
  1. Call `DraftParamsSchema.parse({ source: "../../../etc/passwd" })`
  2. Call `AdaptParamsSchema.parse({ article: "../../secrets" })`
  3. Call `ScheduleParamsSchema.parse({ article: "/etc/shadow", date: "2026-03-20" })`
- **Expected Result**: All three throw Zod validation errors. No filesystem operations attempted.
- **Automation**: Yes
- **Traces**: NFR-SEC-001

**TC-SEC-004: API keys not logged to stdout or log files**
- **Priority**: P0
- **Type**: Integration
- **Preconditions**: API keys configured. Watcher running.
- **Test Steps**:
  1. Capture all stdout output during a publish operation
  2. Read watcher log file
  3. Search for any configured API key values
- **Expected Result**: No API key substring appears in stdout or log file content.
- **Automation**: Yes
- **Traces**: NFR-SEC-001

**TC-SEC-005: MCP server validates inputs before executing operations**
- **Priority**: P1
- **Type**: Unit
- **Test Steps**:
  1. Send MCP call to `reachforge.draft` with `{ source: "" }` (empty)
  2. Send MCP call to `reachforge.schedule` with `{ article: "../traversal", date: "2026-03-20" }`
  3. Verify no filesystem operations occurred
- **Expected Result**: Both return MCP error responses. Pipeline state unchanged.
- **Automation**: Yes
- **Traces**: NFR-SEC-003

**TC-SEC-006: No outbound connections to unexpected hosts**
- **Priority**: P1
- **Type**: Integration
- **Test Steps**:
  1. Mock all HTTP calls and track request URLs
  2. Run full pipeline
  3. Verify all requests go to allowed hosts only
- **Expected Result**: Requests only to: `generativelanguage.googleapis.com`, `dev.to`, `api.postiz.com`, `gql.hashnode.com`, `api.github.com`. No other hosts contacted.
- **Automation**: Yes
- **Traces**: NFR-SEC-002

### 5.3 Compatibility Tests (TC-COMPAT-xxx)

**TC-COMPAT-001: Binary builds for all target platforms**
- **Priority**: P1
- **Type**: Compatibility
- **Test Steps**:
  1. Run `bun build --compile --target=bun-darwin-arm64`
  2. Run `bun build --compile --target=bun-linux-x64`
  3. Run `bun build --compile --target=bun-windows-x64`
- **Expected Result**: All three binaries produced without errors. Each binary file exists and is executable on its target platform.
- **Automation**: Partial (CI matrix for each platform)
- **Traces**: NFR-COMPAT-001

**TC-COMPAT-002: Bun runtime version 1.0 compatibility**
- **Priority**: P1
- **Type**: Compatibility
- **Test Steps**:
  1. Run `reach status` on Bun 1.0.0
  2. Run `reach status` on latest Bun
- **Expected Result**: Both produce identical correct output.
- **Automation**: Partial (CI matrix)
- **Traces**: NFR-COMPAT-002

---

## 6. Traceability Matrix

### 6.1 Functional Requirements to Test Cases

| SRS Requirement | Test Case(s)                                     | Priority |
|-----------------|--------------------------------------------------|----------|
| FR-PIPE-001     | TC-PIPE-001, TC-PIPE-002, TC-PIPE-003, TC-CLI-002 | P0       |
| FR-PIPE-002     | TC-PIPE-004, TC-PIPE-008                         | P0       |
| FR-PIPE-003     | TC-PIPE-012, TC-PIPE-013, TC-DATA-001, TC-DATA-002, TC-DATA-003 | P0 |
| FR-PIPE-004     | TC-PIPE-005, TC-PIPE-006, TC-PIPE-007, TC-DATA-008 | P0     |
| FR-DASH-001     | TC-CLI-001, TC-CLI-002, TC-PIPE-008, TC-PIPE-010 | P0       |
| FR-DASH-002     | TC-CLI-001                                       | P0       |
| FR-DASH-003     | TC-CLI-001 (visual)                              | P0       |
| FR-DASH-004     | TC-PIPE-011, TC-PERF-001                         | P0       |
| FR-LIFE-001     | TC-CLI-003, TC-CLI-005                           | P0       |
| FR-LIFE-002     | TC-CLI-004                                       | P0       |
| FR-LIFE-003     | TC-CLI-003                                       | P0       |
| FR-LIFE-004     | TC-PIPE-005, TC-CLI-003                          | P0       |
| FR-LIFE-005     | TC-CLI-011                                       | P0       |
| FR-DRAFT-001    | TC-DRAFT-001, TC-DRAFT-002, TC-DRAFT-003         | P0       |
| FR-DRAFT-002    | TC-DRAFT-007                                     | P0       |
| FR-DRAFT-003    | TC-DRAFT-001, TC-DRAFT-005                       | P0       |
| FR-DRAFT-004    | TC-DRAFT-001                                     | P0       |
| FR-DRAFT-005    | TC-CLI-006                                       | P0       |
| FR-DRAFT-006    | TC-CLI-007                                       | P0       |
| FR-DRAFT-007    | TC-DRAFT-006                                     | P0       |
| FR-ADAPT-001    | TC-ADAPT-001, TC-ADAPT-002, TC-ADAPT-005         | P0       |
| FR-ADAPT-002    | TC-ADAPT-001, TC-ADAPT-003, TC-ADAPT-006, TC-ADAPT-007 | P0 |
| FR-ADAPT-003    | TC-ADAPT-001                                     | P0       |
| FR-ADAPT-004    | TC-ADAPT-001                                     | P0       |
| FR-ADAPT-005    | TC-CLI-008                                       | P0       |
| FR-ADAPT-006    | TC-ADAPT-004                                     | P0       |
| FR-ADAPT-007    | TC-CLI-009                                       | P0       |
| FR-PUB-001      | TC-PUB-001, TC-PUB-005, TC-PUB-006              | P0       |
| FR-PUB-002      | TC-PUB-001                                       | P0       |
| FR-PUB-003      | TC-PUB-009, TC-DATA-004                          | P0       |
| FR-PUB-004      | TC-PUB-001, TC-PUB-002                           | P0       |
| FR-PUB-005      | TC-PUB-003, TC-PUB-004, TC-PUB-005              | P0       |
| FR-PUB-006      | TC-PUB-007                                       | P0       |
| FR-PUB-007      | TC-PUB-007                                       | P0       |
| FR-PUB-008      | TC-PUB-007, TC-PUB-009                           | P0       |
| FR-PUB-009      | TC-PUB-008                                       | P0       |
| FR-PROV-001     | TC-PUB-007 (pattern applies to Hashnode)         | P1       |
| FR-PROV-002     | TC-PUB-007 (pattern applies to GitHub)           | P1       |
| FR-PROV-003     | TC-PROV-006                                      | P1       |
| FR-MEDIA-001    | TC-MEDIA-001, TC-MEDIA-002                       | P1       |
| FR-MEDIA-002    | TC-MEDIA-003, TC-MEDIA-005                       | P1       |
| FR-MEDIA-003    | TC-MEDIA-003                                     | P1       |
| FR-MEDIA-004    | TC-MEDIA-004                                     | P1       |
| FR-WATCH-001    | TC-WATCH-001, TC-PIPE-009                        | P1       |
| FR-WATCH-002    | TC-WATCH-002                                     | P1       |
| FR-WATCH-003    | TC-WATCH-001                                     | P1       |
| FR-WATCH-004    | TC-WATCH-003                                     | P1       |
| FR-WATCH-005    | TC-WATCH-004                                     | P1       |
| FR-WATCH-006    | TC-WATCH-005                                     | P1       |
| FR-MCP-001      | TC-MCP-001                                       | P2       |
| FR-MCP-002      | TC-MCP-001, TC-MCP-003                           | P2       |
| FR-MCP-003      | TC-MCP-002                                       | P2       |
| FR-MCP-004      | TC-MCP-004                                       | P2       |
| FR-MCP-005      | TC-E2E-003                                       | P2       |
| FR-PLUG-001     | TC-PROV-005                                      | P1       |
| FR-PLUG-002     | TC-PROV-001, TC-PROV-002                         | P1       |
| FR-PLUG-003     | TC-PROV-003                                      | P1       |
| FR-PLUG-004     | TC-PROV-004                                      | P1       |
| FR-VALID-001    | TC-VALID-001, TC-VALID-002, TC-VALID-003, TC-VALID-004 | P1 |
| FR-VALID-002    | TC-VALID-005, TC-VALID-006, TC-VALID-007, TC-VALID-008 | P1 |
| FR-VALID-003    | TC-VALID-009                                     | P1       |
| FR-VALID-004    | TC-VALID-010                                     | P1       |
| FR-ANAL-001     | TC-ANAL-001                                      | P2       |
| FR-ANAL-002     | TC-ANAL-002                                      | P2       |
| FR-ANAL-003     | TC-ANAL-003                                      | P2       |
| FR-TMPL-001     | TC-TMPL-001                                      | P2       |
| FR-TMPL-002     | TC-TMPL-002                                      | P2       |
| FR-TMPL-003     | TC-TMPL-003                                      | P2       |
| FR-TMPL-004     | TC-TMPL-004                                      | P2       |
| FR-PROV-001     | TC-PROV-005, TC-PUB-013                          | P1       |
| FR-PROV-002     | TC-PUB-014                                       | P1       |

### 6.2 Non-Functional Requirements to Test Cases

| SRS Requirement    | Test Case(s)                         |
|--------------------|--------------------------------------|
| NFR-PERF-001       | TC-PERF-001, TC-PIPE-011            |
| NFR-PERF-002       | TC-DRAFT-006                        |
| NFR-PERF-003       | TC-PERF-003                         |
| NFR-PERF-004       | TC-PERF-002                         |
| NFR-SEC-001        | TC-SEC-001, TC-SEC-002, TC-SEC-004  |
| NFR-SEC-002        | TC-SEC-006                          |
| NFR-SEC-003        | TC-SEC-005, TC-MCP-002              |
| NFR-COMPAT-001     | TC-COMPAT-001                       |
| NFR-COMPAT-002     | TC-COMPAT-002                       |
| NFR-COMPAT-003     | TC-MCP-004                          |
| NFR-REL-001        | TC-PUB-010, TC-PUB-011, TC-DATA-005 |
| NFR-REL-002        | TC-PIPE-002, TC-PUB-012, TC-DATA-006 |
| NFR-USAB-001       | TC-CLI-005, TC-DRAFT-004 (verify error message includes cause and resolution hint) |
| NFR-USAB-002       | TC-E2E-001 (verify pipeline completable using only `--help` output) |
| NFR-MAINT-001      | Static analysis: no source file exceeds 300 lines |
| NFR-MAINT-002      | TC-PROV-005 (verify PlatformProvider interface conformance) |

### 6.3 Coverage Summary

| Module         | Total TCs | Unit | Integration | E2E | Non-Functional |
|----------------|-----------|------|-------------|-----|----------------|
| Pipeline Core  | 13        | 11   | 2           | -   | -              |
| CLI Commands   | 11        | -    | 11          | -   | -              |
| AI Draft       | 7         | 6    | 1           | -   | -              |
| AI Adapt       | 7         | 7    | -           | -   | -              |
| Providers      | 6         | 6    | -           | -   | -              |
| Publishing     | 14        | 7    | 7           | -   | -              |
| Validation     | 10        | 9    | 1           | -   | -              |
| Media          | 5         | 5    | -           | -   | -              |
| Watcher        | 6         | 1    | 5           | -   | -              |
| MCP            | 4         | 1    | 3           | -   | -              |
| Data Integrity | 8         | 3    | 5           | -   | -              |
| Analytics      | 3         | 1    | 2           | -   | -              |
| Templates      | 4         | 2    | 2           | -   | -              |
| E2E            | 3         | -    | -           | 3   | -              |
| Performance    | 3         | -    | -           | -   | 3              |
| Security       | 6         | 3    | 3           | -   | -              |
| Compatibility  | 2         | -    | -           | -   | 2              |
| **Total**      | **112**   | **62** | **42**    | **3** | **5**        |

---

## 7. Risk-Based Testing Priority

### 7.1 Risk Matrix

| Risk                                    | Probability | Impact  | Risk Score | Test Priority |
|-----------------------------------------|-------------|---------|------------|---------------|
| Data loss during stage transitions      | Medium      | Critical| High       | P0 --- test first |
| Corrupt meta.yaml blocks pipeline       | Medium      | High    | High       | P0            |
| API key exposed in logs/output          | Low         | Critical| High       | P0            |
| Dev.to API returns unexpected format    | Medium      | High    | High       | P0            |
| Publish fails silently (no receipt)     | Low         | Critical| High       | P0            |
| Path traversal via crafted project name | Low         | Critical| High       | P0            |
| X thread exceeds 280 chars             | High        | Medium  | High       | P0            |
| Watcher re-publishes sent content       | Low         | High    | Medium     | P1            |
| LLM returns empty/malformed response    | Medium      | Medium  | Medium     | P1            |
| Plugin loader fails on malformed provider| Low        | Medium  | Low        | P1            |
| MCP tool returns invalid JSON           | Low         | Low     | Low        | P2            |
| Binary exceeds 50 MB                    | Low         | Low     | Low        | P2            |

### 7.2 Test Prioritization

**Execute first (P0)**: TC-PIPE-005 through TC-PIPE-007 (stage transitions), TC-PUB-009 through TC-PUB-011 (receipt and failure handling), TC-SEC-003 (path traversal), TC-DATA-005 (no orphans), TC-VALID-001 through TC-VALID-003 (X limits).

**Execute second (P1)**: Provider plugin tests, media manager tests, watcher tests, remaining validation tests.

**Execute third (P2)**: MCP server tests, compatibility tests.

### 7.3 Regression Test Selection

The regression suite consists of all P0 test cases (approximately 60 tests) plus the E2E full pipeline test (TC-E2E-001). This suite runs on every commit via CI. The full suite (all 103 tests) runs on pull requests targeting the main branch.

---

## 8. Test Data Management

### 8.1 Fixture Files

All fixtures are stored in `tests/fixtures/` and version-controlled. Fixtures are read-only during tests --- never modified in place. Tests that need to modify fixtures copy them to temporary directories first.

**Pipeline setup utility** (`tests/helpers/temp-pipeline.ts`):
```typescript
export async function createTempPipeline(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'reachforge-test-'));
  const stages = ['01_inbox', '02_drafts', '03_master', '04_adapted', '05_scheduled', '06_sent'];
  for (const stage of stages) {
    await mkdir(join(dir, stage), { recursive: true });
  }
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
```

### 8.2 Mock API Response Fixtures

Stored as JSON files in `tests/fixtures/api-responses/`. Examples:

**`devto-201.json`**:
```json
{
  "id": 12345,
  "url": "https://dev.to/testuser/ai-code-review-tools-abc123",
  "slug": "ai-code-review-tools-abc123",
  "title": "AI-Powered Code Review Tools: A Deep Dive",
  "published": false
}
```

**`devto-429.json`**:
```json
{
  "error": "Rate limit exceeded",
  "status": 429
}
```

### 8.3 Test Pipeline Teardown

Every test that creates temporary directories must clean up in `afterEach` or `afterAll`. The global setup file (`tests/setup.ts`) registers a process exit handler to clean up any leaked temporary directories.

---

## 9. Defect Management

### 9.1 Defect Lifecycle

```
Open -> Triaged -> In Progress -> Fixed -> Verified -> Closed
                                       \-> Reopened -> In Progress
```

### 9.2 Severity Classification

| Severity | Definition                                         | Example                                      |
|----------|----------------------------------------------------|----------------------------------------------|
| S1       | Data loss, security breach, or complete feature failure | Files deleted during stage transition       |
| S2       | Feature partially broken, workaround exists        | Publish succeeds but receipt.yaml malformed  |
| S3       | Minor functional issue, cosmetic                   | Color indicator wrong in status output       |
| S4       | Documentation, minor UX polish                     | Typo in error message                        |

### 9.3 Quality Gates

| Gate                       | Threshold                           | Enforced At       |
|----------------------------|-------------------------------------|-------------------|
| Unit test pass rate        | 100%                                | Every commit      |
| Integration test pass rate | 100%                                | Every commit      |
| Line coverage (core/)      | >= 90%                              | Pull request      |
| Line coverage (providers/) | >= 90%                              | Pull request      |
| E2E test pass rate         | 100%                                | Release candidate |
| P0 defects open            | 0                                   | Release           |
| P1 defects open            | <= 3                                | Release           |

---

*End of Test Plan. This document shall be reviewed and updated as the reachforge codebase progresses through the migration steps defined in the Technical Design.*
