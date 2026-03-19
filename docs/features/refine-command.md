# Feature Spec: Refine Command

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| **Component**| Interactive Refinement Command                     |
| **Directory**| `src/commands/refine.ts`                           |
| **Priority** | P0                                                 |
| **SRS Refs** | New (extends US-003, US-001)                       |
| **NFR Refs** | NFR-PERF-002, NFR-REL-001                          |
| **Tech Design** | [LLM Adapter Tech Design](../llm-adapter/tech-design.md) |

---

## 1. Purpose and Scope

The `reachforge refine <article>` command provides an interactive multi-turn conversation loop for iteratively improving a draft article. The user gives feedback, the LLM revises the draft, and the cycle repeats until the user saves or quits. This command is the primary use case for session resumption: the draft session persists across multiple `refine` invocations, so the LLM retains context from all previous feedback rounds.

The module provides:
- `refineCommand()` function implementing the interactive loop
- Readline-based user input handling
- Session resume/save integration
- Draft file read/write with stage awareness

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `commands/refine.ts` | refineCommand() - interactive loop, session management, adapter calls | 200 |

## 3. TypeScript Interfaces

```typescript
// commands/refine.ts

import type { PipelineEngine } from '../core/pipeline.js';
import type { ConfigManager } from '../core/config.js';

/**
 * Interactive multi-turn draft refinement command.
 *
 * @param engine - PipelineEngine for file operations
 * @param config - ConfigManager for adapter configuration
 * @param article - Article name (must exist in 02_drafts or 03_master)
 * @throws Error if article not found in drafts or master stage
 */
export async function refineCommand(
  engine: PipelineEngine,
  config: ConfigManager,
  article: string,
): Promise<void>;
```

## 4. CLI Registration

```typescript
// In src/index.ts (Commander.js registration)

program
  .command('refine <article>')
  .description('Interactively refine a draft article with AI feedback')
  .action(async (article: string) => {
    await refineCommand(engine, config, article);
  });
```

**Help output:**
```
Usage: reachforge refine <article>

Interactively refine a draft article with AI feedback.
Resumes the previous conversation session if one exists.

Arguments:
  article    Article name (must exist in 02_drafts or 03_master)

Commands during refinement:
  /save      Save the current draft and exit
  /quit      Exit without saving
  /status    Show current session info (adapter, session ID, turns)
  /diff      Show differences from the original draft
```

## 5. Logic Steps

### refineCommand(engine, config, article)

1. **Validate article name**:
   - `safeName = sanitizePath(article)`.
   - If empty: throw `Error("Article name is required")`.

2. **Locate article**:
   - Check `02_drafts/{safeName}/draft.md` exists.
   - If not: check `03_master/{safeName}/master.md` exists.
   - If neither: throw `Error("Article '${safeName}' not found in 02_drafts or 03_master")`.
   - Record which stage and filename was found: `{ stage: "02_drafts" | "03_master", filename: "draft.md" | "master.md" }`.

3. **Read current draft content**:
   - `currentContent = await fs.readFile(draftPath, "utf-8")`.
   - Store as `originalContent` for `/diff` comparison.

4. **Create adapter**:
   - `const { adapter, skills } = await AdapterFactory.create(config, "draft")`.

5. **Load session**:
   - Determine project directory from engine.
   - `const sessionManager = new SessionManager(projectDir)`.
   - `let session = await sessionManager.load(safeName, "draft")`.
   - If session exists and `session.adapter !== adapter.name`:
     - Print warning: `"Previous session was with ${session.adapter}. Starting fresh session with ${adapter.name}."`.
     - Archive old session: copy to `.bak`.
     - Set `session = null`.
   - If session exists:
     - Print: `"Resuming session ${session.sessionId} (last used: ${session.lastUsedAt})"`.
   - If no session:
     - Print: `"Starting new refinement session with ${adapter.name}."`.

6. **Display current content preview**:
   - Print first 500 characters of `currentContent` with `...` truncation.
   - Print: `"(${currentContent.length} characters total)"`.
   - Print blank line.

7. **Initialize state**:
   ```typescript
   let turnCount = 0;
   let sessionId = session?.sessionId ?? null;
   let latestContent = currentContent;
   ```

8. **Create readline interface**:
   ```typescript
   const rl = readline.createInterface({
     input: process.stdin,
     output: process.stdout,
   });
   ```

