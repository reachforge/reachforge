# Feature Spec: Watcher Daemon

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| Background Watcher Mode                    |
| **Directory**| `src/commands/watch.ts`                    |
| **Priority** | P1                                         |
| **SRS Refs** | FR-WATCH-001 through FR-WATCH-006          |

---

## 1. Purpose and Scope

The watcher daemon is a long-running background process that periodically checks `05_scheduled` for due items and auto-publishes them. It reuses the same publish logic as `reachforge publish` but runs continuously with configurable intervals, signal handling, and file logging.

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `commands/watch.ts` | Watch command handler with daemon logic | 100 |
| `utils/logger.ts` | File logging for watcher (and general use) | 80 |

## 3. TypeScript Interfaces

```typescript
// utils/logger.ts

export class Logger {
  private logFilePath: string;

  constructor(logFilePath: string);

  /**
   * Writes a log entry to both stdout and the log file.
   * Format: [ISO8601_TIMESTAMP] LEVEL: message
   */
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;

  /**
   * Writes a structured log entry for watcher check cycles.
   */
  logCheckCycle(cycle: {
    timestamp: string;
    dueItemsFound: number;
    publishResults: Array<{ item: string; platform: string; status: string }>;
  }): void;
}

// Watch command types
export interface WatchState {
  isRunning: boolean;
  shuttingDown: boolean;
  currentPublishPromise: Promise<void> | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  cycleCount: number;
}
```

## 4. Method Signatures

```typescript
// commands/watch.ts

export function registerWatchCommand(program: Command, ctx: CommandContext): void;

// Internal functions (not exported)
async function startWatcher(
  ctx: CommandContext,
  intervalMinutes: number,
  logger: Logger
): Promise<void>;

async function tick(
  ctx: CommandContext,
  state: WatchState,
  logger: Logger
): Promise<void>;

function setupSignalHandlers(state: WatchState, logger: Logger): void;
```

## 5. Logic Steps

### startWatcher(ctx, intervalMinutes, logger)

1. Initialize `WatchState`:
   ```typescript
   const state: WatchState = {
     isRunning: true,
     shuttingDown: false,
     currentPublishPromise: null,
     intervalHandle: null,
     cycleCount: 0,
   };
   ```
2. Call `setupSignalHandlers(state, logger)` to register SIGTERM/SIGINT handlers
3. Log: "[timestamp] INFO: reachforge watcher started. Check interval: {intervalMinutes} minutes."
4. Execute first `tick()` immediately
5. Set interval: `state.intervalHandle = setInterval(() => tick(ctx, state, logger), intervalMinutes * 60 * 1000)`
6. Block indefinitely (watcher runs until signal received)

### tick(ctx, state, logger)

1. If `state.shuttingDown`: skip this cycle, return
2. Increment `state.cycleCount`
3. Log: "[timestamp] INFO: Check cycle #{cycleCount} starting."
4. Call `ctx.pipeline.initPipeline()`
5. Call `ctx.pipeline.findDueProjects()` to get due items
6. If no due items:
   a. Log: "[timestamp] INFO: No items due. Next check in {interval} minutes."
   b. Call `logger.logCheckCycle({ timestamp, dueItemsFound: 0, publishResults: [] })`
   c. Return
7. Log: "[timestamp] INFO: Found {count} due items."
8. For each due project:
   a. Read `adapted_platforms` from meta.yaml
   b. Get matching providers
   c. Set `state.currentPublishPromise` to the publish operation
   d. Await `ctx.pipeline.publishProject(project, providers, { publishLive: false })`
   e. Set `state.currentPublishPromise = null`
   f. For each result:
      - Success: log "[timestamp] INFO: Published {item} to {platform}: {url}"
      - Failed: log "[timestamp] WARN: Failed {item} on {platform}: {error}"
9. Call `logger.logCheckCycle()` with all results
10. Log: "[timestamp] INFO: Check cycle #{cycleCount} complete. Next check in {interval} minutes."

### setupSignalHandlers(state, logger)

