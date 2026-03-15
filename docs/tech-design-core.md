# Tech Design: aphype Core Orchestration (Phase 1)

## 1. System Overview
The core orchestration system manages the "File-as-State" transitions for social content projects. It provides a CLI interface for users to monitor and progress content through the six-stage pipeline.

## 2. Directory State Machine
The system operates on six strictly ordered directories:
1. `01_inbox` -> `02_drafts` (AI/User processing)
2. `02_drafts` -> `03_master` (User review/sign-off)
3. `03_master` -> `04_adapted` (AI adaptation)
4. `04_adapted` -> `05_scheduled` (User scheduling)
5. `05_scheduled` -> `06_sent` (Automatic distribution)

## 3. Command Definition
### `aphype status`
- **Logic**: Iterates over `01_inbox` through `06_sent`.
- **Output**: Visual representation of project counts and today's scheduled tasks.

### `aphype schedule <article> <date>`
- **Logic**: Validates the date format (YYYY-MM-DD), moves the folder from `04_adapted` to `05_scheduled`, and prepends the date to the folder name.
- **Validation**: Ensures a `master.md` or equivalent exists.

## 4. Feature Specifications (Phase 1 Components)

### [FEAT-001] Pipeline Core
- **FR-001**: System must initialize the 01-06 directory structure if missing.
- **FR-002**: Folder names are unique identifiers (IDs).
- **FR-003**: Metadata must be stored in `meta.yaml` within each project folder.

### [FEAT-002] CLI Dashboard
- **FR-004**: Use `chalk` for status color coding.
- **FR-005**: Provide a summary of projects by state.

## 5. Implementation Roadmap (Phase 1)
1. Initialize directory structures.
2. Implement project scanning and state counting.
3. Build the scheduling logic for state transitions.
4. Add basic YAML metadata support.