9. **Enter interactive loop**:
   ```typescript
   while (true) {
     const feedback = await promptUser(rl, "Feedback (/save, /quit, /status, /diff): ");
     const trimmed = feedback.trim();

     if (trimmed === "/quit") {
       console.log("Exiting without saving.");
       break;
     }

     if (trimmed === "/save") {
       await saveContent(engine, stage, safeName, filename, latestContent);
       console.log(`Draft saved to ${stage}/${safeName}/${filename}`);
       break;
     }

     if (trimmed === "/status") {
       printStatus(adapter.name, sessionId, turnCount, safeName);
       continue;
     }

     if (trimmed === "/diff") {
       printDiff(originalContent, latestContent);
       continue;
     }

     if (!trimmed) {
       console.log("Please enter feedback or a command.");
       continue;
     }

     // Send feedback to LLM
     turnCount++;
     console.log(`Sending feedback to ${adapter.name}... (turn ${turnCount})`);

     const prompt = buildRefinePrompt(latestContent, trimmed, skills, resolver);
     const result = await adapter.execute({
       prompt,
       cwd: projectDir,
       skillPaths: skills.map(s => s.path),
       sessionId,
       timeoutSec: config.getLLMTimeout(),
       extraArgs: [],
     });

     if (!result.success) {
       console.error(`Error: ${result.errorMessage ?? "Unknown error"}`);
       if (result.errorCode === "auth_required") {
         console.error(`Run '${adapter.command} login' to authenticate.`);
         break;
       }
       if (result.errorCode === "timeout") {
         console.error("Try again with a shorter prompt or increase REACHFORGE_LLM_TIMEOUT.");
       }
       continue; // Don't break on transient errors; let user try again
     }

     // Update state
     sessionId = result.sessionId ?? sessionId;
     latestContent = result.content || latestContent; // Keep old content if empty response
     printContentPreview(latestContent);

     // Save session after each successful turn
     await sessionManager.save(safeName, "draft", {
       sessionId: sessionId!,
       adapter: adapter.name,
       stage: "draft",
       cwd: projectDir,
       createdAt: session?.createdAt ?? new Date().toISOString(),
       lastUsedAt: new Date().toISOString(),
     });

     // Print usage info
     if (result.usage.inputTokens > 0 || result.usage.outputTokens > 0) {
       console.log(
         chalk.dim(`  Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out` +
           (result.costUsd != null ? ` ($${result.costUsd.toFixed(4)})` : ""))
       );
     }
   }
   ```

10. **Cleanup**:
    - Close readline interface: `rl.close()`.

### Helper Functions

#### buildRefinePrompt(currentContent, feedback, skills, resolver)

