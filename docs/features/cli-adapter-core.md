# Feature Spec: CLI Adapter Core

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| **Component**| CLI Adapter Layer                                  |
| **Directory**| `src/llm/`                                         |
| **Priority** | P0                                                 |
| **SRS Refs** | FR-DRAFT-002, FR-DRAFT-005, FR-ADAPT-002           |
| **NFR Refs** | NFR-PERF-002, NFR-MAINT-001                        |
| **Tech Design** | [LLM Adapter Tech Design](../llm-adapter/tech-design.md) |

---

## 1. Purpose and Scope

The CLI Adapter Core provides a unified interface for executing LLM prompts via locally-installed CLI tools (Claude Code, Gemini CLI, Codex CLI). It replaces the current `LLMProvider` interface and `GeminiProvider` SDK-based implementation with a child-process-based adapter pattern. The module handles: adapter selection, child process spawning, structured output parsing, error detection, and result normalization.

This module provides:
- `CLIAdapter` interface defining the `execute()` and `probe()` contracts
- `ClaudeAdapter`, `GeminiAdapter`, `CodexAdapter` implementations
- `ProcessRunner` utility for child process spawning
- Per-adapter output parsers (stream-json / JSONL)
- `AdapterFactory` for adapter instantiation based on configuration

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `llm/types.ts` | CLIAdapter interface, AdapterResult, AdapterExecuteOptions, TokenUsage, error types | 120 |
| `llm/factory.ts` | AdapterFactory.create() - selects and instantiates adapter from config | 100 |
| `llm/process.ts` | runCLIProcess() - child process spawn, capture, timeout, env sanitization | 150 |
| `llm/adapters/claude.ts` | ClaudeAdapter - argument building, skill injection via temp dir, session resume | 200 |
| `llm/adapters/gemini.ts` | GeminiAdapter - argument building, skill injection via home dir, session resume | 180 |
| `llm/adapters/codex.ts` | CodexAdapter - argument building, skill injection via home dir, session resume | 180 |
| `llm/parsers/claude.ts` | parseClaudeStreamJson() - extract session, content, usage, errors | 120 |
| `llm/parsers/gemini.ts` | parseGeminiJsonl() - extract session, content, usage, errors | 130 |
| `llm/parsers/codex.ts` | parseCodexJsonl() - extract session, content, usage, errors | 80 |
| `llm/parsers/utils.ts` | Shared: firstNonEmptyLine(), parseJsonLine(), appendWithCap() | 50 |
| `llm/index.ts` | Public exports | 20 |

## 3. TypeScript Interfaces

```typescript
// llm/types.ts

export interface CLIAdapter {
  readonly name: "claude" | "gemini" | "codex";
  readonly command: string;

  execute(options: AdapterExecuteOptions): Promise<AdapterResult>;
  probe(): Promise<AdapterProbeResult>;
}

export interface AdapterExecuteOptions {
  prompt: string;            // 1-500,000 chars. The full prompt to send.
  cwd: string;               // Absolute path to an existing directory.
  skillPaths: string[];      // Resolved skill file paths (absolute, .md). May be empty.
  sessionId: string | null;  // Session to resume, or null for new session.
  timeoutSec: number;        // 10-3600. Default: 300.
  extraArgs: string[];       // Additional CLI arguments. Default: [].
}

export interface AdapterResult {
  success: boolean;
  content: string;
  sessionId: string | null;
  usage: TokenUsage;
  costUsd: number | null;
  model: string;
  errorMessage: string | null;
  errorCode: AdapterErrorCode | null;
  exitCode: number | null;
  timedOut: boolean;
}

export type AdapterErrorCode =
  | "auth_required"
  | "command_not_found"
  | "timeout"
  | "parse_error"
  | "session_expired"
  | "unknown";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface AdapterProbeResult {
  available: boolean;
  authenticated: boolean;
  version: string | null;
  errorMessage: string | null;
}
```

## 4. Method Signatures

### AdapterFactory

