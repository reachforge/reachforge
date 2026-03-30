import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// --- Zod Schemas (used for MCP input validation and JSON Schema generation) ---

export const StatusToolSchema = z.object({
  article: z.string().optional().describe('Filter status to a specific article. Omit to show all articles in the project'),
});

export const DraftToolSchema = z.object({
  source: z.string().min(1).describe('Prompt text, file path, or directory to generate a draft from'),
  name: z.string().optional().describe('Explicit article name. If omitted, auto-generated from input'),
  cover: z.string().optional().describe('Cover image path or URL to store in meta.yaml for publish'),
});

export const AdaptToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 01_drafts to adapt'),
  platforms: z.string().optional().describe('Comma-separated platform list (e.g., "x,devto,hashnode"). Defaults to project.yaml platforms or x,wechat,zhihu'),
  lang: z.string().optional().describe('Override target language for all platforms (e.g., "en", "zh-CN", "ja"). Default: auto per platform'),
  force: z.boolean().optional().describe('If true, overwrite existing platform versions'),
});

export const ScheduleToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 02_adapted to schedule'),
  date: z.string().optional().describe('Publish date/time: YYYY-MM-DD, YYYY-MM-DDTHH:MM, or YYYY-MM-DDTHH:MM:SS. Defaults to today (immediate on next publish)'),
  clear: z.boolean().optional().describe('If true, unschedule the article (revert status to adapted, remove schedule date)'),
  dryRun: z.boolean().optional().describe('If true, preview what would be scheduled without applying changes'),
});

export const PublishToolSchema = z.object({
  article: z.string().optional().describe('Article name (pipeline) or file path (external). Omit to publish all due articles'),
  platforms: z.string().optional().describe('Comma-separated platform filter (e.g., "devto,hashnode"). Required for external files'),
  track: z.boolean().optional().describe('If true, track external file in pipeline (import to 02_adapted, then publish). Requires project context'),
  force: z.boolean().optional().describe('If true, publish even if article is scheduled for a future date'),
  dryRun: z.boolean().optional().describe('If true, preview what would be published without actually sending to platforms'),
  cover: z.string().optional().describe('Cover image path or URL. Uploaded to platform CDN at publish time'),
});

export const UpdateToolSchema = z.object({
  article: z.string().min(1).describe('Name of the published article to update on platforms'),
  platforms: z.string().optional().describe('Comma-separated platform filter. Default: all published platforms with article_id'),
  dryRun: z.boolean().optional().describe('If true, preview what would be updated without calling APIs'),
  force: z.boolean().optional().describe('If true, skip platforms without article_id instead of erroring'),
  cover: z.string().optional().describe('Cover image path or URL'),
});

export const RollbackToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article to move back one pipeline stage'),
});

export const RefreshToolSchema = z.object({
  article: z.string().min(1).describe('Name of the published or adapted article to copy back to 01_drafts for re-editing'),
});

export const RefineToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 01_drafts to refine'),
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
  cover: z.string().optional().describe('Cover image path or URL'),
});

// Series tools
export const SeriesInitToolSchema = z.object({
  topic: z.string().min(1).describe('Series topic or title'),
});

export const SeriesOutlineToolSchema = z.object({
  name: z.string().min(1).describe('Series name (slug from series.yaml filename)'),
});

export const SeriesApproveToolSchema = z.object({
  name: z.string().min(1).describe('Series name'),
  outline: z.boolean().optional().describe('Approve master outline'),
  detail: z.boolean().optional().describe('Approve per-article detail outlines'),
});

export const SeriesDetailToolSchema = z.object({
  name: z.string().min(1).describe('Series name'),
});

export const SeriesDraftToolSchema = z.object({
  name: z.string().min(1).describe('Series name'),
  all: z.boolean().optional().describe('Draft all unwritten articles sequentially'),
});

