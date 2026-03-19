# Software Requirements Specification: reachforge

| Field            | Value                                              |
|------------------|----------------------------------------------------|
| **Document**     | reachforge SRS v1.0                                    |
| **Author**       | aipartnerup Engineering                            |
| **Date**         | 2026-03-14                                         |
| **Status**       | Draft                                              |
| **Version**      | 1.0                                                |
| **PRD Reference**| [reachforge PRD v1.0](prd.md)                         |
| **Decomposition**| [reachforge Decomposition](decomposition.md)           |
| **Standard**     | IEEE 830 / ISO/IEC/IEEE 29148                      |

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification defines the complete functional and non-functional requirements for **reachforge**, an AI-native Social Influence Engine. The intended audience includes developers implementing the system, QA engineers writing test plans, and stakeholders reviewing scope. This document transforms the product-level requirements in the PRD into formal, testable, traceable engineering requirements.

### 1.2 Scope

reachforge is a CLI-based tool that transforms raw content ideas into platform-optimized, publication-ready social media assets through a six-stage file-based pipeline. The system:

- Accepts raw ideas as markdown/text files in an inbox directory.
- Generates long-form article drafts via Google Gemini AI.
- Adapts drafts into platform-specific versions (X, WeChat, Zhihu, Dev.to, Hashnode).
- Schedules content for future publication.
- Publishes to platforms via native APIs (Dev.to, Hashnode, GitHub) and SaaS bridges (X via Postiz).
- Exposes all operations via MCP Server for AI agent integration.

reachforge does NOT provide: a web UI (except via VS Code extension in Phase 4), user authentication/accounts, a hosted SaaS backend, or real-time collaborative editing.

### 1.3 Definitions, Acronyms, and Abbreviations

| Term               | Definition                                                                 |
|--------------------|----------------------------------------------------------------------------|
| **Pipeline**       | The six-stage content processing workflow (inbox through sent)             |
| **Stage**          | One of the six directories representing content state                      |
| **Project**        | A content item (directory) moving through the pipeline                     |
| **Provider**       | A module that publishes content to a specific platform                     |
| **Native Provider**| A provider that calls a platform's API directly                            |
| **SaaS Bridge**    | A provider that publishes via a third-party SaaS intermediary              |
| **Adaptation**     | AI-generated transformation of master content for a specific platform      |
| **Receipt**        | A YAML record of publishing outcomes (URLs, timestamps, status)            |
| **MCP**            | Model Context Protocol --- standard for AI agent tool integration          |
| **APCore**         | aipartnerup Core framework for module registration and lifecycle           |
| **SSE**            | Server-Sent Events transport for MCP                                       |
| **Bun**            | JavaScript/TypeScript runtime used to execute reachforge                       |
| **Gemini**         | Google's generative AI model used for content generation                   |
| **Postiz**         | Open-source social media scheduling SaaS used as X publishing bridge       |

### 1.4 References