```typescript
// llm/factory.ts

import type { ConfigManager } from '../core/config.js';
import type { CLIAdapter, ResolvedSkill } from './types.js';

export class AdapterFactory {
  /**
   * Creates a CLIAdapter for the given pipeline stage.
   *
   * @param config - ConfigManager instance with loaded settings
   * @param stage - "draft" | "adapt"
   * @param platform - Target platform (required for adapt stage)
   * @returns Object containing the adapter, resolved skills, and null session
   * @throws AdapterNotFoundError if adapter name is not one of: claude, gemini, codex
   * @throws AdapterNotInstalledError if CLI command is not in PATH
   */
  static async create(
    config: ConfigManager,
    stage: string,
    platform?: string,
  ): Promise<{
    adapter: CLIAdapter;
    skills: ResolvedSkill[];
  }>;
}
```

### ProcessRunner

```typescript
// llm/process.ts

export interface ProcessOptions {
  command: string;       // CLI command name or path
  args: string[];        // Command arguments
  cwd: string;           // Working directory (absolute)
  env: Record<string, string>; // Environment variables
  stdin?: string;        // Optional stdin content
  timeoutSec: number;    // Timeout in seconds (10-3600)
}

export interface ProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;        // Capped at 4 MB
  stderr: string;        // Capped at 4 MB
}

/**
 * Spawn a CLI process and capture its output.
 *
 * Behavior:
 * - Strips Claude Code nesting env vars to prevent "cannot launch inside session" errors
 * - Ensures PATH includes system binary directories
 * - Uses shell: false for security
 * - On timeout: SIGTERM, wait 20s grace, then SIGKILL
 * - Caps stdout/stderr at 4 MB
 *
 * @throws Error if command cannot be spawned (ENOENT)
 */
export async function runCLIProcess(options: ProcessOptions): Promise<ProcessResult>;
```

### ClaudeAdapter

```typescript
// llm/adapters/claude.ts

export class ClaudeAdapter implements CLIAdapter {
  readonly name = "claude" as const;
  readonly command: string;

  constructor(command: string); // default: "claude"

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult>;
  async probe(): Promise<AdapterProbeResult>;
}
```

### GeminiAdapter

```typescript
// llm/adapters/gemini.ts

export class GeminiAdapter implements CLIAdapter {
  readonly name = "gemini" as const;
  readonly command: string;

  constructor(command: string); // default: "gemini"

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult>;
  async probe(): Promise<AdapterProbeResult>;
}
```

### CodexAdapter

```typescript
// llm/adapters/codex.ts

export class CodexAdapter implements CLIAdapter {
  readonly name = "codex" as const;
  readonly command: string;

  constructor(command: string); // default: "codex"

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult>;
  async probe(): Promise<AdapterProbeResult>;
}
```

## 5. Logic Steps

### AdapterFactory.create(config, stage, platform?)

1. Determine adapter name:
   - If `stage === "draft"`: check `process.env.REACHFORGE_DRAFT_ADAPTER`, then `config.getDraftAdapter()`, then fall through.
   - If `stage === "adapt"`: check `process.env.REACHFORGE_ADAPT_ADAPTER`, then `config.getAdaptAdapter()`, then fall through.
   - Fall through: check `process.env.REACHFORGE_LLM_ADAPTER`, then `config.getLLMAdapter()`, then default `"claude"`.
2. Validate adapter name is one of `["claude", "gemini", "codex"]`.
   - If invalid: throw `new AdapterNotFoundError("Unknown LLM adapter: ${name}. Supported: claude, gemini, codex")`.
3. Determine command path:
   - Default commands: `{ claude: "claude", gemini: "gemini", codex: "codex" }`.
   - Check `process.env.REACHFORGE_${name.toUpperCase()}_COMMAND` for custom command path.
4. Verify command exists in PATH by attempting to resolve it:
   - Search PATH directories for executable file.
   - On macOS/Linux: include `/usr/local/bin`, `/opt/homebrew/bin` in search.
   - If not found: throw `new AdapterNotInstalledError("${name} CLI is not installed or not in PATH. Install from ${installUrl}")`.
   - Install URLs: Claude = `https://docs.anthropic.com/en/docs/claude-code`, Gemini = `https://ai.google.dev/gemini-cli`, Codex = `https://github.com/openai/codex`.
5. Instantiate adapter: `new ClaudeAdapter(command)`, `new GeminiAdapter(command)`, or `new CodexAdapter(command)`.
6. Create SkillResolver and resolve skills for stage+platform (see skill-resolver.md).
7. Return `{ adapter, skills }`.

