# Feature Spec: Session Manager

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| **Component**| Session Management                                 |
| **Directory**| `src/llm/session.ts`                               |
| **Priority** | P0                                                 |
| **SRS Refs** | New (supports `reach refine` multi-turn)          |
| **NFR Refs** | NFR-REL-002 (idempotent operations)                |
| **Tech Design** | [LLM Adapter Tech Design](../llm-adapter/tech-design.md) |

---

## 1. Purpose and Scope

The Session Manager provides file-based CRUD operations for per-stage LLM session data. Each pipeline stage (draft, adapt-per-platform) maintains an independent session that can be resumed across multiple CLI invocations. This is the foundation for the `reach refine` command, which allows iterative multi-turn conversations to improve draft content.

The module provides:
- `SessionManager` class for save/load/delete/list operations
- `SessionData` type for session metadata
- Zod schema validation for session files
- Atomic writes to prevent corruption
- Cross-adapter mismatch detection

Sessions are stored as JSON files at:
```
{projectDir}/.reach/sessions/{article}/{stage}.json
```

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `llm/session.ts` | SessionManager class, SessionData interface, Zod schema, CRUD operations | 180 |

## 3. TypeScript Interfaces

```typescript
// Defined in llm/types.ts, used by llm/session.ts

export interface SessionData {
  /** CLI-assigned session ID. Non-empty, 1-200 chars, alphanumeric + hyphens. */
  sessionId: string;

  /** Which adapter created this session. One of: "claude", "gemini", "codex". */
  adapter: "claude" | "gemini" | "codex";

  /** Pipeline stage. "draft" or "adapt-{platform}" (e.g., "adapt-x", "adapt-devto"). */
  stage: string;

  /** Working directory used during session creation. Absolute path. */
  cwd: string;

  /** ISO 8601 datetime when the session was first created. */
  createdAt: string;

  /** ISO 8601 datetime when the session was last used. Updated on every resume. */
  lastUsedAt: string;
}
```

```typescript
// llm/session.ts

import { z } from 'zod';

export const SessionDataSchema = z.object({
  sessionId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/),
  adapter: z.enum(["claude", "gemini", "codex"]),
  stage: z.string().min(1).max(100).regex(/^(draft|adapt-[a-z0-9-]+)$/),
  cwd: z.string().min(1),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
});
```

## 4. Method Signatures

```typescript
// llm/session.ts

export class SessionManager {
  /**
   * @param projectDir - Absolute path to the project directory.
   *   Must be non-empty, absolute. Session files stored under {projectDir}/.reach/sessions/.
   */
  constructor(projectDir: string);

  /**
   * Load a session for a given article and stage.
   *
   * @param article - Article name. Non-empty, 1-200 chars, alphanumeric + hyphens + underscores.
   * @param stage - Stage name. "draft" or "adapt-{platform}".
   * @returns SessionData if valid session file exists, null otherwise.
   *
   * Returns null when:
   * - Session file does not exist
   * - Session file is not valid JSON
   * - Session file fails Zod schema validation
   * - File read fails (permission error, etc.)
   *
   * Logs a warning via console.warn when returning null due to corruption.
   */
  async load(article: string, stage: string): Promise<SessionData | null>;

  /**
   * Save session data for a given article and stage.
   *
   * @param article - Article name. Same constraints as load().
   * @param stage - Stage name. Same constraints as load().
   * @param data - Session data. Must pass SessionDataSchema validation.
   * @throws SessionValidationError if data fails schema validation.
   *
   * Creates parent directories (.reach/sessions/{article}/) if they don't exist.
   * Uses atomic write: writes to {path}.tmp then renames to {path}.
   */
  async save(article: string, stage: string, data: SessionData): Promise<void>;

  /**
   * Delete a session file for a given article and stage.
   *
   * @param article - Article name.
   * @param stage - Stage name.
   *
   * No-op if the session file does not exist.
   * Does NOT throw on missing file.
   */
  async delete(article: string, stage: string): Promise<void>;

  /**
   * Delete all sessions for a given article.
   *
   * @param article - Article name.
   *
   * Removes the entire {article}/ directory under .reach/sessions/.
   * No-op if the article directory does not exist.
   */
  async deleteAll(article: string): Promise<void>;

  /**
   * List all sessions for a given article.
   *
   * @param article - Article name.
   * @returns Array of { stage, data } pairs. Empty array if no sessions exist.
   *
   * Skips corrupted session files (logs warning for each).
   */
  async list(article: string): Promise<Array<{ stage: string; data: SessionData }>>;

  /**
   * Resolve the filesystem path for a session file.
   * Exposed for testing purposes.
   */
  getSessionPath(article: string, stage: string): string;
}
```