1. Register handler for `SIGTERM`:
   ```typescript
   process.on('SIGTERM', async () => {
     logger.info('Received SIGTERM. Shutting down gracefully...');
     state.shuttingDown = true;
     if (state.currentPublishPromise) {
       logger.info('Waiting for in-progress publish to complete...');
       await state.currentPublishPromise;
     }
     if (state.intervalHandle) {
       clearInterval(state.intervalHandle);
     }
     logger.info('Watcher stopped.');
     process.exit(0);
   });
   ```
2. Register identical handler for `SIGINT`
3. Both handlers:
   a. Set `shuttingDown = true` to prevent new cycles from starting
   b. Wait for `currentPublishPromise` to resolve if one is in progress
   c. Clear the interval timer
   d. Exit with code 0

## 6. Log File Format

Log file: `{workingDir}/reachforge-watcher.log`

Each entry is one line with format:
```
[2026-03-14T10:00:00.000Z] INFO: reachforge watcher started. Check interval: 60 minutes.
[2026-03-14T11:00:00.000Z] INFO: Check cycle #1 starting.
[2026-03-14T11:00:00.050Z] INFO: Found 2 due items.
[2026-03-14T11:00:05.123Z] INFO: Published 2026-03-14-my-article to devto: https://dev.to/user/post-123
[2026-03-14T11:00:06.789Z] WARN: Failed 2026-03-14-my-article on x: Postiz API rate limit exceeded after 3 attempts.
[2026-03-14T11:00:06.800Z] INFO: Check cycle #1 complete. Next check in 60 minutes.
```

Structured cycle entries (written by `logCheckCycle`):
```
[2026-03-14T11:00:06.800Z] CYCLE: {"cycle":1,"timestamp":"2026-03-14T11:00:00.000Z","dueItemsFound":2,"publishResults":[{"item":"2026-03-14-my-article","platform":"devto","status":"success"},{"item":"2026-03-14-my-article","platform":"x","status":"failed"}]}
```

## 7. Error Handling

| Error Condition | Behavior | Recovery |
|----------------|----------|----------|
| Filesystem read error during check | Log error, skip this cycle, continue to next interval | Automatic on next cycle |
| Publish fails for one project | Log failure, continue with remaining due projects | Project stays in 05_scheduled for next cycle |
| All publishes fail in a cycle | Log failures, cycle completes normally | Projects retry on next cycle |
| SIGTERM during active publish | Complete current publish, then exit 0 | Graceful shutdown |
| SIGINT (Ctrl+C) during idle | Exit immediately with code 0 | Clean exit |
| Log file write failure | Fall back to stdout-only logging | Non-fatal |
| Pipeline initialization failure | Log error, exit 1 | User fixes filesystem |

## 8. Test Scenarios

1. Watcher starts and logs startup message with configured interval
2. First tick runs immediately on startup (no initial delay)
3. Tick detects due items and invokes publish for each
4. Tick logs "No items due" when 05_scheduled is empty
5. Tick does not re-publish items already moved to 06_sent
6. SIGTERM handler waits for in-progress publish before exiting
7. SIGINT handler waits for in-progress publish before exiting
8. Shutdown sets `shuttingDown = true`, preventing new tick execution
9. Interval timer runs tick at configured interval (e.g., 30 minutes)
10. Log entries written to file with correct format and timestamps
11. Watcher continues running after a failed publish cycle
12. Watcher validates interval parameter: rejects 0, negative, >1440
13. Default interval is 60 minutes when no flag provided
14. Multiple due items processed sequentially within a single cycle

## 9. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `core/pipeline.ts` | Imports from | Pipeline engine for findDueProjects, publishProject |
| `providers/loader.ts` | Imports from | Load providers for publishing |
| `core/metadata.ts` | Imports from | Read project meta.yaml |
| `types/schemas.ts` | Imports from | WatchParamsSchema validation |
| `utils/logger.ts` | Imports from | File and stdout logging |
| `commands/publish.ts` | Shares logic with | Same publish flow |

---

*SRS Traceability: FR-WATCH-001 (periodic check for due items), FR-WATCH-002 (configurable interval), FR-WATCH-003 (invoke publish for due items), FR-WATCH-004 (no re-publish of sent items), FR-WATCH-005 (graceful SIGTERM/SIGINT shutdown), FR-WATCH-006 (log entries to file).*