### ClaudeAdapter.execute(options)

1. **Validate options**: (see Parameter Validation in tech design section 4.2.1).
2. **Build skills directory**:
   a. Create temp directory: `fs.mkdtemp(path.join(os.tmpdir(), "reachforge-skills-"))`.
   b. Create `.claude/skills/` inside temp dir.
   c. For each skill path in `options.skillPaths`:
      - Read skill file content.
      - Write to `{tmpdir}/.claude/skills/{skillName}`.
   d. Record temp dir path for cleanup.
3. **Build prompt**:
   a. Read each skill file content.
   b. Prepend skill content to the user prompt: `${skillContent}\n\n---\n\n${options.prompt}`.
4. **Build CLI arguments**:
   ```
   args = ["--print", "-", "--output-format", "stream-json", "--verbose",
           "--dangerously-skip-permissions"]
   if (options.sessionId) args.push("--resume", options.sessionId)
   args.push("--add-dir", tmpdir)
   args.push(...options.extraArgs)
   ```
5. **Build environment**:
   a. Clone `process.env`.
   b. Delete keys: `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION`, `CLAUDE_CODE_PARENT_SESSION`.
   c. Ensure PATH includes `/usr/local/bin:/opt/homebrew/bin`.
6. **Spawn process**:
   ```
   result = await runCLIProcess({
     command: this.command,
     args,
     cwd: options.cwd,
     env,
     stdin: fullPrompt,
     timeoutSec: options.timeoutSec,
   })
   ```
7. **Parse output**: Call `parseClaudeStreamJson(result.stdout)`.
8. **Detect auth errors**: Test `detectClaudeAuthRequired(result.stdout, result.stderr)`.
9. **Handle session expiry**:
   a. If `options.sessionId && exitCode !== 0 && isClaudeUnknownSessionError(parsed)`:
      - Log warning: `"Session ${options.sessionId} is no longer available; starting fresh session."`
      - Retry execution with `sessionId: null` (steps 4-7 again, without `--resume`).
      - Return retry result with `errorCode: "session_expired"` if retry also fails.
10. **Build AdapterResult**:
    ```typescript
    {
      success: result.exitCode === 0 && parsedContent.length > 0,
      content: parsedContent,
      sessionId: parsed.sessionId,
      usage: { inputTokens: parsed.usage.inputTokens,
               outputTokens: parsed.usage.outputTokens,
               cachedTokens: parsed.usage.cachedInputTokens },
      costUsd: parsed.costUsd,
      model: parsed.model,
      errorMessage: result.exitCode === 0 ? null : describeClaudeFailure(parsed),
      errorCode: determineErrorCode(result, authMeta),
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    }
    ```
11. **Cleanup**: Delete temp skills directory. Use `finally` block to ensure cleanup on both success and error paths.

### GeminiAdapter.execute(options)

1. **Validate options**: Same validation as Claude.
2. **Inject skills**:
   a. Target directory: `~/.gemini/skills/`.
   b. Create directory if not exists.
   c. For each skill path in `options.skillPaths`:
      - Create symlink `~/.gemini/skills/{skillName} -> {skillPath}`.
      - If symlink already exists and points to correct target: skip.
      - If symlink exists but points elsewhere: skip (do not overwrite user skills).
3. **Build prompt**: Prepend skill content to prompt text (same as Claude step 3).
4. **Build CLI arguments**:
   ```
   args = ["--output-format", "stream-json",
           "--approval-mode", "yolo", "--sandbox=none"]
   if (options.sessionId) args.push("--resume", options.sessionId)
   args.push(...options.extraArgs)
   args.push(fullPrompt)  // prompt as final positional argument
   ```
5. **Build environment**: Clone `process.env`. No special vars to strip.
6. **Spawn process**: Same as Claude but without `stdin` (prompt is positional).
7. **Parse output**: Call `parseGeminiJsonl(result.stdout)`.
8. **Detect auth errors**: Test `detectGeminiAuthRequired(result.stdout, result.stderr)`.
9. **Handle session expiry**: Same pattern as Claude using `isGeminiUnknownSessionError()`.
10. **Build AdapterResult**: Same structure as Claude.

### CodexAdapter.execute(options)

1. **Validate options**: Same validation as Claude.
2. **Inject skills**:
   a. Target directory: `~/.codex/skills/`.
   b. Same symlink approach as Gemini.
