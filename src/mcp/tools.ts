import { z } from 'zod';

export const StatusToolSchema = z.object({});

export const DraftToolSchema = z.object({
  source: z.string().min(1).describe('Name of the source file/directory in 01_inbox'),
});

export const AdaptToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 03_master'),
  platforms: z.string().optional().describe('Comma-separated platform list (e.g., x,devto,wechat)'),
  force: z.boolean().optional().describe('Overwrite existing platform versions'),
});

export const ScheduleToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 04_adapted'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format').describe('Publish date'),
});

export const PublishToolSchema = z.object({
  dryRun: z.boolean().optional().describe('Preview without actually publishing'),
});

export const RollbackToolSchema = z.object({
  project: z.string().min(1).describe('Name of the project to roll back'),
});

export const ApproveToolSchema = z.object({
  article: z.string().min(1).describe('Name of the article in 02_drafts to promote to master'),
});

export const AssetAddToolSchema = z.object({
  file: z.string().min(1).describe('Path to the media file to register'),
  subdir: z.enum(['images', 'videos', 'audio']).optional().describe('Asset subdirectory (auto-detected from extension if omitted)'),
});

export const AssetListToolSchema = z.object({
  subdir: z.enum(['images', 'videos', 'audio']).optional().describe('Filter by asset subdirectory'),
});

export const AnalyticsToolSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter from date (YYYY-MM-DD)'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter to date (YYYY-MM-DD)'),
});

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'reach_status',
    description: 'Check the dashboard status of the content pipeline — shows item counts per stage and due-today items',
    schema: StatusToolSchema,
  },
  {
    name: 'reach_draft',
    description: 'Generate an AI draft from a source in 01_inbox. The source can be a file or directory.',
    schema: DraftToolSchema,
  },
  {
    name: 'reach_adapt',
    description: 'Generate multi-platform adapted versions from a master draft in 03_master',
    schema: AdaptToolSchema,
  },
  {
    name: 'reach_schedule',
    description: 'Schedule an adapted article for publishing on a specific date',
    schema: ScheduleToolSchema,
  },
  {
    name: 'reach_publish',
    description: 'Publish all scheduled content due for today to configured platforms',
    schema: PublishToolSchema,
  },
  {
    name: 'reach_rollback',
    description: 'Move a project back one pipeline stage (e.g., from scheduled to adapted)',
    schema: RollbackToolSchema,
  },
  {
    name: 'reach_approve',
    description: 'Promote a draft from 02_drafts to 03_master, renaming draft.md to master.md',
    schema: ApproveToolSchema,
  },
  {
    name: 'reach_asset_add',
    description: 'Register a media file (image, video, audio) into the project asset library',
    schema: AssetAddToolSchema,
  },
  {
    name: 'reach_asset_list',
    description: 'List all registered assets in the project, optionally filtered by type',
    schema: AssetListToolSchema,
  },
  {
    name: 'reach_analytics',
    description: 'Show publishing analytics — success rates by platform with optional date filtering',
    schema: AnalyticsToolSchema,
  },
];
