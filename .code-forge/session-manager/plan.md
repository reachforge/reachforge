# Implementation Plan: Session Manager

| Field | Value |
|-------|-------|
| **Feature** | Session Manager |
| **Spec** | `docs/features/session-manager.md` |
| **Status** | Planned |
| **Tasks** | 4 |
| **Test Count** | 26 |

## Dependency Graph

```
T01 (SessionData type + error)
 └── T02 (save, load, getSessionPath)
      └── T03 (delete, deleteAll, list)
           └── T04 (exports)
```

## Implementation Order

### T01: SessionData type & SessionValidationError
- **Files**: `src/llm/types.ts`, `src/types/errors.ts`, `src/types/index.ts`
- Add `SessionData` interface to `llm/types.ts`
- Add `SessionValidationError` to `types/errors.ts`
- Export from index files
- **Tests**: 2

### T02: SessionManager core (save, load, getSessionPath)
- **Files**: `src/llm/session.ts`
- `SessionDataSchema` Zod schema
- `save()` with atomic write (write .tmp → rename)
- `load()` with graceful null returns + warnings
- `getSessionPath()` path computation
- Constructor validates absolute projectDir
- **Tests**: 15

### T03: SessionManager delete, deleteAll, list
- **Files**: `src/llm/session.ts`
- `delete()` — remove file, no-op on ENOENT
- `deleteAll()` — rm -rf article session dir
- `list()` — readdir, load each, sort by lastUsedAt desc
- **Tests**: 8

### T04: Exports
- **Files**: `src/llm/index.ts`
- Export SessionManager, SessionData, SessionDataSchema, SessionValidationError
- **Tests**: 1

## Notes

- Single source file `src/llm/session.ts` (~180 lines max)
- Uses `node:fs/promises` directly (not fs-extra) since we only need basic operations
- Atomic writes prevent corruption during concurrent access
- All validation via Zod `SessionDataSchema`
- Cross-adapter mismatch handled at command level (not in SessionManager)