3. **Build prompt**: Prepend skill content to prompt text.
4. **Build CLI arguments**:
   ```
   args = ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox"]
   args.push(...options.extraArgs)
   if (options.sessionId) args.push("resume", options.sessionId, "-")
   else args.push("-")
   ```
5. **Build environment**: Clone `process.env`.
6. **Spawn process**: With `stdin: fullPrompt`.
7. **Parse output**: Call `parseCodexJsonl(result.stdout)`.
8. **Handle session expiry**: Same pattern using `isCodexUnknownSessionError()`.
9. **Build AdapterResult**: Same structure. Note: Codex does not report `costUsd` (always null).

### Probe Methods

All three adapters implement `probe()` with the same pattern:

1. Spawn `{command} --version` (or equivalent) with 10-second timeout.
2. If spawn fails (ENOENT): return `{ available: false, authenticated: false, version: null, errorMessage: "not installed" }`.
3. If succeeds: parse version from stdout.
4. Spawn a minimal test prompt ("Say hello") with 30-second timeout.
5. If succeeds: return `{ available: true, authenticated: true, version, errorMessage: null }`.
6. If auth error detected: return `{ available: true, authenticated: false, version, errorMessage: "authentication required" }`.

## 6. Parser Implementations

### parseClaudeStreamJson(stdout: string)

```typescript
export function parseClaudeStreamJson(stdout: string): {
  sessionId: string | null;
  model: string;
  costUsd: number | null;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null;
  summary: string;
  resultJson: Record<string, unknown> | null;
};
```

**Logic:**
1. Split stdout by newlines.
2. For each non-empty line, attempt JSON.parse.
3. Route by `type` field:
   - `type: "system", subtype: "init"` => capture `session_id`, `model`.
   - `type: "assistant"` => capture `session_id`; extract text from `message.content[]` where `block.type === "text"`.
   - `type: "result"` => capture `session_id`, extract `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens`, `total_cost_usd`, `result` (summary text).
4. Join all assistant text blocks with `\n\n`.
5. Return aggregated result.

### parseGeminiJsonl(stdout: string)

```typescript
export function parseGeminiJsonl(stdout: string): {
  sessionId: string | null;
  summary: string;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  costUsd: number | null;
  errorMessage: string | null;
  resultEvent: Record<string, unknown> | null;
};
```

**Logic:**
1. Split stdout by newlines, JSON.parse each.
2. Route by `type`:
   - `type: "assistant"` => extract text from message content.
   - `type: "result"` => accumulate usage from `usageMetadata`, capture cost, session ID.
   - `type: "text"` => extract `part.text`.
   - `type: "step_finish"` => accumulate usage.
   - `type: "error"` or `type: "system", subtype: "error"` => capture error message.
3. Session ID read from any event with: `session_id`, `sessionId`, `checkpoint_id`, or `thread_id`.
4. Usage accumulates across all events (multiple step_finish events contribute).

### parseCodexJsonl(stdout: string)

```typescript
export function parseCodexJsonl(stdout: string): {
  sessionId: string | null;
  summary: string;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  errorMessage: string | null;
};
```

**Logic:**
1. Split stdout by newlines, JSON.parse each.
2. Route by `type`:
   - `type: "thread.started"` => capture `thread_id` as session ID.
   - `type: "item.completed"` where `item.type === "agent_message"` => extract `item.text`.
   - `type: "turn.completed"` => extract usage: `input_tokens`, `output_tokens`, `cached_input_tokens`.
   - `type: "error"` => capture `message` as error.
   - `type: "turn.failed"` => capture `error.message`.

## 7. Auth Detection Functions

```typescript
// llm/parsers/claude.ts
const CLAUDE_AUTH_RE = /(?:not\s+logged\s+in|please\s+log\s+in|login\s+required|unauthorized|authentication\s+required)/i;

export function detectClaudeAuthRequired(stdout: string, stderr: string): boolean {
  return CLAUDE_AUTH_RE.test(stdout) || CLAUDE_AUTH_RE.test(stderr);
}

export function isClaudeUnknownSessionError(resultJson: Record<string, unknown>): boolean {
  // Check result text and error messages for session-not-found patterns
  return /no conversation found with session id|unknown session|session .* not found/i.test(
    extractAllErrorText(resultJson)
  );
}
```