## 5. Logic Steps

### SessionManager.constructor(projectDir)

1. Validate `projectDir` is non-empty and is an absolute path.
   - If not absolute: throw `Error("projectDir must be an absolute path")`.
2. Store `projectDir` as private field.
3. Compute `sessionsDir = path.join(projectDir, ".reach", "sessions")`.

### SessionManager.load(article, stage)

1. Validate `article`: non-empty, 1-200 chars, matches `/^[a-zA-Z0-9_-]+$/`.
   - If invalid: return `null` (do not throw; load is a query).
2. Validate `stage`: non-empty, matches `/^(draft|adapt-[a-z0-9-]+)$/`.
   - If invalid: return `null`.
3. Compute path: `filePath = path.join(this.sessionsDir, article, `${stage}.json`)`.
4. Check file exists: `await fs.access(filePath)`.
   - If ENOENT: return `null`.
5. Read file: `const raw = await fs.readFile(filePath, "utf-8")`.
   - If read error: log `console.warn("Warning: Cannot read session file ${filePath}: ${err.message}")`, return `null`.
6. Parse JSON: `const parsed = JSON.parse(raw)`.
   - If parse error: log `console.warn("Warning: Session file corrupted (invalid JSON): ${filePath}")`, return `null`.
7. Validate against `SessionDataSchema`:
   ```typescript
   const result = SessionDataSchema.safeParse(parsed);
   if (!result.success) {
     console.warn(`Warning: Session file corrupted (schema validation failed): ${filePath}`);
     return null;
   }
   ```
8. Return `result.data`.

### SessionManager.save(article, stage, data)

1. Validate `article` and `stage` same as load(). If invalid: throw `SessionValidationError("Invalid article or stage name")`.
2. Validate `data` against `SessionDataSchema`:
   ```typescript
   const result = SessionDataSchema.safeParse(data);
   if (!result.success) {
     throw new SessionValidationError(`Invalid session data: ${result.error.message}`);
   }
   ```
3. Compute path: `filePath = path.join(this.sessionsDir, article, `${stage}.json`)`.
4. Ensure parent directory exists: `await fs.mkdir(path.dirname(filePath), { recursive: true })`.
5. Serialize: `const json = JSON.stringify(result.data, null, 2) + "\n"`.
6. Atomic write:
   a. `tmpPath = filePath + ".tmp"`.
   b. `await fs.writeFile(tmpPath, json, "utf-8")`.
   c. `await fs.rename(tmpPath, filePath)`.
7. If rename fails (cross-device): fall back to `await fs.writeFile(filePath, json, "utf-8")`.

### SessionManager.delete(article, stage)

1. Validate `article` and `stage`. If invalid: return (no-op).
2. Compute path: `filePath = path.join(this.sessionsDir, article, `${stage}.json`)`.
3. `await fs.unlink(filePath)`.
4. Catch ENOENT: no-op (file already absent).
5. Try to remove parent directory if empty: `await fs.rmdir(path.dirname(filePath))`.
6. Catch ENOTEMPTY or ENOENT on rmdir: no-op.

### SessionManager.deleteAll(article)

1. Validate `article`. If invalid: return (no-op).
2. Compute dir: `articleDir = path.join(this.sessionsDir, article)`.
3. `await fs.rm(articleDir, { recursive: true, force: true })`.

### SessionManager.list(article)

1. Validate `article`. If invalid: return `[]`.
2. Compute dir: `articleDir = path.join(this.sessionsDir, article)`.
3. Read directory: `const entries = await fs.readdir(articleDir)`.
   - If ENOENT: return `[]`.
4. For each entry ending in `.json`:
   a. Extract stage name: `entry.replace(/\.json$/, "")`.
   b. Call `this.load(article, stage)`.
   c. If result is not null: add `{ stage, data: result }` to results array.
5. Return results sorted by `data.lastUsedAt` descending (most recent first).

### SessionManager.getSessionPath(article, stage)

1. Return `path.join(this.sessionsDir, article, `${stage}.json`)`.

## 6. Cross-Adapter Mismatch Handling

When a command loads a session and the stored `adapter` does not match the currently configured adapter, the session should NOT be resumed. This is handled at the command level (not inside SessionManager), as follows:

