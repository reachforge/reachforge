# Implementation Plan: Refine Command

| Field | Value |
|-------|-------|
| **Feature** | Refine Command |
| **Spec** | `docs/features/refine-command.md` |
| **Status** | Planned |
| **Tasks** | 4 |
| **Test Count** | 23 |

## Dependency Graph

```
T01 (Helper functions)
 └── T02 (Article lookup + session load)
      └── T03 (Interactive loop + slash commands)
           └── T04 (CLI registration + non-TTY)
```

## Tasks

### T01: Helper functions
- **Files**: `src/commands/refine.ts`
- `buildRefinePrompt()` — combine skills + content + feedback
- `promptUser()` — readline wrapper
- `printStatus()`, `printDiff()`, `printContentPreview()` — display helpers
- `saveContent()` — write to pipeline stage via engine
- **Tests**: 8

### T02: refineCommand core (article lookup + session)
- **Files**: `src/commands/refine.ts`
- Locate article in 02_drafts or 03_master (prefer drafts)
- Create adapter via AdapterFactory
- Load session, detect adapter mismatch, archive old session
- **Tests**: 6

### T03: Interactive loop + slash commands
- **Files**: `src/commands/refine.ts`
- Readline-based while loop
- `/save` — write content + exit
- `/quit` — exit without saving
- `/status` — show session info
- `/diff` — show delta from original
- Send feedback to adapter, update state, save session per turn
- Handle auth error (break), transient errors (continue)
- **Tests**: 8

### T04: CLI registration + non-TTY
- **Files**: `src/index.ts`
- Register `aphype refine <article>` in Commander.js
- Non-TTY mode: read all stdin, one turn, save, exit
- **Tests**: 1

## Mock Strategy

- Mock `AdapterFactory.create()` to return mock adapter
- Mock adapter `execute()` to return controlled AdapterResult
- Mock readline with predetermined input sequences (array of strings)
- Mock SessionManager with in-memory store (or use real with temp dir)
- Use temp directories for PipelineEngine

## Notes

- This command depends on all three prior features: CLI Adapter Core, Session Manager, Skill Resolver
- The interactive loop is the most complex part — mocking readline properly is key
- Non-TTY handling enables CI/scripted usage: `echo "make it shorter" | aphype refine my-article`
