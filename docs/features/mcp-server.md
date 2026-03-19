# Feature Spec: MCP Server Integration

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Component**| MCP Server                                 |
| **Directory**| `src/mcp/`                                 |
| **Priority** | P2                                         |
| **SRS Refs** | FR-MCP-001 through FR-MCP-005              |
| **NFR Refs** | NFR-SEC-003, NFR-COMPAT-003                |

---

## 1. Purpose and Scope

The MCP (Model Context Protocol) server exposes all reachforge pipeline operations as callable tools for AI agents. It uses `apcore-mcp` as the transport layer and adds Zod-validated tool definitions with descriptive schemas so that AI agents (Claude Desktop, etc.) can discover and invoke pipeline operations programmatically.

The MCP server provides the exact same functionality as the CLI but through the MCP protocol. This means AI agents operate the same pipeline, produce the same filesystem artifacts, and follow the same validation rules as a human user.

## 2. Files

| File | Responsibility | Max Lines |
|------|---------------|-----------|
| `mcp/tools.ts` | MCP tool definitions with Zod schemas | 150 |
| `mcp/server.ts` | MCP server setup, lifecycle, tool registration | 80 |

## 3. TypeScript Interfaces

```typescript
// mcp/tools.ts

import { z } from 'zod';

export interface McpToolDefinition {
  name: string;              // Tool name (e.g., 'reachforge.status')
  description: string;       // Human/AI-readable description
  inputSchema: z.ZodSchema;  // Zod schema for input validation
  handler: (input: unknown) => Promise<unknown>;  // Execution function
}

// mcp/server.ts

export interface McpServerConfig {
  name: string;              // 'reachforge'
  version: string;           // Package version
  transport: 'stdio' | 'sse';
  port: number;              // Port for SSE transport (default 8000)
  tools: McpToolDefinition[];
}
```

## 4. Tool Definitions

### reachforge.status

```typescript
{
  name: 'reachforge.status',
  description: 'Get the current state of the content pipeline. Returns item counts and project names for each of the 6 stages (inbox, drafts, master, adapted, scheduled, sent), plus items due for publishing today.',
  inputSchema: z.object({}),
  handler: async () => {
    // Calls pipeline.getStatus()
    // Returns PipelineStatus
  },
}
```

**Return type:**
```typescript
{
  stages: {
    "01_inbox": { count: 2, items: ["idea-1", "idea-2"] },
    "02_drafts": { count: 1, items: ["my-article"] },
    // ... all 6 stages
  },
  totalProjects: 5,
  dueToday: ["2026-03-14-my-article"]
}
```

### reachforge.draft

```typescript
{
  name: 'reachforge.draft',
  description: 'Generate an AI-powered long-form article draft from a source in the 01_inbox directory. The source can be a markdown file or a directory containing markdown/text files.',
  inputSchema: z.object({
    source: z.string()
      .min(1, 'Source name is required')
      .regex(/^[a-zA-Z0-9._-]+$/, 'Source name must contain only alphanumeric characters, dots, hyphens, and underscores')
      .describe('Filename or directory name in 01_inbox to use as source material'),
  }),
  handler: async (input) => {
    // Validates input via schema
    // Calls draft command logic
    // Returns { name, path }
  },
}
```

**Return type:** `{ name: string, path: string }`

### reachforge.adapt

```typescript
{
  name: 'reachforge.adapt',
  description: 'Generate platform-specific content versions from a master article in 03_master. Creates adapted versions for each target platform (X threads, Dev.to articles, etc.) in 04_adapted.',
  inputSchema: z.object({
    article: z.string()
      .min(1, 'Article name is required')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Article name must contain only alphanumeric characters, hyphens, and underscores')
      .describe('Project name in 03_master'),
    platforms: z.string()
      .regex(/^[a-z,]+$/, 'Platforms must be comma-separated lowercase identifiers (e.g., "x,devto")')
      .optional()
      .describe('Comma-separated platform IDs to adapt for. If omitted, adapts for all configured platforms.'),
    force: z.boolean()
      .default(false)
      .describe('If true, overwrite existing platform adaptation files'),
  }),
  handler: async (input) => {
    // Validates input
    // Calls adapt command logic
    // Returns { article, path, adaptedPlatforms }
  },
}
```

**Return type:** `{ article: string, path: string, adaptedPlatforms: string[] }`

### reachforge.schedule

```typescript
{
  name: 'reachforge.schedule',
  description: 'Schedule an adapted article for publishing on a specific date. Moves the project from 04_adapted to 05_scheduled with a date prefix.',
  inputSchema: z.object({
    article: z.string()
      .min(1, 'Article name is required')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Article name must contain only alphanumeric characters, hyphens, and underscores')
      .describe('Project name in 04_adapted'),
    date: z.string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be in YYYY-MM-DD format')
      .describe('Target publication date in YYYY-MM-DD format'),
  }),
  handler: async (input) => {
    // Validates input (including calendar date validation)
    // Calls schedule command logic
    // Returns { scheduled_name, path }
  },
}
```

**Return type:** `{ scheduled_name: string, path: string }`

### reachforge.publish

```typescript
{
  name: 'reachforge.publish',
  description: 'Publish all scheduled content that is due (publish date <= today) to configured platform providers. Creates receipt.yaml with results and moves successful projects to 06_sent.',
  inputSchema: z.object({
    publishLive: z.boolean()
      .default(false)
      .describe('If true, publish as live/visible content on platforms that support draft mode (e.g., Dev.to). Default is false (publish as draft).'),
  }),
  handler: async (input) => {
    // Validates input
    // Calls publish command logic
    // Returns array of publish results
  },
}
```