```typescript
function buildRefinePrompt(
  currentContent: string,
  feedback: string,
  skills: ResolvedSkill[],
  resolver: SkillResolver,
): string {
  const skillContent = skills.map(s => resolver.readSkillContent(s)).join("\n\n---\n\n");

  // On first turn (no session), include the full draft + instructions
  // On subsequent turns (with session), the LLM has context; just send feedback
  const parts: string[] = [];

  if (skillContent) parts.push(skillContent);

  parts.push(
    "You are helping refine a draft article. " +
    "Apply the user's feedback to improve the draft. " +
    "Output the COMPLETE revised article (not just the changed parts).\n\n" +
    `## Current Draft\n\n${currentContent}\n\n` +
    `## User Feedback\n\n${feedback}`
  );

  return parts.join("\n\n---\n\n");
}
```

Note: On session resume (turns 2+), the LLM has the full conversation history. The prompt still includes the current content to handle cases where the session was partially lost. The LLM is smart enough to recognize redundant context.

#### promptUser(rl, prompt)

```typescript
function promptUser(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}
```

#### printStatus(adapterName, sessionId, turnCount, article)

```typescript
function printStatus(adapterName: string, sessionId: string | null, turnCount: number, article: string): void {
  console.log(`Adapter: ${adapterName}`);
  console.log(`Article: ${article}`);
  console.log(`Session: ${sessionId ?? "(none - new session)"}`);
  console.log(`Turns completed: ${turnCount}`);
}
```

#### printDiff(original, current)

```typescript
function printDiff(original: string, current: string): void {
  if (original === current) {
    console.log("No changes from original.");
    return;
  }

  const originalLines = original.split("\n");
  const currentLines = current.split("\n");

  console.log(`Original: ${originalLines.length} lines, ${original.length} chars`);
  console.log(`Current:  ${currentLines.length} lines, ${current.length} chars`);
  console.log(`Delta:    ${current.length - original.length > 0 ? "+" : ""}${current.length - original.length} chars`);
}
```

#### printContentPreview(content)

```typescript
function printContentPreview(content: string): void {
  const preview = content.length > 500 ? content.slice(0, 500) + "..." : content;
  console.log("\n--- Updated Draft Preview ---");
  console.log(preview);
  console.log(`--- (${content.length} characters total) ---\n`);
}
```

#### saveContent(engine, stage, article, filename, content)

```typescript
async function saveContent(
  engine: PipelineEngine,
  stage: string,
  article: string,
  filename: string,
  content: string,
): Promise<void> {
  await engine.writeProjectFile(stage, article, filename, content);
  await engine.metadata.writeMeta(stage, article, {
    status: stage === "02_drafts" ? "drafted" : "master",
    updated_at: new Date().toISOString(),
  });
}
```

## 6. Parameter Validation

| Parameter | Type   | Required | Validation Rule                    | Error on Violation |
|-----------|--------|----------|------------------------------------|--------------------|
| `article` | string | Yes      | Non-empty after sanitizePath()     | `Error("Article name is required")` |
| Article exists | N/A | Yes    | Must exist in 02_drafts or 03_master | `Error("Article '{name}' not found in 02_drafts or 03_master")` |
| User feedback | string | Yes  | Non-empty (after trim)             | "Please enter feedback or a command." (loop continues) |
| `/save` | command | N/A      | Only when latestContent is non-empty | Always valid; saves even if no turns completed |
| `/quit` | command | N/A      | Always valid                       | Exits without saving |

## 7. Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| Article exists in both 02_drafts and 03_master | Prefer 02_drafts (earlier stage) |
| User types `/save` without making changes | Save current content as-is (idempotent) |
| User types `/quit` after making changes | Discard changes, warn user: "Unsaved changes will be lost. Are you sure? (y/n)" |
| LLM returns empty content on a turn | Keep previous content, print warning |
| LLM returns error on a turn | Print error, let user try again (don't break loop) |
| Session from different adapter | Archive old session, start fresh, print warning |
| stdin is not a TTY (piped input) | Read all lines from stdin as a single feedback, execute one turn, save, exit |
| Ctrl+C during prompt | Graceful exit via SIGINT handler, do NOT save unsaved changes |
| Very long draft (>100K chars) | Content included in prompt as-is; may hit LLM context limits; error handled gracefully |

## 8. Error Handling

| Error Condition | Error Type | Message | Recovery |
|-----------------|-----------|---------|----------|
| Article not found | Error | "Article '{name}' not found in 02_drafts or 03_master" | User creates/moves article |
| Adapter creation failure | AdapterNotInstalledError | "{name} CLI is not installed" | User installs CLI |
| Auth error during refinement | AdapterAuthError | "{name} requires authentication" | Break loop, user runs login |
| Timeout during refinement | AdapterTimeoutError | "Timed out after {n}s" | User retries or increases timeout |
| File write failure on save | Error | "Failed to save draft: {reason}" | Check disk space/permissions |
| Session save failure | Error | "Warning: Failed to save session: {reason}" | Continue (session is not critical) |

## 9. Test Scenarios

### Unit Tests (`commands/__tests__/refine.test.ts`)

1. `refineCommand()` throws when article doesn't exist in drafts or master
2. `refineCommand()` locates article in 02_drafts when it exists there
3. `refineCommand()` locates article in 03_master when not in 02_drafts
4. `refineCommand()` resumes existing session when session file exists
5. `refineCommand()` starts new session when no session file exists
6. `refineCommand()` archives and starts fresh when adapter mismatch
7. `/save` command writes content to draft file and exits
8. `/quit` command exits without writing
9. `/status` command displays adapter, session, and turn count
10. `/diff` command shows character count delta
11. Empty feedback line prompts user again
12. Successful LLM turn updates content and saves session
13. Failed LLM turn prints error and continues loop
14. Auth error breaks the loop with instruction to login
15. `buildRefinePrompt()` includes skill content when skills are available
16. `buildRefinePrompt()` includes current content and user feedback
17. Non-TTY stdin: reads all input, executes one turn, saves, exits

### Integration Tests

18. Full refine loop with mock adapter: send 2 feedbacks, then /save
19. Session persists across two separate refineCommand() calls
20. Refine with adapter switch: first session with claude, second with gemini

### Mock Strategy

- Mock `AdapterFactory.create()` to return a mock adapter
- Mock adapter's `execute()` to return controlled AdapterResult
- Mock readline by providing predetermined input sequences
- Mock SessionManager with in-memory storage
- Use temp directories for PipelineEngine file operations

## 10. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `node:readline` | Node built-in | Interactive user input |
| `chalk` | npm dependency | Colored output |
| `core/pipeline.ts` | Imports from | PipelineEngine for file operations |
| `core/config.ts` | Imports from | ConfigManager for adapter settings |
| `llm/factory.ts` | Imports from | AdapterFactory for adapter creation |
| `llm/session.ts` | Imports from | SessionManager for session CRUD |
| `llm/skills.ts` | Imports from | SkillResolver for skill content |
| `llm/types.ts` | Imports from | CLIAdapter, AdapterResult interfaces |
| `utils/path.ts` | Imports from | sanitizePath() |

---

*SRS Traceability: This command extends US-003 (AI-powered adaptation) and US-001 (first-time pipeline run) by adding iterative refinement capability. It supports NFR-PERF-002 (progress indication via turn counter) and NFR-REL-001 (no data loss -- changes only saved on explicit /save).*