1. reachforge PRD v1.0 (`docs/reachforge/prd.md`)
2. reachforge Decomposition (`docs/reachforge/decomposition.md`)
3. IEEE 830-1998 --- Recommended Practice for Software Requirements Specifications
4. ISO/IEC/IEEE 29148:2018 --- Systems and software engineering --- Life cycle processes --- Requirements engineering
5. MCP Specification (https://modelcontextprotocol.io)
6. Dev.to API v1 Documentation (https://developers.forem.com/api)
7. Postiz API Documentation

### 1.5 Document Overview

Section 2 describes the overall system context. Section 3 defines the data model. Section 4 specifies all functional requirements grouped by module. Section 5 specifies non-functional requirements. Section 6 provides detailed use cases. Section 7 maps traceability between PRD features and SRS requirements. Section 8 defines external interface requirements. Section 9 contains appendices.

---

## 2. Overall Description

### 2.1 Product Perspective

reachforge is a component within the **aipartnerup** ecosystem:

- **apcore-js**: Provides module registration, lifecycle management, and the foundational runtime. reachforge registers all pipeline operations as apcore modules.
- **apcore-mcp**: Provides MCP server infrastructure. reachforge uses this to expose pipeline operations as AI-agent-callable tools.
- **apflow** (future): Workflow orchestration that may automate multi-step reachforge pipelines.

reachforge operates entirely on the local filesystem. It requires no database, no cloud account (beyond API keys for target platforms and Gemini), and no persistent server process (except in watcher/MCP modes).

### 2.2 Product Functions (High-Level)

1. **Pipeline Management**: Create and traverse a six-stage directory-based content pipeline.
2. **AI Content Generation**: Generate long-form drafts from raw ideas using Google Gemini.
3. **AI Platform Adaptation**: Transform master content into platform-specific formats.
4. **Scheduled Publishing**: Time-based content publication with date-stamped scheduling.
5. **Multi-Platform Publishing**: Publish to Dev.to (native), X (via Postiz), Hashnode, and GitHub.
6. **Content Validation**: Pre-publish quality checks against platform constraints.
7. **Watcher Daemon**: Background process for automatic scheduled publishing.
8. **MCP Server**: AI agent integration via Model Context Protocol.
9. **Analytics**: Publishing history and success metrics aggregation.
10. **Template System**: User-customizable AI prompt templates.
11. **VS Code Extension**: Visual interface via sidecar pattern.

### 2.3 User Characteristics

| Persona  | Technical Level | Primary Workflow       | Key Expectation                        |
|----------|----------------|------------------------|----------------------------------------|
| Alex     | High           | CLI, VS Code, Git      | End-to-end pipeline in under 10 min    |
| Mei      | High           | Bun, MCP, bilingual    | Cross-platform + cross-language adapt  |
| Jordan   | Medium         | CLI-capable, prefers GUI | Drop content, get social posts out    |

All target users are comfortable with YAML configuration files, environment variables, and terminal-based workflows. Jordan (medium comfort) represents the lower bound and motivates the VS Code extension requirement.

### 2.4 Constraints

- **Technical**: Bun >= 1.0 runtime required. Single-threaded JavaScript execution model. File I/O bound by local disk speed.
- **External API**: Gemini API rate limits and pricing apply. Dev.to API rate limits (30 requests/30 seconds). Postiz API availability and pricing TBD.
- **Architecture**: File-based state only; no database. Pipeline directories must reside in a single working directory.
- **Binary Size**: Compiled binary shall remain under 50 MB.
- **Security**: No telemetry. All content local. API keys must never be committed to version control.

### 2.5 Assumptions and Dependencies

| # | Assumption/Dependency                                                          | Type        |
|---|--------------------------------------------------------------------------------|-------------|
| 1 | Google Gemini API remains available with the `gemini-pro` model                | Dependency  |
| 2 | Postiz Cloud API provides stable endpoints for X publishing                    | Dependency  |
| 3 | Dev.to Forem API v1 remains backward-compatible                                | Dependency  |
| 4 | Users have filesystem write access in the working directory                    | Assumption  |
| 5 | apcore-js and apcore-mcp packages remain compatible with current interfaces    | Dependency  |
| 6 | Users provide valid API keys before invoking AI or publishing commands          | Assumption  |
| 7 | Target platforms do not require OAuth flows that need browser interaction       | Assumption  |

---

## 3. Data Model

### 3.1 Data Entities

#### 3.1.1 `meta.yaml` (Per-Project Metadata)

Located at `<stage>/<project>/meta.yaml`. Created at draft generation; updated at each stage transition.

| Field              | Type       | Required | Constraints                              | Example                        |
|--------------------|------------|----------|------------------------------------------|--------------------------------|
| `article`          | string     | Yes      | Non-empty; matches source filename       | `"my-blog-post"`              |
| `status`           | string     | Yes      | One of: `drafted`, `master`, `adapted`, `scheduled`, `published`, `failed` | `"adapted"` |
| `publish_date`     | string     | No       | ISO 8601 date format `YYYY-MM-DD`        | `"2026-03-20"`                |
| `adapted_platforms`| string[]   | No       | Valid platform identifiers               | `["x", "wechat", "zhihu"]`   |
| `platforms`        | object     | No       | Map of platform name to status object    | See 3.1.1a below              |
| `notes`            | string     | No       | Free-text editor notes                   | `"Add thread split markers"`  |
| `template`         | string     | No       | Template name reference                  | `"tech-blog"`                 |
| `error`            | string     | No       | Last error message if status is `failed` | `"API rate limit exceeded"`   |
| `created_at`       | string     | No       | ISO 8601 datetime                        | `"2026-03-14T10:00:00Z"`     |
| `updated_at`       | string     | No       | ISO 8601 datetime                        | `"2026-03-14T12:30:00Z"`     |

**3.1.1a Platform Status Object**

| Field    | Type   | Required | Constraints                           | Example      |
|----------|--------|----------|---------------------------------------|--------------|
| `status` | string | Yes      | One of: `pending`, `success`, `failed`| `"pending"`  |
| `method` | string | Yes      | One of: `auto`, `manual`              | `"auto"`     |
| `url`    | string | No       | Valid URL or empty string             | `""`         |

#### 3.1.2 `receipt.yaml` (Publishing Receipt)

Located at `<stage>/<project>/receipt.yaml`. Created by the publish operation.

| Field           | Type     | Required | Constraints                    | Example                        |
|-----------------|----------|----------|--------------------------------|--------------------------------|
| `published_at`  | string   | Yes      | ISO 8601 datetime              | `"2026-03-20T08:00:00Z"`     |
| `items`         | object[] | Yes      | Non-empty array                | See 3.1.2a below               |

**3.1.2a Receipt Item**

| Field      | Type   | Required | Constraints                          | Example                              |
|------------|--------|----------|--------------------------------------|--------------------------------------|
| `platform` | string | Yes      | Valid platform identifier            | `"devto"`                            |
| `status`   | string | Yes      | One of: `success`, `failed`          | `"success"`                          |
| `url`      | string | No       | Valid URL when status is `success`   | `"https://dev.to/user/post-123"`    |
| `error`    | string | No       | Error message when status is `failed`| `"Rate limit exceeded"`             |

#### 3.1.3 `credentials.yaml` (API Keys Configuration)

Located at project root. Must be listed in `.gitignore`.

| Field              | Type   | Required | Constraints             | Example                    |
|--------------------|--------|----------|-------------------------|----------------------------|
| `gemini_api_key`   | string | No       | Non-empty if present    | `"AIza..."`               |
| `devto_api_key`    | string | No       | Non-empty if present    | `"abc123..."`             |
| `postiz_api_key`   | string | No       | Non-empty if present    | `"pz_..."`                |
| `hashnode_api_key` | string | No       | Non-empty if present    | `"hn_..."`                |
| `hashnode_publication_id` | string | No | Non-empty if present   | `"pub_abc123"`            |
| `github_token`     | string | No       | Non-empty if present    | `"ghp_..."`               |
| `github_owner`     | string | No       | Non-empty if present    | `"myuser"`                |
| `github_repo`      | string | No       | Non-empty if present    | `"my-blog"`               |
| `github_discussion_category` | string | No | Non-empty if present | `"General"`               |

#### 3.1.4 `.upload_cache.yaml` (Media Upload Cache)

Located at `<stage>/<project>/.upload_cache.yaml`.

| Field              | Type   | Required | Constraints                        | Example                              |
|--------------------|--------|----------|------------------------------------|--------------------------------------|
| `uploads`          | object | Yes      | Map of local path to upload record | See 3.1.4a below                     |

**3.1.4a Upload Record**

| Field        | Type   | Required | Constraints            | Example                                   |
|--------------|--------|----------|------------------------|--------------------------------------------|
| `cdn_url`    | string | Yes      | Valid URL              | `"https://cdn.devto.com/img/abc.png"`     |
| `platform`   | string | Yes      | Valid platform ID      | `"devto"`                                 |
| `uploaded_at`| string | Yes      | ISO 8601 datetime      | `"2026-03-14T10:00:00Z"`                 |
| `size_bytes` | number | Yes      | Positive integer       | `245760`                                   |

#### 3.1.5 Content Files

| File                                  | Location                                         | Format   | Description                          |
|---------------------------------------|--------------------------------------------------|----------|--------------------------------------|
| Source material                       | `01_inbox/<project>/<name>.md` or `.txt`         | Markdown | Raw idea or outline                  |
| `draft.md`                            | `02_drafts/<project>/draft.md`                   | Markdown | AI-generated long-form draft         |
| `master.md`                           | `03_master/<project>/master.md`                  | Markdown | User-approved master article         |
| Platform version                      | `04_adapted/<project>/platform_versions/<platform>.md` | Markdown | AI-adapted platform-specific content |

#### 3.1.6 Template Files (P2)

Located at `templates/<name>.yaml`.

| Field      | Type   | Required | Constraints                 | Example                          |
|------------|--------|----------|-----------------------------|----------------------------------|
| `name`     | string | Yes      | Unique template identifier  | `"tech-blog"`                   |
| `type`     | string | Yes      | One of: `draft`, `adapt`    | `"adapt"`                       |
| `platform` | string | No       | Platform ID (for adapt)     | `"x"`                           |
| `prompt`   | string | Yes      | Non-empty prompt template   | `"Rewrite as X thread..."`      |
| `vars`     | object | No       | Template variable defaults  | `{ "tone": "professional" }`    |

### 3.2 CRUD Matrix

| Data Entity            | FEAT-001 | FEAT-002 | FEAT-003 | FEAT-004 | FEAT-005 | FEAT-006 | FEAT-007 | FEAT-006b | FEAT-008 | FEAT-009 | FEAT-010 | FEAT-011 | FEAT-012 | FEAT-013 | FEAT-014 | FEAT-015 |
|------------------------|----------|----------|----------|----------|----------|----------|----------|-----------|----------|----------|----------|----------|----------|----------|----------|----------|
| Stage directories      | C        | R        | R        | C        | C        | R        | R        | R         | R        | R        | R        | -        | R        | R        | -        | R        |
| `meta.yaml`            | C        | R        | CRU      | CU       | CU       | RU       | RU       | RU        | R        | R        | R        | -        | R        | R        | R        | R        |
| `draft.md`             | -        | -        | -        | C        | -        | -        | -        | -         | -        | -        | -        | -        | -        | -        | -        | R        |
| `master.md`            | -        | -        | R        | -        | R        | -        | -        | -         | -        | -        | -        | -        | R        | -        | -        | R        |
| Platform versions      | -        | -        | -        | -        | C        | R        | R        | R         | RU       | R        | R        | -        | R        | -        | -        | R        |
| `receipt.yaml`         | -        | -        | -        | -        | -        | C        | C        | C         | -        | R        | R        | -        | -        | R        | -        | R        |
| `credentials.yaml`     | -        | -        | -        | -        | -        | R        | R        | R         | -        | -        | -        | R        | -        | -        | -        | -        |
| `.upload_cache.yaml`   | -        | -        | -        | -        | -        | -        | -        | -         | CRU      | -        | -        | -        | -        | -        | -        | -        |
| Template files         | -        | -        | -        | -        | -        | -        | -        | -         | -        | -        | -        | -        | -        | -        | CRU      | R        |

Legend: C = Create, R = Read, U = Update, D = Delete, - = No interaction

---

## 4. Functional Requirements

### 4.1 Pipeline Core (FEAT-001)

**FR-PIPE-001**: The system shall create six directories (`01_inbox`, `02_drafts`, `03_master`, `04_adapted`, `05_scheduled`, `06_sent`) in the current working directory when any CLI command is invoked.
- Priority: P0
- Acceptance Criteria: Running `reach status` on an empty directory creates all six directories. Verified by filesystem inspection.
- Source: PRD: FEAT-001
- Boundary: If directories already exist, the system shall not overwrite or modify them.
- Error: If the working directory is read-only, the system shall display an error message stating "Failed to initialize pipeline: permission denied" and exit with code 1.

**FR-PIPE-002**: Each project shall be represented as a subdirectory within the appropriate stage directory, where the directory name serves as the unique project identifier.
- Priority: P0
- Acceptance Criteria: A project named `my-article` in the drafts stage exists at `02_drafts/my-article/`.
- Source: PRD: FEAT-001
- Boundary: Directory names shall contain only alphanumeric characters, hyphens, and underscores. The system shall reject names containing spaces or special characters.

**FR-PIPE-003**: The system shall store project metadata in a `meta.yaml` file within each project directory, conforming to the schema defined in Section 3.1.1.
- Priority: P0
- Acceptance Criteria: After `reach draft my-idea`, `02_drafts/my-idea/meta.yaml` exists and is valid YAML parseable by `js-yaml`.
- Source: PRD: FEAT-001

**FR-PIPE-004**: The system shall move project directories between stages by relocating the directory from the source stage to the target stage using an atomic filesystem move operation.
- Priority: P0
- Acceptance Criteria: After scheduling, the project directory no longer exists in `04_adapted/` and exists in `05_scheduled/`. No files are lost during the move.
- Source: PRD: FEAT-001
- Error: If the target directory already exists, the system shall display "Project already exists in target stage" and abort the operation without modifying the source.

### 4.2 CLI Dashboard (FEAT-002)

**FR-DASH-001**: The `reach status` command shall display the count of projects in each of the six pipeline stages.
- Priority: P0
- Acceptance Criteria: Output contains six lines, each showing a stage name and an integer count. Hidden files (prefixed with `.`) and `.yaml` files at the stage root are excluded from counts.
- Source: PRD: FEAT-002

**FR-DASH-002**: The `reach status` command shall list the names of all projects within each stage that contains one or more projects.
- Priority: P0
- Acceptance Criteria: For a stage with 3 projects, output shows 3 indented project names beneath the stage count line.
- Source: PRD: FEAT-002

**FR-DASH-003**: The `reach status` command shall visually distinguish stages that contain projects from empty stages using color-coded indicators.
- Priority: P0
- Acceptance Criteria: Non-empty stages display a green indicator; empty stages display a gray indicator. Verified by visual inspection in a terminal that supports ANSI colors.
- Source: PRD: FEAT-002
- Boundary: When stdout is not a TTY, the system should omit color codes.

**FR-DASH-004**: The `reach status` command shall complete execution within 500 milliseconds for pipelines containing up to 100 projects distributed across all stages.
- Priority: P0
- Acceptance Criteria: Measured using `time reach status` with 100 project directories populated across stages. Wall clock time is under 500ms.
- Source: PRD: FEAT-002, NFR-001

### 4.3 Project Lifecycle Management (FEAT-003)

**FR-LIFE-001**: The `reach schedule` command shall accept two arguments: an article name (string) and a date (string in `YYYY-MM-DD` format).
- Priority: P0
- Acceptance Criteria: `reach schedule my-article 2026-03-20` moves the project from `04_adapted/my-article` to `05_scheduled/2026-03-20-my-article`.
- Source: PRD: FEAT-003

**FR-LIFE-002**: The `reach schedule` command shall validate that the date argument matches the pattern `YYYY-MM-DD` using a regular expression.
- Priority: P0
- Acceptance Criteria: `reach schedule my-article invalid-date` displays "Date must be in YYYY-MM-DD format" and exits without moving any files.
- Source: PRD: FEAT-003
- Boundary: The system shall reject dates with valid format but invalid calendar values (e.g., `2026-02-30`).

**FR-LIFE-003**: The `reach schedule` command shall prepend the date to the project directory name using the format `<date>-<article>` when moving to `05_scheduled`.
- Priority: P0
- Acceptance Criteria: Scheduling `my-article` for `2026-03-20` creates directory `05_scheduled/2026-03-20-my-article/`.
- Source: PRD: FEAT-003

**FR-LIFE-004**: The system shall update `meta.yaml` to reflect the current pipeline stage after each stage transition.
- Priority: P0
- Acceptance Criteria: After scheduling, `meta.yaml` contains `status: "scheduled"` and `publish_date: "2026-03-20"`.
- Source: PRD: FEAT-003

**FR-LIFE-005**: The system shall provide a mechanism to move projects backward in the pipeline (rollback) to a previous stage.
- Priority: P0
- Acceptance Criteria: A scheduled project can be moved back to `04_adapted` with its date prefix removed from the directory name.
- Source: PRD: FEAT-003
- Error: Attempting to rollback a project in `01_inbox` (first stage) shall display "Cannot rollback: project is already in the first stage."

### 4.4 AI Draft Generator (FEAT-004)

**FR-DRAFT-001**: The `reach draft <source>` command shall read content from `01_inbox/<source>`, where `<source>` is either a file or a directory.
- Priority: P0
- Acceptance Criteria: Given a file `01_inbox/my-idea.md`, `reach draft my-idea.md` reads its contents. Given a directory `01_inbox/my-idea/`, the system reads the first `.md` or `.txt` file within it.
- Source: PRD: FEAT-004
- Boundary: If the source directory contains no `.md` or `.txt` files, the system shall use the source name string as the content input.

**FR-DRAFT-002**: The system shall send the source content to the Google Gemini API (`gemini-pro` model) with a prompt instructing expansion into a long-form Markdown article.
- Priority: P0
- Acceptance Criteria: The outbound API request contains the source content embedded in a structured prompt. The prompt instructs the model to output in Markdown format.
- Source: PRD: FEAT-004

**FR-DRAFT-003**: The system shall save the Gemini response as `02_drafts/<project>/draft.md`.
- Priority: P0
- Acceptance Criteria: After successful execution, the file exists and contains the AI-generated Markdown content. File size is greater than 0 bytes.
- Source: PRD: FEAT-004

**FR-DRAFT-004**: The system shall create `02_drafts/<project>/meta.yaml` with `article` set to the source name and `status` set to `"drafted"`.
- Priority: P0
- Acceptance Criteria: `meta.yaml` is valid YAML, contains `article: "my-idea"` and `status: "drafted"`.
- Source: PRD: FEAT-004

**FR-DRAFT-005**: The system shall display an error message "GEMINI_API_KEY is not set" and abort when the Gemini API key is not configured.
- Priority: P0
- Acceptance Criteria: With no `GEMINI_API_KEY` in environment or `.env`, the command outputs the error message and exits without creating files.
- Source: PRD: FEAT-004

**FR-DRAFT-006**: The system shall display an error message when the specified source does not exist in `01_inbox`.
- Priority: P0
- Acceptance Criteria: `reach draft nonexistent` displays `Source "nonexistent" not found in 01_inbox` and exits with a non-zero exit code.
- Source: PRD: FEAT-004

**FR-DRAFT-007**: The system shall display a progress indication while waiting for the Gemini API response.
- Priority: P0
- Acceptance Criteria: A message indicating draft generation is in progress is displayed before the API call completes.
- Source: PRD: FEAT-004, NFR-002

### 4.5 AI Platform Adapter (FEAT-005)

**FR-ADAPT-001**: The `reach adapt <article>` command shall read the master content from `03_master/<article>/master.md`.
- Priority: P0
- Acceptance Criteria: Given `03_master/my-article/master.md` exists, the system reads its full content.
- Source: PRD: FEAT-005
- Error: If `master.md` does not exist but `draft.md` exists in the same directory, the system shall display `Master article not found at 03_master/<article>/master.md. Did you mean to rename draft.md to master.md?` and abort.
- Error: If neither `master.md` nor `draft.md` exists, the system shall display `Master article not found at 03_master/<article>/master.md` and abort.

**FR-ADAPT-002**: The system shall generate platform-specific versions by sending the master content to Gemini with a platform-specific adaptation prompt for each target platform.
- Priority: P0
- Acceptance Criteria: For each configured platform, a separate Gemini API call is made with a distinct prompt tailored to that platform's format and tone requirements.
- Source: PRD: FEAT-005

**FR-ADAPT-003**: The system shall save each platform adaptation as `04_adapted/<article>/platform_versions/<platform>.md`.
- Priority: P0
- Acceptance Criteria: After adapting for X, WeChat, and Zhihu, three files exist: `x.md`, `wechat.md`, `zhihu.md` in the `platform_versions/` subdirectory.
- Source: PRD: FEAT-005

**FR-ADAPT-004**: The system shall create or update `04_adapted/<article>/meta.yaml` with `status: "adapted"` and `adapted_platforms` listing all successfully adapted platform identifiers.
- Priority: P0
- Acceptance Criteria: `meta.yaml` contains `adapted_platforms: ["x", "wechat", "zhihu"]` after successful adaptation.
- Source: PRD: FEAT-005

**FR-ADAPT-005**: The system shall not overwrite existing platform version files unless the `--force` flag is provided.
- Priority: P0
- Acceptance Criteria: Running `reach adapt my-article` when `x.md` already exists skips that platform and displays a message. Running with `--force` overwrites it.
- Source: PRD: FEAT-005
- Boundary: When `--force` is used, the system shall overwrite all existing platform files, not selectively.

**FR-ADAPT-006**: The X platform adaptation shall produce content formatted as a thread where each individual post does not exceed 280 characters. Thread segments shall be delimited by `---` on its own line (the "thread marker"). Each segment's character count includes whitespace but excludes the delimiter line itself.
- Priority: P0
- Acceptance Criteria: Each segment in the X adaptation output, delimited by `---` on its own line, is 280 characters or fewer. Verified by splitting the output on `/^---$/m` and asserting `segment.trim().length <= 280` for every segment.
- Source: PRD: FEAT-005
- Boundary: A thread with a single segment (no `---` delimiter) is valid. An empty segment between two `---` lines shall be ignored.

**FR-ADAPT-007**: The system shall allow platform list configuration via `meta.yaml` `adapted_platforms` field or CLI flags.
- Priority: P0
- Acceptance Criteria: `reach adapt my-article --platforms x,devto` generates only X and Dev.to versions, ignoring default platforms not specified.
- Source: PRD: FEAT-005

### 4.6 Native Provider: Dev.to (FEAT-006)

**FR-PUB-001**: The `reach publish` command shall authenticate with the Dev.to Forem API using an API key loaded from `credentials.yaml` or the `DEVTO_API_KEY` environment variable.
- Priority: P0
- Acceptance Criteria: The HTTP request to Dev.to includes the `api-key` header with the configured value.
- Source: PRD: FEAT-006
- Error: If no Dev.to API key is configured, the system shall skip Dev.to publishing and log "Dev.to API key not configured; skipping Dev.to publishing."

**FR-PUB-002**: The system shall send the Dev.to-adapted content to the Dev.to articles API endpoint (`POST /api/articles`) with the article body in Markdown format.
- Priority: P0
- Acceptance Criteria: A successful publish returns HTTP 201 and the response body contains the article URL.
- Source: PRD: FEAT-006

**FR-PUB-003**: The system shall store the Dev.to response URL in `receipt.yaml` with `platform: "devto"` and `status: "success"`.
- Priority: P0
- Acceptance Criteria: After successful Dev.to publishing, `receipt.yaml` contains an item with a valid `https://dev.to/...` URL.
- Source: PRD: FEAT-006

**FR-PUB-004**: The system shall set the Dev.to article as draft by default, unless a `--publish-live` flag is provided.
- Priority: P0
- Acceptance Criteria: Without `--publish-live`, the API request body contains `published: false`. With the flag, it contains `published: true`.
- Source: PRD: FEAT-006

**FR-PUB-005**: The system shall retry Dev.to API calls up to 3 times with exponential backoff when receiving HTTP 429 (rate limit) responses.
- Priority: P0
- Acceptance Criteria: On receiving 429, the system waits 1s, 2s, 4s between retries. After 3 failures, it records `status: "failed"` with the error in `receipt.yaml`.
- Source: PRD: FEAT-006
- Error: On HTTP 401/403, the system shall not retry and shall display "Dev.to authentication failed. Verify your API key."

### 4.7 SaaS Bridge Provider: X via Postiz (FEAT-007)

**FR-PUB-006**: The system shall authenticate with the Postiz API using an API key loaded from `credentials.yaml` or the `POSTIZ_API_KEY` environment variable.
- Priority: P0
- Acceptance Criteria: The HTTP request to Postiz includes the required authentication header.
- Source: PRD: FEAT-007

**FR-PUB-007**: The system shall send the X-adapted thread content to the Postiz API for publishing to X (Twitter).
- Priority: P0
- Acceptance Criteria: The Postiz API request body contains the thread content formatted according to Postiz API specification. A successful publish returns the X post URL.
- Source: PRD: FEAT-007

**FR-PUB-008**: The system shall store the X post URL from the Postiz response in `receipt.yaml` with `platform: "x"` and `status: "success"`.
- Priority: P0
- Acceptance Criteria: `receipt.yaml` contains an item with a valid `https://x.com/...` URL after successful publishing.
- Source: PRD: FEAT-007

**FR-PUB-009**: The system shall retry Postiz API calls up to 3 times with exponential backoff on transient failures (HTTP 429, 500, 502, 503).
- Priority: P0
- Acceptance Criteria: Retry behavior matches FR-PUB-005 pattern. After exhausting retries, `receipt.yaml` records `status: "failed"`.
- Source: PRD: FEAT-007

### 4.8 Native Provider: Hashnode + GitHub (FEAT-006b)

**FR-PROV-001**: The system shall publish articles to Hashnode via the Hashnode GraphQL API using API key authentication.
- Priority: P1
- Acceptance Criteria: A GraphQL mutation creates a new article on the user's Hashnode blog. The response contains the article URL stored in `receipt.yaml`.
- Source: PRD: FEAT-006b

**FR-PROV-002**: The system shall create GitHub Discussions via the GitHub GraphQL API or update repository files via the GitHub REST API, using a personal access token.
- Priority: P1
- Acceptance Criteria: The system creates a discussion in the configured repository and category. The response URL is stored in `receipt.yaml`.
- Source: PRD: FEAT-006b

**FR-PROV-003**: The user shall configure target providers per-article via the `platforms` field in `meta.yaml`.
- Priority: P1
- Acceptance Criteria: Setting `adapted_platforms: ["devto", "hashnode"]` in `meta.yaml` causes `publish` to send only to Dev.to and Hashnode, skipping other providers.
- Source: PRD: FEAT-006b

### 4.9 Media Asset Manager (FEAT-008)

**FR-MEDIA-001**: The system shall scan adapted content files for Markdown image references matching the pattern `![alt](local-path)` where `local-path` is a relative filesystem path.
- Priority: P1
- Acceptance Criteria: Given content containing `![diagram](./images/arch.png)`, the system identifies `./images/arch.png` as a local media reference.
- Source: PRD: FEAT-008
- Boundary: URLs beginning with `http://` or `https://` shall be ignored (already hosted).

**FR-MEDIA-002**: The system shall upload each detected local image to the target platform's image hosting endpoint and receive a CDN URL.
- Priority: P1
- Acceptance Criteria: A local PNG file is uploaded to Dev.to's image API. The response contains a `https://` CDN URL.
- Source: PRD: FEAT-008
- Error: If the image file does not exist at the specified local path, the system shall log a warning and continue processing remaining images.

**FR-MEDIA-003**: The system shall replace local file paths in the adapted content with the corresponding CDN URLs before publishing.
- Priority: P1
- Acceptance Criteria: After processing, the content string contains `![diagram](https://cdn.example.com/abc.png)` instead of the local path.
- Source: PRD: FEAT-008

**FR-MEDIA-004**: The system shall cache upload results in `.upload_cache.yaml` within the project directory, keyed by local file path, to avoid re-uploading unchanged files.
- Priority: P1
- Acceptance Criteria: Running publish twice on the same project with the same images results in zero upload API calls on the second run. Cache entries contain `cdn_url`, `platform`, `uploaded_at`, and `size_bytes`.
- Source: PRD: FEAT-008

### 4.10 Watcher Mode (FEAT-009)

**FR-WATCH-001**: The `reach watch` command shall start a background daemon that periodically checks `05_scheduled` for projects whose date prefix is on or before the current date.
- Priority: P1
- Acceptance Criteria: A project with prefix `2026-03-14` is detected as due on `2026-03-14`. A project with prefix `2026-03-15` is not detected as due on `2026-03-14`.
- Source: PRD: FEAT-009

**FR-WATCH-002**: The watcher shall accept a configurable check interval via the `-i` or `--interval` flag, specified in minutes, defaulting to 60 minutes.
- Priority: P1
- Acceptance Criteria: `reach watch -i 30` checks for due items every 30 minutes. `reach watch` (no flag) checks every 60 minutes.
- Source: PRD: FEAT-009

**FR-WATCH-003**: The watcher shall invoke the publish operation for each due project found during a check cycle.
- Priority: P1
- Acceptance Criteria: A due project is published and moved to `06_sent` during the check cycle. The publish operation follows the same logic as `reach publish`.
- Source: PRD: FEAT-009

**FR-WATCH-004**: The watcher shall not re-publish projects that have already been moved to `06_sent`.
- Priority: P1
- Acceptance Criteria: Running the watcher continuously with one due project results in exactly one publish operation, not repeated publishes on subsequent check cycles.
- Source: PRD: FEAT-009

**FR-WATCH-005**: The watcher shall terminate gracefully upon receiving SIGTERM or SIGINT signals, completing any in-progress publish operation before exiting.
- Priority: P1
- Acceptance Criteria: Sending SIGINT during a publish cycle allows the current publish to complete. The process exits with code 0. No partially-moved directories remain.
- Source: PRD: FEAT-009

**FR-WATCH-006**: The watcher shall write log entries to a file for each check cycle, including timestamp, number of due items found, and publish outcomes.
- Priority: P1
- Acceptance Criteria: A log file is created/appended with entries in a parseable format (one line per event). Includes ISO 8601 timestamps.
- Source: PRD: FEAT-009

### 4.11 MCP Server Integration (FEAT-010)

**FR-MCP-001**: The `reach mcp` command shall start an MCP-compliant server exposing pipeline operations as callable tools.
- Priority: P2
- Acceptance Criteria: The server starts and responds to MCP `initialize` handshake. `tools/list` returns at least 5 tools.
- Source: PRD: FEAT-010

**FR-MCP-002**: The MCP server shall expose the following operations as tools: `status`, `draft`, `adapt`, `schedule`, `publish`.
- Priority: P2
- Acceptance Criteria: Each tool is listed in the MCP `tools/list` response with a name, description, and input schema.
- Source: PRD: FEAT-010

**FR-MCP-003**: The MCP server shall validate all tool inputs using Zod schemas before executing the corresponding operation.
- Priority: P2
- Acceptance Criteria: Calling the `draft` tool with an empty `source` parameter returns an MCP error response with a validation message. The pipeline operation is not invoked.
- Source: PRD: FEAT-010, NFR-007

**FR-MCP-004**: The MCP server shall support both `stdio` and `SSE` transports, selectable via the `--transport` flag.
- Priority: P2
- Acceptance Criteria: `reach mcp --transport stdio` communicates via stdin/stdout. `reach mcp --transport sse --port 8000` starts an HTTP server on port 8000.
- Source: PRD: FEAT-010

**FR-MCP-005**: The MCP server shall be compatible with Claude Desktop as an MCP client.
- Priority: P2
- Acceptance Criteria: Adding reachforge to Claude Desktop's MCP configuration file and invoking a tool (e.g., `status`) returns valid pipeline state data.
- Source: PRD: FEAT-010

### 4.12 Provider Plugin Architecture (FEAT-011)

**FR-PLUG-001**: The system shall define a `PlatformProvider` TypeScript interface with the methods: `validate(content: string): ValidationResult`, `publish(content: string, options: PublishOptions): PublishResult`, and `formatContent(content: string): string`.
- Priority: P1
- Acceptance Criteria: The interface is exported from a `providers/types.ts` module. TypeScript compilation succeeds with the interface definition.
- Source: PRD: FEAT-011

**FR-PLUG-002**: The system shall discover provider implementations by scanning the `providers/` directory for files matching the pattern `<platform>.ts`.
- Priority: P1
- Acceptance Criteria: Placing a file `providers/linkedin.ts` that exports a `PlatformProvider` implementation makes `linkedin` available as a publishing target without modifying core code.
- Source: PRD: FEAT-011

**FR-PLUG-003**: The system shall load provider configuration (API keys, endpoints) from three sources with the following precedence: (1) environment variables (highest), (2) `.env` file, (3) `credentials.yaml` (lowest).
- Priority: P1
- Acceptance Criteria: If `DEVTO_API_KEY` is set in the environment, it takes precedence over `devto_api_key` in `.env` and `credentials.yaml`.
- Source: PRD: FEAT-011

**FR-PLUG-004**: The system shall invoke each configured provider's `validate()` method before calling `publish()`, aborting publication for that provider if validation fails.
- Priority: P1
- Acceptance Criteria: A provider returning `{ valid: false, errors: ["Title too long"] }` from `validate()` causes that provider's `publish()` to be skipped. Other providers proceed normally.
- Source: PRD: FEAT-011

### 4.13 Content Quality Validation (FEAT-012)

**FR-VALID-001**: The system shall validate X platform content by verifying that each post segment does not exceed 280 characters.
- Priority: P1
- Acceptance Criteria: Content with a segment of 285 characters produces a validation error: "X post segment exceeds 280 character limit (found: 285)."
- Source: PRD: FEAT-012

**FR-VALID-002**: The system shall validate Dev.to content by verifying the presence of required frontmatter fields (`title` at minimum).
- Priority: P1
- Acceptance Criteria: Dev.to content missing a `title` in frontmatter produces: "Dev.to article missing required frontmatter field: title."
- Source: PRD: FEAT-012

**FR-VALID-003**: The system shall execute validation automatically before the `publish` operation and block publishing for any platform whose content fails validation.
- Priority: P1
- Acceptance Criteria: A project with invalid X content and valid Dev.to content publishes to Dev.to only. The X failure is recorded in `receipt.yaml` with `status: "failed"` and the validation error.
- Source: PRD: FEAT-012

**FR-VALID-004**: Validation error messages shall be actionable, specifying the field, constraint, and actual value that caused the failure.
- Priority: P1
- Acceptance Criteria: Every validation error message contains: (1) the platform name, (2) the specific constraint violated, and (3) the offending value or its measurement.
- Source: PRD: FEAT-012

### 4.14 Analytics & Receipts Dashboard (FEAT-013)

**FR-ANAL-001**: The `reach analytics` command shall aggregate `receipt.yaml` files from all projects in `06_sent` and display total publish count per platform.
- Priority: P2
- Acceptance Criteria: With 5 Dev.to publishes and 3 X publishes in `06_sent`, the output displays `devto: 5` and `x: 3`.
- Source: PRD: FEAT-013

**FR-ANAL-002**: The `reach analytics` command shall display success and failure rates per platform as percentages.
- Priority: P2
- Acceptance Criteria: With 9 successful and 1 failed Dev.to publishes, the output displays `devto: 90% success (9/10)`.
- Source: PRD: FEAT-013

**FR-ANAL-003**: The `reach analytics` command shall accept `--from` and `--to` date flags to filter results by `published_at` date range.
- Priority: P2
- Acceptance Criteria: `reach analytics --from 2026-03-01 --to 2026-03-14` includes only receipts within that date range.
- Source: PRD: FEAT-013
- Boundary: Omitting both flags returns all-time data. Omitting `--to` defaults to today. Omitting `--from` defaults to the earliest receipt.

### 4.15 Template System (FEAT-014)

**FR-TMPL-001**: The system shall load prompt templates from YAML files in a `templates/` directory within the project root.
- Priority: P2
- Acceptance Criteria: A file `templates/tech-blog.yaml` containing a `prompt` field is loadable by the draft and adapt commands.
- Source: PRD: FEAT-014

**FR-TMPL-002**: The user shall be able to specify a template per-article via the `template` field in `meta.yaml`.
- Priority: P2
- Acceptance Criteria: Setting `template: "tech-blog"` in a project's `meta.yaml` causes the draft/adapt command to use the `tech-blog` template's prompt instead of the default.
- Source: PRD: FEAT-014

**FR-TMPL-003**: The system shall provide default templates for each supported platform adaptation (X, Dev.to, WeChat, Zhihu).
- Priority: P2
- Acceptance Criteria: Without user-created templates, the system uses built-in default prompts. The default prompts produce platform-appropriate output.
- Source: PRD: FEAT-014

**FR-TMPL-004**: The system shall support template variables that are interpolated into prompts at execution time.
- Priority: P2
- Acceptance Criteria: A template containing `{tone}` in its prompt, with `vars: { tone: "casual" }`, produces a prompt with "casual" substituted.
- Source: PRD: FEAT-014

### 4.16 VS Code Extension (FEAT-015)

**FR-VSCODE-001**: The extension shall display a tree view in the VS Code sidebar showing all six pipeline stages and their contained projects.
- Priority: P2
- Acceptance Criteria: Opening a workspace containing reachforge pipeline directories shows a tree view with expandable stage nodes and project leaf nodes.
- Source: PRD: FEAT-015

**FR-VSCODE-002**: The extension shall provide one-click actions for `draft`, `adapt`, `schedule`, and `publish` operations via context menu or inline buttons on tree view items.
- Priority: P2
- Acceptance Criteria: Right-clicking a project in `01_inbox` shows a "Generate Draft" option. Clicking it invokes the reachforge binary and displays the result.
- Source: PRD: FEAT-015

**FR-VSCODE-003**: The extension shall display a live preview of adapted content for each platform version within a VS Code editor tab.
- Priority: P2
- Acceptance Criteria: Selecting a platform version file in the tree view opens a read-only preview tab displaying the adapted content.
- Source: PRD: FEAT-015

**FR-VSCODE-004**: The extension shall communicate with the reachforge binary via the sidecar pattern, invoking CLI commands as child processes.
- Priority: P2
- Acceptance Criteria: The extension does not embed reachforge logic; it spawns `reach <command>` processes and parses their stdout/stderr output.
- Source: PRD: FEAT-015

---

## 5. Non-Functional Requirements

### 5.1 Performance

**NFR-PERF-001**: The `reach status` command shall complete in under 500 milliseconds for pipelines containing up to 100 projects.
- Acceptance Criteria: Measured by wall clock time across 10 consecutive runs; p95 latency is under 500ms.
- Source: PRD: NFR-001

**NFR-PERF-002**: The system shall display a progress indicator within 1 second of invoking any command that calls an external API (draft, adapt, publish).
- Acceptance Criteria: A visual indicator (text message or spinner) appears in stdout before the API response arrives.
- Source: PRD: NFR-002

**NFR-PERF-003**: The `reach publish` command shall execute platform publications concurrently, completing up to 10 simultaneous platform API calls without failure.
- Acceptance Criteria: Publishing to 10 platforms completes without timeout or resource exhaustion errors. Total wall time is less than 2x the slowest individual platform call.
- Source: PRD: NFR-003

**NFR-PERF-004**: The compiled reachforge binary shall not exceed 50 MB in file size.
- Acceptance Criteria: `ls -la` on the compiled binary shows a size under 52,428,800 bytes.
- Source: PRD: NFR-004

### 5.2 Security

**NFR-SEC-001**: API keys shall be loaded exclusively from `.env` files or `credentials.yaml`, both of which shall be listed in the project's `.gitignore`.
- Acceptance Criteria: The repository `.gitignore` contains entries for `.env` and `credentials.yaml`. The system does not accept API keys via CLI arguments.
- Source: PRD: NFR-005

**NFR-SEC-002**: The system shall not transmit any user content or metadata to any endpoint other than the explicitly configured AI and publishing APIs.
- Acceptance Criteria: Network traffic analysis during a full pipeline run shows requests only to `generativelanguage.googleapis.com`, `dev.to`, and `api.postiz.com` (or configured equivalents). No other outbound connections.
- Source: PRD: NFR-006

**NFR-SEC-003**: The MCP server shall validate all incoming tool call parameters using Zod schemas, rejecting malformed inputs before executing operations.
- Acceptance Criteria: Sending a tool call with a missing required parameter returns an error response; the underlying filesystem operation is never invoked.
- Source: PRD: NFR-007

### 5.3 Compatibility

**NFR-COMPAT-001**: The system shall produce compiled binaries for macOS (ARM64), Linux (x64), and Windows (x64).
- Acceptance Criteria: `bun build` produces three binaries that execute successfully on their respective target platforms.
- Source: PRD: NFR-008

**NFR-COMPAT-002**: The system shall run on Bun runtime version 1.0 or later.
- Acceptance Criteria: Running `reach status` on Bun 1.0.0 produces correct output without runtime errors.
- Source: PRD: NFR-009

**NFR-COMPAT-003**: The MCP server shall conform to the MCP specification for both stdio and SSE transports.
- Acceptance Criteria: The MCP server passes the MCP protocol conformance test suite (when available) or successfully completes a handshake and tool invocation cycle with at least two different MCP clients.
- Source: PRD: NFR-010

### 5.4 Reliability

**NFR-REL-001**: Publishing failures shall not cause data loss. Failed items shall remain in `05_scheduled` with error details appended to `meta.yaml`.
- Acceptance Criteria: Simulating a network failure during publish leaves the project directory in `05_scheduled` with `meta.yaml` containing `status: "failed"` and `error: "<message>"`. No files are deleted or corrupted.
- Source: PRD: NFR-011

**NFR-REL-002**: All file operations shall be idempotent. Re-running a command on already-processed content shall not create duplicates or corrupt existing data.
- Acceptance Criteria: Running `reach draft my-idea` twice produces a single project directory in `02_drafts`. The second run either overwrites or skips with a message; it does not create `my-idea-1`.
- Source: PRD: NFR-012

### 5.5 Usability

**NFR-USAB-001**: Error messages shall include the specific cause of failure and, where applicable, a suggested corrective action.
- Acceptance Criteria: Every user-facing error message contains at least a cause clause and a resolution hint (e.g., "GEMINI_API_KEY is not set. Set it in your .env file or export it as an environment variable.").
- Source: Engineering-derived (not originating from PRD; addresses usability gap identified during SRS authoring).

**NFR-USAB-002**: A new user shall be able to complete the full pipeline (inbox to published) without consulting documentation, using only `--help` output.
- Acceptance Criteria: Each CLI command provides `--help` output with a description, argument specifications, option descriptions, and at least one usage example.
- Source: Engineering-derived (not originating from PRD).

### 5.6 Maintainability

**NFR-MAINT-001**: The codebase shall be organized into separate modules: `commands/`, `providers/`, `core/`, with no single file exceeding 300 lines.
- Acceptance Criteria: After refactoring, no `.ts` file in `src/` exceeds 300 lines. Module boundaries align with functional groupings (pipeline, providers, CLI commands).
- Source: Engineering-derived (not originating from PRD; addresses scalability risk identified in tech design).

**NFR-MAINT-002**: All provider implementations shall conform to the `PlatformProvider` interface, enabling addition of new providers without modifying core pipeline code.
- Acceptance Criteria: Adding a new provider requires creating exactly one file in `providers/` and optionally adding credentials configuration. No changes to `core/` or `commands/` are needed.
- Source: Engineering-derived (not originating from PRD).

---

## 6. Use Cases

### UC-001: End-to-End Content Pipeline

- **Actors**: Developer (Alex)
- **Preconditions**: reachforge is installed. `GEMINI_API_KEY` is configured. Dev.to and Postiz API keys are configured in `credentials.yaml`.
- **Main Flow**:
  1. User creates `01_inbox/my-article/idea.md` with raw content.
  2. User runs `reach draft my-article`.
  3. System reads content from inbox, calls Gemini, saves draft to `02_drafts/my-article/draft.md`.
  4. User reviews the draft, copies/moves the project to `03_master/my-article/master.md`.
  5. User runs `reach adapt my-article`.
  6. System generates platform versions in `04_adapted/my-article/platform_versions/`.
  7. User runs `reach schedule my-article 2026-03-20`.
  8. System moves project to `05_scheduled/2026-03-20-my-article/`.
  9. On 2026-03-20, user runs `reach publish` (or watcher triggers automatically).
  10. System publishes to Dev.to and X, creates `receipt.yaml`, moves project to `06_sent/`.
- **Alternate Flows**:
  - 5a. User edits `master.md` before adapting. The system uses the edited version.
  - 7a. User specifies a past date. The system accepts it; the project becomes immediately eligible for publishing.
  - 9a. Watcher mode is active. The system auto-publishes without manual intervention.
- **Exception Flows**:
  - 3e. Gemini API returns an error. The system displays the error, leaves no partial files in `02_drafts`, and the source remains in `01_inbox`.
  - 10e. Dev.to publish succeeds but Postiz fails. The system records Dev.to success and Postiz failure in `receipt.yaml` and moves the project to `06_sent`. Users can re-publish failed platforms from `06_sent` using `reach publish --retry <project>`.
- **Postconditions**: Content is live on configured platforms. `receipt.yaml` contains URLs and timestamps for each successful publish.

### UC-002: AI Draft Generation

- **Actors**: Developer (Jordan)
- **Preconditions**: `GEMINI_API_KEY` is configured. A file exists at `01_inbox/podcast-notes.md`.
- **Main Flow**:
  1. User runs `reach draft podcast-notes.md`.
  2. System displays "Generating AI draft for podcast-notes.md..."
  3. System reads `01_inbox/podcast-notes.md`.
  4. System sends content to Gemini with the draft generation prompt.
  5. System receives the AI-generated article.
  6. System saves `02_drafts/podcast-notes/draft.md` and `02_drafts/podcast-notes/meta.yaml`.
  7. System displays "Draft generated! Please check 02_drafts/podcast-notes".
- **Alternate Flows**:
  - 1a. Source is a directory `01_inbox/podcast-notes/`. System reads the first `.md` or `.txt` file within it.
  - 1b. Source is a directory containing no text files. System uses the directory name as input content.
- **Exception Flows**:
  - 2e. `GEMINI_API_KEY` is not set. System displays error and aborts. No directories are created.
  - 4e. Gemini API times out. System displays "AI generation failed: request timed out" and exits.
  - 3e. Source file does not exist. System displays `Source "podcast-notes.md" not found in 01_inbox`.
- **Postconditions**: `02_drafts/podcast-notes/` directory exists containing `draft.md` and `meta.yaml`.

### UC-003: Multi-Platform Adaptation

- **Actors**: Developer (Mei)
- **Preconditions**: `GEMINI_API_KEY` is configured. `03_master/bilingual-post/master.md` exists with approved content.
- **Main Flow**:
  1. User runs `reach adapt bilingual-post`.
  2. System reads `03_master/bilingual-post/master.md`.
  3. System sends content to Gemini with X-specific prompt; saves `x.md`.
  4. System sends content to Gemini with WeChat-specific prompt; saves `wechat.md`.
  5. System sends content to Gemini with Zhihu-specific prompt; saves `zhihu.md`.
  6. System creates `04_adapted/bilingual-post/meta.yaml` with `adapted_platforms: ["x", "wechat", "zhihu"]`.
  7. System displays "Adaptation complete!"
- **Alternate Flows**:
  - 1a. User specifies `--platforms x,devto`. System adapts for X and Dev.to only.
  - 3a. `x.md` already exists and `--force` is not provided. System skips X with a message and proceeds to next platform.
- **Exception Flows**:
  - 2e. Master file not found. System displays error and aborts.
  - 3e. Gemini fails for X but succeeds for WeChat and Zhihu. System saves the two successful adaptations, records the failure in meta.yaml, and displays a warning listing the failed platform.
- **Postconditions**: `04_adapted/bilingual-post/platform_versions/` contains one `.md` file per successfully adapted platform.

### UC-004: Scheduled Publishing

- **Actors**: Developer (Alex)
- **Preconditions**: Dev.to and Postiz API keys configured. `05_scheduled/2026-03-14-my-article/` exists with platform versions and valid `meta.yaml`.
- **Main Flow**:
  1. User runs `reach publish`.
  2. System scans `05_scheduled/` for directories with date prefix on or before today.
  3. System finds `2026-03-14-my-article` as due.
  4. System runs content validation for each platform (FR-VALID-001 through FR-VALID-003).
  5. System publishes Dev.to version via Forem API; receives article URL.
  6. System publishes X version via Postiz API; receives tweet URL.
  7. System creates `receipt.yaml` with both platform results.
  8. System moves project to `06_sent/2026-03-14-my-article/`.
  9. System displays success messages with URLs.
- **Alternate Flows**:
  - 2a. No due items found. System displays "No content due for publishing today." and exits.
  - 4a. X content fails validation. System publishes to Dev.to only, records X as failed in receipt.
  - 8a. Watcher mode triggers this flow. Same behavior but output goes to log file.
- **Exception Flows**:
  - 5e. Dev.to returns HTTP 429. System retries 3 times with exponential backoff. If all retries fail, records failure in receipt.yaml; project remains in `05_scheduled`.
  - 6e. Postiz API is unreachable. System records failure, proceeds with other platforms.
  - 5e+6e. All platforms fail. Project stays in `05_scheduled` with error details in `meta.yaml`.
- **Postconditions**: Successfully published projects reside in `06_sent/` with `receipt.yaml` containing platform URLs. Failed projects remain in `05_scheduled/` with error details.

### UC-005: MCP Agent-Driven Pipeline

- **Actors**: AI Agent (Claude Desktop), Developer (Mei)
- **Preconditions**: reachforge MCP server is running (`reach mcp --transport stdio`). Claude Desktop is configured to connect to the reachforge MCP server. API keys are configured.
- **Main Flow**:
  1. User instructs Claude: "Draft my latest inbox item and adapt it for X and Dev.to."
  2. Claude calls `reachforge.status` tool; receives pipeline state showing `01_inbox` has `new-idea`.
  3. Claude calls `reachforge.draft` tool with `{ source: "new-idea" }`.
  4. MCP server validates input via Zod schema, invokes draft operation, returns result.
  5. Claude calls `reachforge.adapt` tool with `{ article: "new-idea" }`.
  6. MCP server validates input, invokes adapt operation, returns result.
  7. Claude reports to user: "Drafted and adapted. Ready for scheduling."
- **Alternate Flows**:
  - 3a. Claude calls draft with invalid parameters. MCP server returns validation error. Claude adjusts and retries.
  - 5a. Claude chains schedule and publish after adaptation based on user instruction.
- **Exception Flows**:
  - 4e. MCP server receives malformed JSON. Server returns MCP protocol error without executing any pipeline operation.
  - 4e2. Gemini API fails during draft. MCP server returns error result. Claude reports the failure to the user.
- **Postconditions**: The pipeline has progressed according to the agent's actions. All state changes are reflected in the filesystem identically to CLI-driven operations.

---

## 7. Traceability Matrix

### 7.1 PRD Feature to SRS Functional Requirements

| PRD Feature | Feature Name                    | SRS Requirements                                         |
|-------------|---------------------------------|----------------------------------------------------------|
| FEAT-001    | File-Based Pipeline Core        | FR-PIPE-001, FR-PIPE-002, FR-PIPE-003, FR-PIPE-004     |
| FEAT-002    | CLI Dashboard                   | FR-DASH-001, FR-DASH-002, FR-DASH-003, FR-DASH-004     |
| FEAT-003    | Project Lifecycle Management    | FR-LIFE-001, FR-LIFE-002, FR-LIFE-003, FR-LIFE-004, FR-LIFE-005 |
| FEAT-004    | AI Draft Generator              | FR-DRAFT-001 through FR-DRAFT-007                        |
| FEAT-005    | AI Platform Adapter             | FR-ADAPT-001 through FR-ADAPT-007                        |
| FEAT-006    | Native Provider: Dev.to         | FR-PUB-001 through FR-PUB-005                            |
| FEAT-007    | SaaS Bridge: X via Postiz       | FR-PUB-006 through FR-PUB-009                            |
| FEAT-006b   | Native Provider: Hashnode+GitHub| FR-PROV-001, FR-PROV-002, FR-PROV-003                   |
| FEAT-008    | Media Asset Manager             | FR-MEDIA-001 through FR-MEDIA-004                        |
| FEAT-009    | Watcher Mode                    | FR-WATCH-001 through FR-WATCH-006                        |
| FEAT-010    | MCP Server Integration          | FR-MCP-001 through FR-MCP-005                            |
| FEAT-011    | Provider Plugin Architecture    | FR-PLUG-001 through FR-PLUG-004                          |
| FEAT-012    | Content Quality Validation      | FR-VALID-001 through FR-VALID-004                        |
| FEAT-013    | Analytics & Receipts Dashboard  | FR-ANAL-001 through FR-ANAL-003                          |
| FEAT-014    | Template System                 | FR-TMPL-001 through FR-TMPL-004                          |
| FEAT-015    | VS Code Extension               | FR-VSCODE-001 through FR-VSCODE-004                      |

### 7.2 PRD NFR to SRS NFR

| PRD NFR  | SRS NFR          | Description                              |
|----------|------------------|------------------------------------------|
| NFR-001  | NFR-PERF-001     | Status command latency                   |
| NFR-002  | NFR-PERF-002     | Progress indication for AI calls         |
| NFR-003  | NFR-PERF-003     | Concurrent platform publishing           |
| NFR-004  | NFR-PERF-004     | Binary size limit                        |
| NFR-005  | NFR-SEC-001      | API key storage and gitignore            |
| NFR-006  | NFR-SEC-002      | No telemetry                             |
| NFR-007  | NFR-SEC-003      | MCP input validation                     |
| NFR-008  | NFR-COMPAT-001   | Cross-platform binaries                  |
| NFR-009  | NFR-COMPAT-002   | Bun runtime version                      |
| NFR-010  | NFR-COMPAT-003   | MCP specification conformance            |
| NFR-011  | NFR-REL-001      | Publish failure data preservation        |
| NFR-012  | NFR-REL-002      | Idempotent file operations               |

---

## 8. External Interface Requirements

### 8.1 User Interfaces (CLI)

| Command                              | Arguments                    | Options                                | Output Format         |
|--------------------------------------|------------------------------|----------------------------------------|-----------------------|
| `reach status`                      | None                         | None                                   | Colored table to stdout |
| `reach draft <source>`              | `source`: filename or dirname| None                                   | Status messages to stdout |
| `reach adapt <article>`             | `article`: project name      | `--force`, `--platforms <list>`        | Status messages to stdout |
| `reach schedule <article> <date>`   | `article`: name, `date`: YYYY-MM-DD | None                            | Confirmation to stdout |
| `reach publish`                     | None                         | `--publish-live`                       | Results per item to stdout |
| `reach watch`                       | None                         | `-i, --interval <minutes>`             | Log messages to stdout and file |
| `reach mcp`                         | None                         | `-t, --transport <type>`, `-p, --port` | MCP protocol on stdio or HTTP |
| `reach analytics`                   | None                         | `--from <date>`, `--to <date>`         | Aggregate stats to stdout |
| `reach rollback <project>`          | `project`: project name      | None                                   | Confirmation to stdout |

All commands shall provide `--help` output. Error messages shall be written to stderr. Exit code 0 indicates success; non-zero indicates failure.

### 8.2 Software Interfaces

#### 8.2.1 Google Gemini API

| Property      | Value                                       |
|---------------|---------------------------------------------|
| Protocol      | HTTPS                                       |
| SDK           | `@google/generative-ai` npm package         |
| Model         | `gemini-pro`                                |
| Auth          | API key via `x-goog-api-key` header         |
| Rate Limits   | Per Google's quota (60 RPM free tier)        |
| Data Sent     | User content for generation/adaptation       |
| Data Received | Generated Markdown text                      |

#### 8.2.2 Dev.to Forem API

| Property      | Value                                       |
|---------------|---------------------------------------------|
| Protocol      | HTTPS REST                                  |
| Base URL      | `https://dev.to/api`                        |
| Auth          | `api-key` header                            |
| Endpoints     | `POST /articles` (create), `PUT /articles/:id` (update) |
| Rate Limits   | 30 requests per 30 seconds                  |
| Data Sent     | Article body (Markdown), title, tags        |
| Data Received | Article object with URL, ID                 |

#### 8.2.3 Postiz API

| Property      | Value                                       |
|---------------|---------------------------------------------|
| Protocol      | HTTPS REST                                  |
| Auth          | API key header                              |
| Endpoints     | Post creation endpoint (TBD per Postiz docs)|
| Data Sent     | Thread content for X                        |
| Data Received | Post object with X URL                      |

#### 8.2.4 Hashnode GraphQL API

| Property      | Value                                       |
|---------------|---------------------------------------------|
| Protocol      | HTTPS GraphQL                               |
| Base URL      | `https://gql.hashnode.com`                  |
| Auth          | `Authorization` header with API key         |
| Operations    | `createPublicationStory` mutation            |
| Data Sent     | Article body (Markdown), title, tags        |
| Data Received | Story object with URL                       |

#### 8.2.5 GitHub API

| Property      | Value                                       |
|---------------|---------------------------------------------|
| Protocol      | HTTPS REST / GraphQL                        |
| Base URL      | `https://api.github.com`                    |
| Auth          | `Authorization: Bearer <token>` header      |
| Operations    | Create discussion (GraphQL), create/update file (REST) |
| Data Sent     | Content body, repository, category          |
| Data Received | Discussion/file object with URL             |

#### 8.2.6 APCore and MCP

| Property      | Value                                       |
|---------------|---------------------------------------------|
| APCore        | `apcore-js` npm package; module registration via `apcore.register()` |
| MCP Server    | `apcore-mcp` npm package; `serve()` function |
| MCP Transport | stdio (JSON-RPC over stdin/stdout) or SSE (HTTP) |
| MCP Clients   | Claude Desktop, other MCP-compatible clients |

### 8.3 Hardware Interfaces

The system interfaces exclusively with the local filesystem:

- **Read**: Source content, master articles, configuration files, credentials.
- **Write**: Draft files, adapted versions, metadata, receipts, logs, cache files.
- **Move**: Project directories between stage directories (atomic rename when on same filesystem).
- **Storage**: No minimum disk requirement beyond content size. Typical project is under 1 MB.

### 8.4 Communication Interfaces

| Interface         | Protocol         | Direction      | Purpose                          |
|-------------------|------------------|----------------|----------------------------------|
| Gemini API        | HTTPS            | Outbound       | AI content generation            |
| Dev.to API        | HTTPS REST       | Outbound       | Article publishing               |
| Postiz API        | HTTPS REST       | Outbound       | X publishing via bridge          |
| Hashnode API      | HTTPS GraphQL    | Outbound       | Article publishing               |
| GitHub API        | HTTPS REST/GQL   | Outbound       | Discussion/file publishing       |
| MCP stdio         | JSON-RPC/stdin   | Bidirectional  | AI agent tool invocation         |
| MCP SSE           | HTTP/SSE         | Bidirectional  | AI agent tool invocation (web)   |

---

## 9. Appendices

### 9.1 Glossary

| Term                    | Definition                                                            |
|-------------------------|-----------------------------------------------------------------------|
| Content Pipeline        | The six-stage workflow from raw idea to published content              |
| Inbox                   | First stage; raw ideas and source material                            |
| Draft                   | Second stage; AI-generated long-form article                          |
| Master                  | Third stage; user-approved final article                              |
| Adapted                 | Fourth stage; platform-specific versions generated by AI              |
| Scheduled               | Fifth stage; content awaiting its publish date                        |
| Sent                    | Sixth stage; successfully published content with receipts             |
| Provider                | A module that implements publishing to a specific platform            |
| Receipt                 | A YAML record of publishing outcomes                                  |
| SaaS Bridge             | A provider that routes through a third-party service                  |
| Sidecar Pattern         | Running reachforge as a subprocess alongside an IDE extension             |

### 9.2 Data Entity Schema Examples

#### `meta.yaml` (adapted stage)

```yaml
article: "my-article"
status: "adapted"
publish_date: "2026-03-20"
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
  wechat:
    status: "pending"
    method: "manual"
    url: ""
notes: "Review X thread for tone"
template: "tech-blog"
created_at: "2026-03-14T10:00:00Z"
updated_at: "2026-03-14T12:30:00Z"
```

#### `receipt.yaml`

```yaml
published_at: "2026-03-20T08:00:00Z"
items:
  - platform: "devto"
    status: "success"
    url: "https://dev.to/user/my-article-abc123"
  - platform: "x"
    status: "success"
    url: "https://x.com/user/status/123456789"
  - platform: "wechat"
    status: "failed"
    error: "Manual publishing required; reminder sent"
```

#### `credentials.yaml`

```yaml
gemini_api_key: "AIza..."
devto_api_key: "abc123..."
postiz_api_key: "pz_..."
hashnode_api_key: "hn_..."
github_token: "ghp_..."
```

#### `.upload_cache.yaml`

```yaml
uploads:
  "./images/architecture.png":
    cdn_url: "https://dev-to-uploads.s3.amazonaws.com/uploads/articles/abc123.png"
    platform: "devto"
    uploaded_at: "2026-03-14T10:00:00Z"
    size_bytes: 245760
```

#### Template file (`templates/tech-blog.yaml`)

```yaml
name: "tech-blog"
type: "adapt"
platform: "devto"
prompt: >
  Rewrite the following article for Dev.to. Use a {tone} tone.
  Include frontmatter with title, tags, and series fields.
  Format code blocks with language identifiers.
vars:
  tone: "professional"
```

---

*End of Document. This SRS shall be reviewed and updated alongside the PRD as features progress through implementation phases.*