```typescript
// In draftCommand or refineCommand:
const session = await sessionManager.load(article, "draft");
const currentAdapter = adapterFactory.getAdapterName(config, "draft");

if (session && session.adapter !== currentAdapter) {
  console.warn(
    `Warning: Session was created with ${session.adapter} but current adapter is ${currentAdapter}. ` +
    `Starting a fresh session. Old session archived as draft.json.bak.`
  );
  await fs.copyFile(
    sessionManager.getSessionPath(article, "draft"),
    sessionManager.getSessionPath(article, "draft") + ".bak",
  );
  await sessionManager.delete(article, "draft");
  session = null; // Will create new session
}
```

## 7. File Layout Example

```
my-project/
  .reach/
    sessions/
      my-article/
        draft.json
        adapt-x.json
        adapt-devto.json
      another-article/
        draft.json
```

**Example `draft.json`:**
```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "adapter": "claude",
  "stage": "draft",
  "cwd": "/Users/alex/reach-workspace/my-project",
  "createdAt": "2026-03-17T10:00:00.000Z",
  "lastUsedAt": "2026-03-17T14:30:00.000Z"
}
```

## 8. Error Handling

| Error Condition            | Error Type                | Message                                               | Recovery |
|---------------------------|---------------------------|-------------------------------------------------------|----------|
| Invalid article name      | (null return / no-op)     | N/A (graceful degradation)                            | N/A      |
| Invalid stage name        | (null return / no-op)     | N/A (graceful degradation)                            | N/A      |
| Invalid session data      | `SessionValidationError`  | "Invalid session data: {zod error details}"           | Fix data |
| File read permission error| (null return + warning)   | "Warning: Cannot read session file {path}: {reason}"  | Fix permissions |
| Corrupted JSON            | (null return + warning)   | "Warning: Session file corrupted (invalid JSON): {path}" | Delete file |
| Schema validation failure | (null return + warning)   | "Warning: Session file corrupted (schema validation): {path}" | Delete file |
| Write failure             | Error (propagated)        | "Failed to save session: {reason}"                    | Check disk |
| projectDir not absolute   | Error                     | "projectDir must be an absolute path"                 | Fix caller |

## 9. Test Scenarios

### Unit Tests (`llm/__tests__/session.test.ts`)

1. `save()` then `load()` returns identical SessionData
2. `save()` creates parent directories if they don't exist
3. `save()` overwrites existing session file
4. `save()` throws SessionValidationError for invalid sessionId (empty string)
5. `save()` throws SessionValidationError for invalid adapter ("gpt4")
6. `save()` throws SessionValidationError for invalid stage ("unknown")
7. `load()` returns null when session file doesn't exist
8. `load()` returns null when file contains invalid JSON
9. `load()` returns null when file fails schema validation (missing field)
10. `load()` returns null and logs warning for corrupted file
11. `load()` returns null for invalid article name (empty string)
12. `load()` returns null for invalid stage name
13. `delete()` removes session file
14. `delete()` is no-op when file doesn't exist
15. `deleteAll()` removes entire article session directory
16. `deleteAll()` is no-op when article directory doesn't exist
17. `list()` returns all valid sessions for an article
18. `list()` skips corrupted session files
19. `list()` returns empty array when no sessions exist
20. `list()` sorts by lastUsedAt descending
21. Atomic write: file is valid even if process interrupted between write and rename
22. `getSessionPath()` returns correct path for draft stage
23. `getSessionPath()` returns correct path for adapt-x stage

### Mock Strategy

- Use `fs-extra` `ensureDir` + `writeFile` for test fixtures.
- Create temp directories per test to avoid cross-test contamination.
- Test atomic write by verifying `.tmp` file is cleaned up after save.

## 10. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `node:fs/promises` | Node built-in | File read/write/delete |
| `node:path` | Node built-in | Path construction |
| `zod` | npm dependency | Schema validation |
| `llm/types.ts` | Imports from | SessionData interface |
| `types/errors.ts` | Imports from | SessionValidationError class |
| `commands/draft.ts` | Imported by | Draft session management |
| `commands/refine.ts` | Imported by | Multi-turn session management |
| `commands/adapt.ts` | Imported by | Adapt session management |

---

*SRS Traceability: NFR-REL-002 (idempotent operations - atomic writes prevent corruption), supports US-003 enhanced (iterative refinement workflow). Session management is new functionality not directly mapped to existing SRS requirements; it enables the `reach refine` command.*
