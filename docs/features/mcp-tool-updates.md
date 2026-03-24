# MCP Tool Updates

> Feature spec for code-forge implementation planning.
> Source: extracted from docs/multi-article/tech-design.md §8
> Created: 2026-03-24

| Field | Value |
|-------|-------|
| Component | mcp-tool-updates |
| Priority | P1 |
| SRS Refs | — |
| Tech Design | §8.1 — mcp-tool-updates |
| Depends On | command-updates |
| Blocks | — |

## Purpose

Update MCP tool schemas (Zod + JSON Schema) and tool descriptions to reflect the multi-article model. Ensure LLM agents can discover and use the article parameter correctly.

## Scope

**Included:**
- Update `GoToolSchema` to add optional `name` field
- Update `StatusToolSchema` to add optional `article` field
- Update `RollbackToolSchema` to rename `project` → `article`
- Update tool descriptions in `TOOL_METADATA`
- Ensure JSON Schema output reflects changes

**Excluded:**
- MCP transport/server changes
- APCore registration changes (handled automatically)

## Core Responsibilities

1. **Schema updates** — add/rename fields in Zod tool schemas
2. **Description updates** — reflect multi-article semantics in tool descriptions
3. **JSON Schema generation** — ensure `zodToJsonSchema` produces correct output

## Key Behaviors

### Schema Changes

```typescript
// GoToolSchema — add name
export const GoToolSchema = z.object({
  prompt: z.string().min(1).describe('Free-text prompt describing the content to create'),
  name: z.string().optional().describe('Explicit article name. If omitted, auto-generated from prompt as a URL-safe slug'),
  schedule: z.string().optional().describe('Schedule date/time (YYYY-MM-DD or YYYY-MM-DDTHH:MM). Omit for immediate publish'),
  dryRun: z.boolean().optional().describe('If true, skip actual publish step'),
  draft: z.boolean().optional().describe('If true, publish as draft on supporting platforms'),
});

// StatusToolSchema — add article filter
export const StatusToolSchema = z.object({
  article: z.string().optional().describe('Filter status to a specific article. Omit to show all articles'),
});

// RollbackToolSchema — rename project to article
export const RollbackToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article to move back one pipeline stage'),
});
```

### TOOL_METADATA Description Updates

| Tool | Updated Description |
|------|-------------------|
| `reach.status` | "Show pipeline dashboard: per-article status across all stages, and articles due for publishing. Optionally filter to a single article." |
| `reach.draft` | "Generate an AI draft for a specific article from 01_inbox. Creates {article}.md in 02_drafts." |
| `reach.approve` | "Promote a specific article's draft from 02_drafts to 03_master." |
| `reach.adapt` | "Generate platform-specific versions from a master article. Creates {article}.{platform}.md files in 04_adapted." |
| `reach.schedule` | "Schedule a specific article for publishing. Stores schedule time in meta.yaml and moves platform files to 05_scheduled." |
| `reach.publish` | "Publish all articles in 05_scheduled that are due (schedule time <= now). Results recorded in meta.yaml per article per platform." |
| `reach.go` | "Full auto pipeline: creates article from prompt, drafts, approves, adapts, schedules, and publishes. Use 'name' param for explicit article name, or let it auto-generate from prompt." |
| `reach.rollback` | "Move a specific article back one pipeline stage." |

### Legacy Export Update

Update `MCP_TOOL_DEFINITIONS` mapping to use new schemas (GoToolSchema with name, RollbackToolSchema with article).

## Constraints

- **JSON Schema compatibility**: `zodToJsonSchema` output must be valid OpenAPI 3 schema
- **Tool IDs unchanged**: `reach.status`, `reach.go`, etc. — no renaming of tool IDs
- **Backward compat for agents**: Adding optional `name` field to go is non-breaking; renaming `project` → `article` in rollback is breaking but acceptable

## Acceptance Criteria

| AC-ID | Criterion | Verification Method |
|-------|-----------|---------------------|
| AC-012 | MCP tool schemas include article/name fields | Unit test: validate schema output |
| AC-MCP-001 | `GoToolSchema` has optional `name` field | Unit test |
| AC-MCP-002 | `RollbackToolSchema` uses `article` not `project` | Unit test |
| AC-MCP-003 | `StatusToolSchema` has optional `article` filter | Unit test |
| AC-MCP-004 | JSON Schema generation produces valid output for all tools | Unit test |

## Error Handling

- Invalid tool input: Zod validation errors propagated through APCore

## File Structure

```
src/
└── mcp/
    └── tools.ts
```

## Test Module

**Test file**: `src/mcp/tools.test.ts`

**Test scope**:
- **Unit**: Verify each schema accepts valid input and rejects invalid input; verify JSON Schema output structure
- **Fixtures**: None needed