**Return type:** `Array<{ item: string, results: PublishResult[] }>`

## 5. Logic Steps

### Server Setup (mcp/server.ts)

1. Create `McpServerConfig` from command options and context:
   ```typescript
   const config: McpServerConfig = {
     name: 'reachforge',
     version: packageVersion,
     transport: options.transport,
     port: options.port,
     tools: createToolDefinitions(commandContext),
   };
   ```
2. Register each tool with apcore:
   ```typescript
   for (const tool of config.tools) {
     apcore.register(`reachforge.${tool.name}`, {
       execute: async (inputs: unknown) => {
         // 1. Validate inputs via Zod schema
         const parseResult = tool.inputSchema.safeParse(inputs);
         if (!parseResult.success) {
           return {
             error: {
               code: 'VALIDATION_ERROR',
               message: parseResult.error.issues.map(i => i.message).join('; '),
             },
           };
         }
         // 2. Execute handler with validated input
         try {
           return await tool.handler(parseResult.data);
         } catch (err) {
           return {
             error: {
               code: err instanceof ReachforgeError ? err.code : 'INTERNAL_ERROR',
               message: err.message,
             },
           };
         }
       },
     });
   }
   ```
3. Call `serve(apcore, config)` from `apcore-mcp` to start the server
4. If transport is `sse`: bind to `127.0.0.1` only (NFR-SEC-003 — no external access)

### Input Validation Flow (NFR-SEC-003)

For every tool invocation:
1. Receive JSON-RPC `tools/call` request from MCP client
2. Extract `name` and `arguments` from request
3. Look up tool by name in registry
4. Parse `arguments` through tool's Zod schema via `safeParse()`
5. If validation fails:
   a. Return MCP error response with code `VALIDATION_ERROR`
   b. Include Zod issue messages in error description
   c. Do NOT execute any pipeline operation
6. If validation passes: proceed to handler execution

## 6. Error Handling

| Error Condition | MCP Response | Code |
|----------------|-------------|------|
| Missing required parameter | `{ error: { code: "VALIDATION_ERROR", message: "Source name is required" } }` | VALIDATION_ERROR |
| Invalid parameter format | `{ error: { code: "VALIDATION_ERROR", message: "Article name must contain only..." } }` | VALIDATION_ERROR |
| Malformed JSON-RPC | Protocol-level error (handled by apcore-mcp) | -32700 |
| Unknown tool name | Protocol-level error (handled by apcore-mcp) | -32601 |
| API key not configured | `{ error: { code: "LLM_API_KEY_ERROR", message: "Gemini API key is not configured..." } }` | LLM_API_KEY_ERROR |
| Project not found | `{ error: { code: "PROJECT_NOT_FOUND", message: "Project 'x' not found in 03_master." } }` | PROJECT_NOT_FOUND |
| LLM API failure | `{ error: { code: "LLM_API_ERROR", message: "..." } }` | LLM_API_ERROR |
| Platform publish failure | Returned in results array, not as top-level error | N/A |
| Internal error | `{ error: { code: "INTERNAL_ERROR", message: "..." } }` | INTERNAL_ERROR |

MCP error responses never include API keys, file system absolute paths outside the working directory, or stack traces.

## 7. Test Scenarios

### Tool Registration Tests

1. Server registers exactly 5 tools (status, draft, adapt, schedule, publish)
2. Each tool has a non-empty name, description, and inputSchema
3. Tool names follow the `reachforge.<command>` pattern

### Input Validation Tests

4. `reachforge.draft` with empty source returns VALIDATION_ERROR
5. `reachforge.draft` with source containing slashes returns VALIDATION_ERROR
6. `reachforge.adapt` with empty article returns VALIDATION_ERROR
7. `reachforge.adapt` with invalid platforms format returns VALIDATION_ERROR
8. `reachforge.schedule` with invalid date format returns VALIDATION_ERROR
9. `reachforge.schedule` with impossible date (Feb 30) returns VALIDATION_ERROR
10. `reachforge.publish` with non-boolean publishLive returns VALIDATION_ERROR
11. Valid inputs pass validation and reach the handler

### Handler Execution Tests

12. `reachforge.status` tool returns PipelineStatus object
13. `reachforge.draft` tool creates draft files and returns result
14. `reachforge.adapt` tool creates adapted files and returns result
15. `reachforge.schedule` tool moves project and returns result
16. `reachforge.publish` tool publishes due items and returns results

### Error Propagation Tests

17. LLM API key error propagated as error response (not crash)
18. Project not found error propagated correctly
19. Internal errors do not expose stack traces

### Transport Tests

20. Stdio transport communicates via stdin/stdout
21. SSE transport binds to 127.0.0.1 only (not 0.0.0.0)
22. SSE transport uses configured port number

## 8. Dependencies

| Dependency | Direction | Purpose |
|-----------|-----------|---------|
| `apcore-js` | npm dependency | Module registration |
| `apcore-mcp` | npm dependency | MCP server infrastructure |
| `zod` | npm dependency | Input schema validation |
| `commands/*` | Shares logic with | Same handlers as CLI commands |
| `types/schemas.ts` | Imports from | Shared Zod schemas |
| `types/errors.ts` | Imports from | Error type classification |

---

*SRS Traceability: FR-MCP-001 (MCP server start), FR-MCP-002 (5 tools exposed), FR-MCP-003 (Zod input validation), FR-MCP-004 (stdio + SSE transport), FR-MCP-005 (Claude Desktop compatibility), NFR-SEC-003 (input validation before execution), NFR-COMPAT-003 (MCP spec conformance via apcore-mcp).*