```typescript
// llm/parsers/gemini.ts
const GEMINI_AUTH_RE = /(?:not\s+authenticated|api[_ ]?key\s+(?:required|missing|invalid)|unauthorized|not\s+logged\s+in|run\s+`?gemini\s+auth)/i;

export function detectGeminiAuthRequired(stdout: string, stderr: string): boolean {
  return GEMINI_AUTH_RE.test(stdout) || GEMINI_AUTH_RE.test(stderr);
}

export function isGeminiUnknownSessionError(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return /unknown\s+session|session\s+.*\s+not\s+found|cannot\s+resume|failed\s+to\s+resume/i.test(combined);
}
```

```typescript
// llm/parsers/codex.ts
export function isCodexUnknownSessionError(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return /unknown (session|thread)|session .* not found|thread .* not found/i.test(combined);
}
```

## 8. Error Handling

| Error Condition               | Error Class                  | User Message                                                           | Recovery |
|-------------------------------|------------------------------|------------------------------------------------------------------------|----------|
| Unknown adapter name          | `AdapterNotFoundError`       | "Unknown LLM adapter: '{name}'. Supported: claude, gemini, codex"      | User fixes REACHFORGE_LLM_ADAPTER |
| CLI not installed             | `AdapterNotInstalledError`   | "{name} CLI is not installed or not in PATH. Install from {url}"       | User installs CLI |
| CLI not authenticated         | `AdapterAuthError`           | "{name} requires authentication. Run '{command} login' first."         | User runs login |
| Process timeout               | `AdapterTimeoutError`        | "LLM generation timed out after {n}s. Increase with REACHFORGE_LLM_TIMEOUT" | User increases timeout |
| Empty response                | `AdapterEmptyResponseError`  | "{name} returned an empty response. Try again."                        | User retries |
| Session expired               | (handled internally)         | Warning: "Session {id} expired; starting fresh session."               | Automatic retry |
| Process spawn ENOENT          | `AdapterNotInstalledError`   | "Failed to start '{command}'. Verify it is installed and in PATH."     | User fixes PATH |
| Prompt too long (>500K chars) | `AdapterValidationError`     | "Prompt exceeds maximum length of 500,000 characters."                 | User shortens content |
| Invalid cwd                   | `AdapterValidationError`     | "cwd must be an absolute path to an existing directory: '{path}'"      | User fixes path |
| Parse failure (no valid JSON) | (soft failure)               | Warning logged; content extracted from raw stdout as fallback          | Best-effort |

## 9. Test Scenarios

### Unit Tests (`llm/__tests__/factory.test.ts`)

1. `create()` returns `ClaudeAdapter` when adapter is "claude" and claude is in PATH
2. `create()` returns `GeminiAdapter` when adapter is "gemini" and gemini is in PATH
3. `create()` returns `CodexAdapter` when adapter is "codex" and codex is in PATH
4. `create()` throws `AdapterNotFoundError` for "gpt4"
5. `create()` throws `AdapterNotInstalledError` when command not in PATH
6. `create()` respects `REACHFORGE_DRAFT_ADAPTER` for draft stage
7. `create()` respects `REACHFORGE_ADAPT_ADAPTER` for adapt stage
8. `create()` defaults to "claude" when no config is set

### Unit Tests (`llm/__tests__/process.test.ts`)

9. `runCLIProcess()` captures stdout from a simple echo command
10. `runCLIProcess()` captures stderr separately from stdout
11. `runCLIProcess()` delivers stdin content to the child process
12. `runCLIProcess()` returns `timedOut: true` when process exceeds timeout
13. `runCLIProcess()` strips CLAUDECODE env vars from spawned environment
14. `runCLIProcess()` caps stdout capture at 4 MB
15. `runCLIProcess()` returns ENOENT error for missing command

### Unit Tests (`llm/__tests__/parsers/claude.test.ts`)

16. `parseClaudeStreamJson()` extracts sessionId from init event
17. `parseClaudeStreamJson()` extracts model from init event
18. `parseClaudeStreamJson()` concatenates text from multiple assistant events
19. `parseClaudeStreamJson()` extracts usage from result event
20. `parseClaudeStreamJson()` extracts costUsd from result event
21. `parseClaudeStreamJson()` returns null sessionId when no events contain session_id
22. `detectClaudeAuthRequired()` returns true for "not logged in" in stderr
23. `detectClaudeAuthRequired()` returns false for normal output
24. `isClaudeUnknownSessionError()` returns true for "no conversation found with session id"

### Unit Tests (`llm/__tests__/parsers/gemini.test.ts`)

25. `parseGeminiJsonl()` extracts sessionId from event with session_id field
26. `parseGeminiJsonl()` accumulates usage across multiple step_finish events
27. `parseGeminiJsonl()` extracts error message from error events
28. `detectGeminiAuthRequired()` returns true for "not authenticated"
29. `isGeminiUnknownSessionError()` returns true for "unknown session"

### Unit Tests (`llm/__tests__/parsers/codex.test.ts`)

30. `parseCodexJsonl()` extracts sessionId from thread.started event
31. `parseCodexJsonl()` extracts text from item.completed agent_message events
32. `parseCodexJsonl()` extracts usage from turn.completed events
33. `isCodexUnknownSessionError()` returns true for "unknown thread"

### Integration Tests

34. ClaudeAdapter.execute() constructs correct args with session resume
35. ClaudeAdapter.execute() retries on unknown session error
36. GeminiAdapter.execute() passes prompt as positional argument
37. CodexAdapter.execute() uses "exec --json" subcommand
38. All adapters return `errorCode: "auth_required"` on auth failure

### Mock Strategy

- Mock `runCLIProcess` for all adapter unit tests (replace child_process.spawn)
- Use fixture files with recorded stream-json/JSONL output for parser tests
- Create minimal shell scripts for integration tests that simulate CLI behavior:
  - `mock-claude.sh`: echo back stream-json with session ID
  - `mock-gemini.sh`: echo back JSONL with session ID
  - `mock-codex.sh`: echo back JSONL with thread ID

## 10. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `node:child_process` | Node built-in | Process spawning |
| `node:fs/promises` | Node built-in | Skill injection temp dirs, symlinks |
| `node:os` | Node built-in | Temp directory, home directory |
| `node:path` | Node built-in | Path resolution |
| `core/config.ts` | Imports from | Adapter name, timeout settings |
| `types/errors.ts` | Imports from | Error classes (AdapterNotFoundError, etc.) |
| `llm/session.ts` | Used by commands | Session loading/saving (not by adapters directly) |
| `llm/skills.ts` | Used by factory | Skill resolution |
| `commands/draft.ts` | Imported by | Draft generation |
| `commands/adapt.ts` | Imported by | Platform adaptation |
| `commands/refine.ts` | Imported by | Interactive refinement |

## 11. Configuration

New config keys in `ConfigManager`:

```typescript
// Added to ReachforgeConfig interface
llmAdapter?: string;       // "claude" | "gemini" | "codex". Default: "claude"
llmTimeout?: number;       // 10-3600 seconds. Default: 300
draftAdapter?: string;     // Override adapter for draft stage
adaptAdapter?: string;     // Override adapter for adapt stage
```

Environment variable mapping:

| Env Variable             | Config Key        | Default    |
|--------------------------|-------------------|------------|
| `REACHFORGE_LLM_ADAPTER`    | `llm_adapter`     | `"claude"` |
| `REACHFORGE_LLM_TIMEOUT`    | `llm_timeout`     | `300`      |
| `REACHFORGE_DRAFT_ADAPTER`  | `draft_adapter`   | (inherits) |
| `REACHFORGE_ADAPT_ADAPTER`  | `adapt_adapter`   | (inherits) |
| `REACHFORGE_CLAUDE_COMMAND`  | N/A (env only)    | `"claude"` |
| `REACHFORGE_GEMINI_COMMAND`  | N/A (env only)    | `"gemini"` |
| `REACHFORGE_CODEX_COMMAND`   | N/A (env only)    | `"codex"`  |

---

*SRS Traceability: FR-DRAFT-002 (LLM content generation, now via CLI adapters), FR-DRAFT-005 (API key / auth error), FR-ADAPT-002 (platform-specific adaptation via skill injection), NFR-PERF-002 (progress indication before CLI spawn), NFR-MAINT-001 (modular file structure, each file under 200 lines).*