export const SeriesAdaptToolSchema = z.object({
  name: z.string().min(1).describe('Series name'),
  platforms: z.string().optional().describe('Comma-separated platform list'),
});

export const SeriesScheduleToolSchema = z.object({
  name: z.string().min(1).describe('Series name'),
  dryRun: z.boolean().optional().describe('Preview without applying'),
});

export const SeriesStatusToolSchema = z.object({
  name: z.string().min(1).describe('Series name'),
});

// System tools
export const NewProjectToolSchema = z.object({
  name: z.string().min(1).describe('Project name to create in the current workspace'),
});

export const InitToolSchema = z.object({
  path: z.string().optional().describe('Path to initialize workspace at (defaults to ~/.reach)'),
});

export const WorkspaceToolSchema = z.object({});

export const WatchToolSchema = z.object({
  interval: z.string().optional().describe('Check interval in minutes (min: 1, default: 60)'),
  all: z.boolean().optional().describe('Watch all projects in workspace'),
  list: z.boolean().optional().describe('List running watch daemons'),
  stop: z.string().optional().describe('Stop a running watch daemon for the given project'),
});

export const McpToolSchema = z.object({
  port: z.string().optional().describe('Port for SSE transport (default: 8000)'),
  transport: z.string().optional().describe('Transport type: stdio or sse (default: stdio)'),
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
    description: 'Show pipeline dashboard: per-article status across all stages (01_drafts, 02_adapted, 03_published), and articles due for publishing. Optionally filter to a single article. Call this first to understand the current state.',
    inputSchema: jsonSchema(StatusToolSchema),
  },
  'reach.draft': {
    description: 'Generate an AI draft from a prompt, file path, or directory. Creates {article}.md in 01_drafts. This is the first step in the pipeline.',
    inputSchema: jsonSchema(DraftToolSchema),
  },
  'reach.adapt': {
    description: 'Generate platform-specific versions from a draft in 01_drafts. Creates {article}.{platform}.md files in 02_adapted. Call this after reach.draft, before reach.publish.',
    inputSchema: jsonSchema(AdaptToolSchema),
  },
  'reach.schedule': {
    description: 'Schedule a specific article for publishing. Sets the schedule time in meta.yaml (files stay in 02_adapted). Omit the date to schedule for immediate publishing.',
    inputSchema: jsonSchema(ScheduleToolSchema),
  },
  'reach.publish': {
    description: 'Publish content to platforms. Three modes: (1) no article — publish all due scheduled articles from 02_adapted; (2) article name — publish a specific pipeline article with optional platform filter; (3) file path — publish an external file directly (requires platforms param). External files are sent without pipeline tracking by default; use track=true to record in meta.yaml.',
    inputSchema: jsonSchema(PublishToolSchema),
  },
  'reach.go': {
    description: 'Full auto pipeline: creates article from prompt, drafts via AI, adapts for all configured platforms, and publishes. Use "name" param for explicit article name, or let it auto-generate from prompt. Use "schedule" to defer publishing.',
    inputSchema: jsonSchema(GoToolSchema),
  },
  'reach.refine': {
    description: 'Refine an existing draft article by applying feedback via AI. Performs a single non-interactive refinement turn: sends the feedback to the LLM, saves the updated article, and returns. Use this to iteratively improve content before adapting.',
    inputSchema: jsonSchema(RefineToolSchema),
  },
  'reach.update': {
    description: 'Update an already-published article on its platforms. Reads updated content from 02_adapted (or 03_published) and pushes changes via platform update APIs. Only works for pipeline articles with stored article_id.',
    inputSchema: jsonSchema(UpdateToolSchema),
  },
  'reach.rollback': {
    description: 'Move a specific article back one pipeline stage (e.g., from 03_published back to 02_adapted). Useful for re-adapting or re-publishing content.',
    inputSchema: jsonSchema(RollbackToolSchema),
  },
  'reach.refresh': {
    description: 'Copy a published or adapted article back to 01_drafts for re-editing. The original stays in place. Useful for updating and republishing old content.',
    inputSchema: jsonSchema(RefreshToolSchema),
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
  'reach.platforms': {
    description: 'List all available publishing platforms and whether they are configured with API keys. No inputs required.',
    inputSchema: jsonSchema(z.object({})),
  },
  'reach.series.init': {
    description: 'Scaffold a new series definition file.',
    inputSchema: jsonSchema(SeriesInitToolSchema),
  },
  'reach.series.outline': {
    description: 'AI-generate master outline and article plan for a series.',
    inputSchema: jsonSchema(SeriesOutlineToolSchema),
  },
  'reach.series.approve': {
    description: 'Approve master outline (--outline) or per-article detail outlines (--detail). Gate-controls series progression.',
    inputSchema: jsonSchema(SeriesApproveToolSchema),
  },
  'reach.series.detail': {
    description: 'AI-generate detailed outlines for each article in the series, based on the approved master outline.',
    inputSchema: jsonSchema(SeriesDetailToolSchema),
  },
  'reach.series.draft': {
    description: 'Draft the next unwritten article (or all with --all) based on approved outlines, with series context injection.',
    inputSchema: jsonSchema(SeriesDraftToolSchema),
  },
  'reach.series.adapt': {
    description: 'Batch-adapt all drafted articles in the series for target platforms.',
    inputSchema: jsonSchema(SeriesAdaptToolSchema),
  },
  'reach.series.schedule': {
    description: 'Auto-calculate and apply publish schedule dates based on start date and interval.',
    inputSchema: jsonSchema(SeriesScheduleToolSchema),
  },
  'reach.series.status': {
    description: 'Show series progress dashboard with per-article pipeline status.',
    inputSchema: jsonSchema(SeriesStatusToolSchema),
  },
  'reach.new': {
    description: 'Create a new project in the current workspace.',
    inputSchema: jsonSchema(NewProjectToolSchema),
  },
  'reach.init': {
    description: 'Initialize global config (~/.reach), or a workspace at the given path.',
    inputSchema: jsonSchema(InitToolSchema),
  },
  'reach.workspace': {
    description: 'Show workspace info and project list.',
    inputSchema: jsonSchema(WorkspaceToolSchema),
  },
  'reach.watch': {
    description: 'Start daemon to auto-publish due content. Use list/stop to manage daemons.',
    inputSchema: jsonSchema(WatchToolSchema),
  },
  'reach.mcp': {
    description: 'Launch reach as an MCP Server for AI agent integration.',
    inputSchema: jsonSchema(McpToolSchema),
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
      'reach.adapt': AdaptToolSchema,
      'reach.schedule': ScheduleToolSchema,
      'reach.publish': PublishToolSchema,
      'reach.go': GoToolSchema,
      'reach.refine': RefineToolSchema,
      'reach.update': UpdateToolSchema,
      'reach.rollback': RollbackToolSchema,
      'reach.refresh': RefreshToolSchema,
      'reach.asset.add': AssetAddToolSchema,
      'reach.asset.list': AssetListToolSchema,
      'reach.analytics': AnalyticsToolSchema,
      'reach.platforms': z.object({}),
      'reach.series.init': SeriesInitToolSchema,
      'reach.series.outline': SeriesOutlineToolSchema,
      'reach.series.approve': SeriesApproveToolSchema,
      'reach.series.detail': SeriesDetailToolSchema,
      'reach.series.draft': SeriesDraftToolSchema,
      'reach.series.adapt': SeriesAdaptToolSchema,
      'reach.series.schedule': SeriesScheduleToolSchema,
      'reach.series.status': SeriesStatusToolSchema,
      'reach.new': NewProjectToolSchema,
      'reach.init': InitToolSchema,
      'reach.workspace': WorkspaceToolSchema,
      'reach.watch': WatchToolSchema,
      'reach.mcp': McpToolSchema,
    };
    return schemaMap[moduleId];
  })(),
}));
