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

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'aphype_status',
    description: 'Check the dashboard status of the content pipeline — shows item counts per stage and due-today items',
    schema: StatusToolSchema,
  },
  {
    name: 'aphype_draft',
    description: 'Generate an AI draft from a source in 01_inbox. The source can be a file or directory.',
    schema: DraftToolSchema,
  },
  {
    name: 'aphype_adapt',
    description: 'Generate multi-platform adapted versions from a master draft in 03_master',
    schema: AdaptToolSchema,
  },
  {
    name: 'aphype_schedule',
    description: 'Schedule an adapted article for publishing on a specific date',
    schema: ScheduleToolSchema,
  },
  {
    name: 'aphype_publish',
    description: 'Publish all scheduled content due for today to configured platforms',
    schema: PublishToolSchema,
  },
  {
    name: 'aphype_rollback',
    description: 'Move a project back one pipeline stage (e.g., from scheduled to adapted)',
    schema: RollbackToolSchema,
  },
];
