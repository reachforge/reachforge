import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// --- Zod Schemas (used for MCP input validation and JSON Schema generation) ---

export const StatusToolSchema = z.object({
  article: z.string().optional().describe('Filter status to a specific article. Omit to show all articles in the project'),
});

export const DraftToolSchema = z.object({
  source: z.string().min(1).describe('Name of the file or directory in 01_inbox to draft from (e.g., "my-idea.md" or "my-idea")'),
});

export const AdaptToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 03_master to adapt'),
  platforms: z.string().optional().describe('Comma-separated platform list (e.g., "x,devto,hashnode"). Defaults to project.yaml platforms or x,wechat,zhihu'),
  force: z.boolean().optional().describe('If true, overwrite existing platform versions'),
});

export const ApproveToolSchema = z.object({
  article: z.string().min(1).describe('Name of the draft in 02_drafts to promote to 03_master'),
});

export const ScheduleToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 04_adapted to schedule'),
  date: z.string().optional().describe('Publish date/time: YYYY-MM-DD, YYYY-MM-DDTHH:MM, or YYYY-MM-DDTHH:MM:SS. Defaults to today (immediate on next publish)'),
});

export const PublishToolSchema = z.object({
  dryRun: z.boolean().optional().describe('If true, preview what would be published without actually sending to platforms'),
});

export const RollbackToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article to move back one pipeline stage'),
});

export const RefineToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 02_drafts or 03_master to refine'),
  feedback: z.string().min(1).describe('The feedback or instruction for the LLM to apply to the article'),
});

export const AssetAddToolSchema = z.object({
  file: z.string().min(1).describe('Path to the media file to register into the asset library'),
  subdir: z.enum(['images', 'videos', 'audio']).optional().describe('Asset subdirectory. Auto-detected from file extension if omitted'),
});

export const AssetListToolSchema = z.object({
  subdir: z.enum(['images', 'videos', 'audio']).optional().describe('Filter results by asset type'),
});

export const GoToolSchema = z.object({
  prompt: z.string().min(1).describe('Free-text prompt describing the content to create (e.g., "write about apcore framework")'),
  name: z.string().optional().describe('Explicit article name. If omitted, auto-generated from prompt as a URL-safe slug'),
  schedule: z.string().optional().describe('If set, schedule for this date/time instead of publishing immediately. Format: YYYY-MM-DD or YYYY-MM-DDTHH:MM'),
  dryRun: z.boolean().optional().describe('If true, run the full pipeline but skip the actual publish step'),
  draft: z.boolean().optional().describe('If true, publish as draft on platforms that support it'),
});

export const AnalyticsToolSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date filter in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date filter in YYYY-MM-DD format'),
});

// --- Tool Definitions (descriptions + schemas for APCore registration) ---
// These are used by apcore.register() so that apcore-mcp can expose them to LLMs
// with proper descriptions and input schemas.

function jsonSchema(zodSchema: z.ZodType): Record<string, unknown> {
  const schema = zodToJsonSchema(zodSchema, { target: 'openApi3' });
  // Remove top-level $schema key — APCore expects a plain JSON Schema object
  const { $schema, ...rest } = schema as Record<string, unknown>;
  return rest;
}

/**
 * Tool metadata keyed by APCore module ID.
 * Each entry provides `description` and `inputSchema` for LLM discovery.
 */
export const TOOL_METADATA: Record<string, { description: string; inputSchema: Record<string, unknown> }> = {
  'reach.status': {
    description: 'Show pipeline dashboard: per-article status across all stages (01_inbox through 06_sent), and articles due for publishing. Optionally filter to a single article. Call this first to understand the current state.',
    inputSchema: jsonSchema(StatusToolSchema),
  },
  'reach.draft': {
    description: 'Generate an AI draft for a specific article from 01_inbox. The source can be a file (e.g., "idea.md") or a directory. Creates {article}.md in 02_drafts. This is typically the first step after placing content in the inbox.',
    inputSchema: jsonSchema(DraftToolSchema),
  },
  'reach.approve': {
    description: 'Promote a specific article from 02_drafts to 03_master. This is the editorial sign-off step — call this after reviewing the draft, before adapting for platforms.',
    inputSchema: jsonSchema(ApproveToolSchema),
  },
  'reach.adapt': {
    description: 'Generate platform-specific versions from a master article in 03_master. Creates {article}.{platform}.md files in 04_adapted (e.g., teaser.x.md, teaser.devto.md). Call this after reach.approve, before reach.schedule.',
    inputSchema: jsonSchema(AdaptToolSchema),
  },
  'reach.schedule': {
    description: 'Schedule a specific article for publishing. Moves platform files from 04_adapted to 05_scheduled and stores the schedule time in meta.yaml. Omit the date to schedule for immediate publishing.',
    inputSchema: jsonSchema(ScheduleToolSchema),
  },
  'reach.publish': {
    description: 'Publish all articles in 05_scheduled that are due (schedule time <= now). Sends content to configured platform APIs, records results in meta.yaml per article per platform, and moves successful articles to 06_sent.',
    inputSchema: jsonSchema(PublishToolSchema),
  },
  'reach.go': {
    description: 'Full auto pipeline: creates article from prompt, drafts via AI, approves, adapts for all configured platforms, schedules, and publishes. Use "name" param for explicit article name, or let it auto-generate from prompt. Use "schedule" to defer publishing.',
    inputSchema: jsonSchema(GoToolSchema),
  },
  'reach.refine': {
    description: 'Refine an existing draft or master article by applying feedback via AI. Performs a single non-interactive refinement turn: sends the feedback to the LLM, saves the updated article, and returns. Use this to iteratively improve content before approving.',
    inputSchema: jsonSchema(RefineToolSchema),
  },
  'reach.rollback': {
    description: 'Move a specific article back one pipeline stage (e.g., from 05_scheduled back to 04_adapted). Useful for undoing a schedule or re-adapting content.',
    inputSchema: jsonSchema(RollbackToolSchema),
  },
  'reach.asset.add': {
    description: 'Register a media file (image, video, or audio) into the project shared asset library. The file is copied into assets/{subdir}/ and can be referenced in articles using @assets/ prefix.',
    inputSchema: jsonSchema(AssetAddToolSchema),
  },
  'reach.asset.list': {
    description: 'List all registered assets in the project asset library, optionally filtered by type (images, videos, audio). Returns file names and @assets/ reference paths.',
    inputSchema: jsonSchema(AssetListToolSchema),
  },
  'reach.analytics': {
    description: 'Show publishing analytics: per-platform success rates aggregated from meta.yaml publish results. Optionally filter by date range.',
    inputSchema: jsonSchema(AnalyticsToolSchema),
  },
};

// Legacy export for backward compatibility with tests
export const MCP_TOOL_DEFINITIONS = Object.entries(TOOL_METADATA).map(([moduleId, meta]) => ({
  name: moduleId.replace(/\./g, '_'),
  description: meta.description,
  schema: (() => {
    const schemaMap: Record<string, z.ZodType> = {
      'reach.status': StatusToolSchema,
      'reach.draft': DraftToolSchema,
      'reach.approve': ApproveToolSchema,
      'reach.adapt': AdaptToolSchema,
      'reach.schedule': ScheduleToolSchema,
      'reach.publish': PublishToolSchema,
      'reach.go': GoToolSchema,
      'reach.refine': RefineToolSchema,
      'reach.rollback': RollbackToolSchema,
      'reach.asset.add': AssetAddToolSchema,
      'reach.asset.list': AssetListToolSchema,
      'reach.analytics': AnalyticsToolSchema,
    };
    return schemaMap[moduleId];
  })(),
}));
