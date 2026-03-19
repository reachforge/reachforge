# Implementation Plan: CLI Adapter Core

| Field | Value |
|-------|-------|
| **Feature** | CLI Adapter Core |
| **Spec** | `docs/features/cli-adapter-core.md` |
| **Status** | Planned |
| **Tasks** | 11 |
| **Test Count** | 87 |

## Dependency Graph

```
T01 (Types & errors)
 ├── T02 (Parser utils) ── T03 (Claude parser)
 │                      ── T04 (Gemini parser)
 │                      ── T05 (Codex parser)
 ├── T06 (ProcessRunner)
 │
 ├── T07 (ClaudeAdapter)  ── depends on T01, T03, T06
 ├── T08 (GeminiAdapter)  ── depends on T01, T04, T06
 ├── T09 (CodexAdapter)   ── depends on T01, T05, T06
 │
 ├── T10 (AdapterFactory) ── depends on T07, T08, T09
 └── T11 (Exports)        ── depends on T10
```

## Implementation Order

### Layer 1: Foundation (no dependencies)
- **T01** Types & error classes — `src/llm/types.ts`, `src/types/errors.ts`

### Layer 2: Parsers (depends on T01/T02)
- **T02** Parser utilities — `src/llm/parsers/utils.ts`
- **T03** Claude parser — `src/llm/parsers/claude.ts` (parallel with T04, T05)
- **T04** Gemini parser — `src/llm/parsers/gemini.ts` (parallel with T03, T05)
- **T05** Codex parser — `src/llm/parsers/codex.ts` (parallel with T03, T04)
- **T06** ProcessRunner — `src/llm/process.ts` (parallel with T03-T05)

### Layer 3: Adapters (depends on parsers + process)
- **T07** ClaudeAdapter — `src/llm/adapters/claude.ts` (parallel with T08, T09)
- **T08** GeminiAdapter — `src/llm/adapters/gemini.ts` (parallel with T07, T09)
- **T09** CodexAdapter — `src/llm/adapters/codex.ts` (parallel with T07, T08)

### Layer 4: Factory & integration
- **T10** AdapterFactory — `src/llm/factory.ts`
- **T11** Public exports — `src/llm/index.ts`, `src/types/index.ts`

## Tasks

### T01: Types & error classes
- **Files**: `src/llm/types.ts`, `src/types/errors.ts`
- **Tests**: `tests/unit/llm/types.test.ts`
- Define `CLIAdapter`, `AdapterExecuteOptions`, `AdapterResult`, `TokenUsage`, `AdapterProbeResult`, `AdapterErrorCode`
- Add 6 adapter error classes extending `ReachforgeError`
- **Test count**: 6

### T02: Parser utilities
- **Files**: `src/llm/parsers/utils.ts`
- **Tests**: `tests/unit/llm/parsers/utils.test.ts`
- `parseJsonLine()` — safe JSON parsing, returns null on failure
- `appendWithCap()` — append output capped at 4MB (`MAX_CAPTURE_BYTES = 4_194_304`)
- `extractAllErrorText()` — recursively pull error/message strings from objects
- **Test count**: 6

### T03: Claude stream-json parser
- **Files**: `src/llm/parsers/claude.ts`
- **Tests**: `tests/unit/llm/parsers/claude.test.ts`
- `parseClaudeStreamJson(stdout)` — parse init, assistant, result events
- `detectClaudeAuthRequired(stdout, stderr)` — regex auth detection
- `isClaudeUnknownSessionError(resultJson)` — session expiry detection
- **Test count**: 11

### T04: Gemini JSONL parser
- **Files**: `src/llm/parsers/gemini.ts`
- **Tests**: `tests/unit/llm/parsers/gemini.test.ts`
- `parseGeminiJsonl(stdout)` — parse assistant, result, text, step_finish, error events
- `detectGeminiAuthRequired(stdout, stderr)` — regex auth detection
- `isGeminiUnknownSessionError(stdout, stderr)` — session expiry detection
- **Test count**: 8

### T05: Codex JSONL parser
- **Files**: `src/llm/parsers/codex.ts`
- **Tests**: `tests/unit/llm/parsers/codex.test.ts`
- `parseCodexJsonl(stdout)` — parse thread.started, item.completed, turn.completed, error events
- `isCodexUnknownSessionError(stdout, stderr)` — session expiry detection
- **Test count**: 6

### T06: ProcessRunner
- **Files**: `src/llm/process.ts`
- **Tests**: `tests/unit/llm/process.test.ts`
- `runCLIProcess(options)` — spawn child process, capture output, handle timeout
- Strip Claude nesting env vars, ensure PATH, shell:false, 4MB cap
- SIGTERM → 20s grace → SIGKILL timeout chain
- **Test count**: 7

### T07: ClaudeAdapter
- **Files**: `src/llm/adapters/claude.ts`
- **Tests**: `tests/unit/llm/adapters/claude.test.ts`
- Temp skills dir with `.claude/skills/`, `--add-dir` injection
- Args: `--print - --output-format stream-json --verbose --dangerously-skip-permissions`
- Prompt via stdin, session retry on unknown session error
- **Test count**: 11

### T08: GeminiAdapter
- **Files**: `src/llm/adapters/gemini.ts`
- **Tests**: `tests/unit/llm/adapters/gemini.test.ts`
- Skills via symlink to `~/.gemini/skills/`
- Args: `--output-format stream-json --approval-mode yolo --sandbox=none`
- Prompt as final positional arg (no stdin)
- **Test count**: 7

### T09: CodexAdapter
- **Files**: `src/llm/adapters/codex.ts`
- **Tests**: `tests/unit/llm/adapters/codex.test.ts`
- Skills via symlink to `~/.codex/skills/`
- Args: `exec --json --dangerously-bypass-approvals-and-sandbox`
- Prompt via stdin, session via `resume SESSION_ID -`
- **Test count**: 7

### T10: AdapterFactory
- **Files**: `src/llm/factory.ts`
- **Tests**: `tests/unit/llm/factory.test.ts`
- Stage-specific adapter resolution: `REACHFORGE_DRAFT_ADAPTER` > `REACHFORGE_LLM_ADAPTER` > config > default
- Command resolution with PATH search and custom command env vars
- **Test count**: 8

### T11: Public exports
- **Files**: `src/llm/index.ts`, `src/types/index.ts`
- Update exports for all new types, parsers, adapters, factory
- **Test count**: 2 (import verification)

## New directories to create

```
src/llm/adapters/     — adapter implementations
src/llm/parsers/      — output parsers
tests/unit/llm/adapters/
tests/unit/llm/parsers/
```

## Notes

- Mock `runCLIProcess` for adapter tests — never spawn real CLI in unit tests
- Use fixture strings (not files) for parser tests — inline stream-json/JSONL in test files
- Existing `LLMProvider` interface and `GeminiProvider` kept during migration; commands updated separately
- `AdapterFactory.create()` depends on `SkillResolver` from `docs/features/skill-resolver.md` — stub the skill resolution in T10, wire up when skill-resolver is implemented
