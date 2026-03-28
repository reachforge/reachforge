# Implementation Plan: Migrate CLI to apcore-cli

## Overview

Replace hand-wired Commander.js CLI with apcore-cli's `createCli()` + `GroupedModuleGroup`. All commands are already registered as apcore modules via `apcore.register()` — the migration unifies CLI and MCP into a single registration path.

## Key Insight

Currently ReachForge has **dual registration**: each command is registered BOTH as an apcore module (`apcore.register()`) AND as a Commander.js command (`.command().action()`). The migration eliminates the Commander.js half — `GroupedModuleGroup` auto-generates CLI commands from the registry.

## Challenge

ReachForge commands have **custom CLI behaviors** not supported by `buildModuleCommand()`:
- `publish` has complex `isExternalFile` detection + engine-or-null logic
- `status` has workspace-wide `--all` mode
- `go` has a `<prompt>` positional argument
- `platforms` and `mcp` are non-module system commands
- `series.*` subcommands need project context
- Default action (no command) has interactive workspace init

**Solution**: Hybrid approach — use `createCli()` as base, auto-wire module commands via `GroupedModuleGroup`, keep a few custom commands for edge cases.

## Tasks

### Task 1: Restructure apcore.register() calls
**Files**: `src/index.ts`

Current `apcore.register()` calls already have the right `execute()` functions. But some need adjustments:
- All execute functions must handle errors internally (no Commander error handler)
- Remove `program.opts().json` references (not available in module context)
- Ensure all modules have proper `inputSchema` from TOOL_METADATA

The existing `apcore.register()` calls stay — they're the single source of truth now.

### Task 2: Replace Commander.js setup with createCli()
**Files**: `src/index.ts`

- Replace `new Command()` + manual `.command().option().action()` blocks
- Use `createCli(undefined, 'reach')` as base program
- Use `GroupedModuleGroup(apcore.registry, apcore.executor)` to auto-generate commands
- Keep custom commands ONLY for: `init`, `workspace`, `watch`, `mcp`, `platforms`, default action
- These 5 commands are not apcore modules (they don't have schema→execute pattern)

### Task 3: Handle CLI-specific behaviors
**Files**: `src/index.ts`

Some commands need CLI-specific logic that `buildModuleCommand()` doesn't handle:
- `publish`: `isExternalFile` detection — wrap in execute()
- `status --all`: workspace mode — handle inside execute()
- `go <prompt>`: positional arg — already in schema as `prompt` field
- `series.approve --outline/--detail`: boolean flags — already in schema

These are already handled in the `apcore.register()` execute functions. The auto-generated CLI will use schema-driven options.

### Task 4: Preserve help system
**Files**: `src/help.ts`, `src/index.ts`

- `configureGroupedHelp()` and `buildFullReference()` need to work with `createCli()` output
- `GroupedModuleGroup` auto-groups by dotted module IDs (reach.series.init → series init)
- Verify `--help` and `--help --all` still work

### Task 5: Update tests + verify
- MCP tool count test (may change if module list changes)
- All existing tests should pass (commands unchanged, only wiring changed)
- Manual smoke test: `reach --help`, `reach status`, `reach publish`

## Non-Changes

- `src/commands/*.ts` — NO changes (all command functions stay the same)
- `src/mcp/tools.ts` — NO changes (TOOL_METADATA used as inputSchema)
- `src/core/*` — NO changes
- `src/providers/*` — NO changes
- `src/help.ts` — minimal changes (works with Commander Program from createCli)

## File Changes Summary

| File | Change |
|------|--------|
| `src/index.ts` | Major rewrite: remove ~300 lines of .command().action(), use createCli + GroupedModuleGroup |
| `src/help.ts` | Minor: ensure works with createCli program |
| `package.json` | Already updated (apcore-cli ^0.3.0 added) |
